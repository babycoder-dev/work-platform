#!/usr/bin/env node
// PreToolUse(Write|Edit) hook: 在写入业务模块文件的那一刻，拦住"跨业务模块内部
// 依赖"这类边界违规——补齐 eslint @nx/enforce-module-boundaries "事后才报"的
// 时间差，给即时反馈。
//
// 背景：AGENTS.md / 各模块 CLAUDE.md 规定，modules/<X> 只能依赖：自己的包
// (`@work/<X>-*`)、packages/*（含 platform-sdk / platform-contract 等共享层）；
// 不得依赖另一个业务模块的内部实现，也不得跨 schema。eslint 已用 depConstraints
// 强约束，但要等 lint 才报；本 hook 在编辑当下就提示。
//
// 高精度优先（避免误报）：不靠包名前缀猜归属（那会把 packages/ 里的
// @work/platform-sdk、@work/platform-contract 误当成 platform 模块），而是扫描
// modules/*/*/package.json 建立"真实业务模块包名 → 所属模块"映射，只对两类
// 几乎必然是真 bug 的信号出手：
//   1) import 的 @work 包确实属于另一个业务模块；
//   2) 相对路径 (../../<other>/...) 爬进另一个业务模块目录。
// 用 permissionDecision:"ask"（不是硬 deny）：弹窗让用户定夺，误判可一键放行。
// 任何异常或非模块文件一律放行(allow)。

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

function readStdin(stream) {
  return new Promise((resolve) => {
    let data = '';
    stream.on('data', (c) => (data += c));
    stream.on('end', () => resolve(data));
    stream.on('error', () => resolve(''));
  });
}

const allow = () => process.exit(0); // 无输出 = 放行

function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

const repo = process.cwd();

// 扫描 modules/<mod>/<sub>/package.json，得到 { 包名: 所属模块 }。
// 只有真实存在于 modules/ 下的包才算"业务模块内部"，packages/ 下的共享包不在内。
function buildModulePackageMap() {
  const map = new Map();
  const root = path.join(repo, 'modules');
  let mods;
  try {
    mods = readdirSync(root, { withFileTypes: true });
  } catch {
    return map;
  }
  for (const mod of mods) {
    if (!mod.isDirectory()) continue;
    let subs;
    try {
      subs = readdirSync(path.join(root, mod.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sub of subs) {
      if (!sub.isDirectory()) continue;
      try {
        const pkg = JSON.parse(
          readFileSync(path.join(root, mod.name, sub.name, 'package.json'), 'utf8'),
        );
        if (pkg?.name) map.set(pkg.name, mod.name);
      } catch {
        // 没有 package.json 或解析失败：跳过。
      }
    }
  }
  return map;
}

const raw = await readStdin(process.stdin);

let payload = {};
try {
  payload = JSON.parse(raw || '{}');
} catch {
  allow();
}

const input = payload.tool_input || {};
const file = input.file_path;
if (!file) allow();

const abs = path.resolve(repo, file);
const rel = path.relative(repo, abs).split(path.sep).join('/');

// 只管 modules/<X>/ 下的文件；其它一律放行。
const m = rel.match(/^modules\/([^/]+)\//);
if (!m) allow();
const self = m[1];

const pkgMap = buildModulePackageMap();
// 当前模块在 modules/ 下确实存在才继续（否则无从判定，放行）。
if (![...pkgMap.values()].includes(self)) allow();

// 取"即将写入"的文本：Write 用 content；Edit 用 new_string；MultiEdit 拼所有 new_string。
let text = '';
if (typeof input.content === 'string') {
  text = input.content;
} else if (typeof input.new_string === 'string') {
  text = input.new_string;
} else if (Array.isArray(input.edits)) {
  text = input.edits.map((e) => e?.new_string || '').join('\n');
}
if (!text) allow();

// 收集 import/require/from 里的模块说明符。
const specifiers = [];
const re =
  /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
let mm;
while ((mm = re.exec(text)) !== null) {
  specifiers.push(mm[1] || mm[2] || mm[3]);
}
if (specifiers.length === 0) allow();

const violations = [];

for (const spec of specifiers) {
  // 1) import 的包确实属于另一个业务模块。
  const owner = pkgMap.get(spec);
  if (owner && owner !== self) {
    violations.push(`${spec}（属于业务模块 ${owner}）`);
    continue;
  }
  // 2) 相对路径解析后落在另一个业务模块目录里。
  if (spec.startsWith('.')) {
    const target = path
      .relative(repo, path.resolve(path.dirname(abs), spec))
      .split(path.sep)
      .join('/');
    const tm = target.match(/^modules\/([^/]+)\//);
    if (tm && tm[1] !== self && [...pkgMap.values()].includes(tm[1])) {
      violations.push(`${spec}（相对路径指向业务模块 ${tm[1]}）`);
    }
  }
}

if (violations.length === 0) allow();

const reason = [
  `模块边界检查：modules/${self}/ 的文件正在依赖另一个业务模块的内部实现：`,
  ...violations.map((v) => `  - ${v}`),
  '',
  `规则（AGENTS.md / modules/${self}/CLAUDE.md）：业务模块只能依赖自己的包`,
  `(@work/${self}-*)、packages/*（含 platform-sdk / platform-contract 等共享层）；`,
  '跨模块只能走公开 API / URL / 领域事件 (@work/event-bus)，不得直接 import 或',
  '跨 schema。eslint 也会在 lint 阶段报同样的错。',
  '',
  '若这确实是误判（例如文件被移动、或这是允许的共享层），可放行继续。',
].join('\n');

ask(reason);
