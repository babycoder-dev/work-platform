#!/usr/bin/env node
// UI 设计还原度门禁 · A 类（可机器核验部分）— CLI
//
// 把 docs/development-workflow.md §7 里「A 类 · 实现方交付前必须自证」的条目
// 变成**会红的检查**，而不是靠实现方（人或代理）宣称。
//
// 规则实现见 scripts/lib/ui-fidelity-rules.mjs（纯函数，可单测）；本文件只负责
// 遍历文件、打印违规、给退出码。
//
// 覆盖：A1 零硬编码 hex / A2 零 emoji 当图标 / A4 间距·圆角·阴影·字体只引 token。
// 不在范围（有意）：A3 由 *.spec.tsx 的断言承担；B 类人工抽查不可机器化；
// letter-spacing / line-height / transform 与 TSX 内联样式不在 A4 内。
//
// 设计取舍：纯文件系统遍历，**不 spawn 子进程**（不调用 git/eslint），因此在受限
// 沙箱、CI 与不同开发机上行为一致，也不受工作区 git 状态影响。
//
// 用法：node scripts/check-ui-fidelity.mjs [--verbose]
// 退出码：0 = 通过；1 = 有违规。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { inScope, lintText } from './lib/ui-fidelity-rules.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.nx',
  '.turbo',
  '.vite',
  'worktrees',
]);

const EXTENSIONS = new Set(['.css', '.ts', '.tsx', '.html']);

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

/** 收集扫描根，避免整仓遍历（node_modules 等一律不进）。 */
function scanRoots() {
  const roots = [];
  const appsDir = path.join(REPO, 'apps');
  for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      const src = path.join(appsDir, entry.name, 'src');
      if (isDir(src)) roots.push(src);
    }
  }
  const modulesDir = path.join(REPO, 'modules');
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      const src = path.join(modulesDir, entry.name, 'web', 'src');
      if (isDir(src)) roots.push(src);
    }
  }
  const uiSrc = path.join(REPO, 'packages', 'ui', 'src');
  if (isDir(uiSrc)) roots.push(uiSrc);
  return roots;
}

const files = [];
for (const root of scanRoots()) walk(root, files);

const violations = [];
let scanned = 0;
for (const abs of files) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  if (!inScope(rel)) continue;
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  scanned++;
  violations.push(...lintText(rel, text));
}

if (VERBOSE) {
  console.log(
    `扫描 ${scanned} 个文件（A 类范围：apps 各 app 的 src、modules 各模块的 web/src、packages/ui/src）`,
  );
}

if (violations.length === 0) {
  console.log(`UI 还原度 A 类门禁：通过（${scanned} 个文件，A1/A2/A4 均无违规）`);
  process.exit(0);
}

for (const v of violations) {
  console.log(`${v.rel}:${v.line}:${v.col}  [${v.rule}] ${v.message}`);
}

const byRule = violations.reduce((acc, v) => {
  acc[v.rule] = (acc[v.rule] || 0) + 1;
  return acc;
}, {});
console.log(
  `UI 还原度 A 类门禁：失败，${violations.length} 处违规（${Object.entries(byRule)
    .map(([rule, n]) => `${rule}=${n}`)
    .join(' ')}）`,
);
console.log('规则与边界见 docs/development-workflow.md §7；设计真源见 docs/design/ui-handoff/。');
process.exit(1);
