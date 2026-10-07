#!/usr/bin/env node
// UI 设计还原度门禁 · A 类（可机器核验部分）
//
// 把 docs/development-workflow.md §7 里"A 类 · 实现方交付前必须自证"的条目
// 变成**会红的检查**，而不是靠实现方（人或代理）宣称。规则出处见该节与
// docs/tasks/ui-foundation-fidelity.md §2。
//
// 覆盖（当前）：
//   A1 零硬编码 hex：UI 源码里的颜色只能引 var(--*)，唯一允许出现 hex 的位置是
//      packages/ui/src/styles/tokens.css（token 唯一真源）。
//   A2 零 emoji 当图标：图标一律用线性 SVG（@work/ui 的 Icon），不得用 emoji 占位。
//   A4 只引 token：间距/圆角/阴影/字体（padding|margin|gap|border-radius|box-shadow|
//      font|font-size）不得写裸 px/rem/em 字面量，须引 token 变量
//      （--sp-*、--r-*、--shadow-*、--font*）。
//
// 不在本脚本范围（有意）：A3（关键文案逐字一致）由 *.spec.tsx 的断言承担；
// B 类人工抽查不可机器化；letter-spacing / line-height / transform 等属性暂不在
// A4 列表内（其取值口径待定，见 docs/agent-workflow.md 的 follow-up）。
//
// 设计取舍：纯文件系统遍历，**不 spawn 子进程**（不调用 git/eslint），因此
// 在受限沙箱与 CI 里行为一致，也不受工作区 git 状态影响。
//
// 用法：node scripts/check-ui-fidelity.mjs [--verbose]
// 退出码：0 = 通过；1 = 有违规。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

// 唯一允许出现 hex 的位置（token 真源）。
const HEX_ALLOWED = ['packages/ui/src/styles/tokens.css'];

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

// A2 例外：这几个字符是文本勾叉（常用于日志/注释），不是"emoji 当图标"。
const EMOJI_ALLOWED = new Set(['\u2713', '\u2714', '\u2717', '\u2718']);

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

// A4 覆盖的属性 → 说明用的人类可读分组。
const TOKEN_ONLY_PROPS = [
  [/^(padding|margin)(-top|-right|-bottom|-left)?$/, '间距'],
  [/^(row-)?gap$/, '间距'],
  [/^column-gap$/, '间距'],
  [/^border-radius$/, '圆角'],
  [/^border-(top|bottom)-(left|right)-radius$/, '圆角'],
  [/^box-shadow$/, '阴影'],
  [/^font$/, '字体'],
  [/^font-family$/, '字体'],
  [/^font-size$/, '字体'],
];
const LENGTH_RE = /\b\d*\.?\d+(px|rem|em)\b/;

/** A 类扫描范围：apps 下各 app 的 src、modules 下各模块的 web/src、packages/ui/src。 */
function inScope(rel) {
  if (rel.startsWith('packages/ui/src/')) return true;
  if (/^apps\/[^/]+\/src\//.test(rel)) return true;
  if (/^modules\/[^/]+\/web\/src\//.test(rel)) return true;
  return false;
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
    const abs = path.join(dir, entry.name);
    if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    out.push(abs);
  }
  return out;
}

/** 收集扫描根：三个范围各自的父目录，避免整仓遍历。 */
function scanRoots() {
  const roots = [];
  const appsDir = path.join(REPO, 'apps');
  for (const name of readdirSync(appsDir, { withFileTypes: true })) {
    if (name.isDirectory() && !SKIP_DIRS.has(name.name)) {
      const src = path.join(appsDir, name.name, 'src');
      if (isDir(src)) roots.push(src);
    }
  }
  const modulesDir = path.join(REPO, 'modules');
  for (const name of readdirSync(modulesDir, { withFileTypes: true })) {
    if (name.isDirectory() && !SKIP_DIRS.has(name.name)) {
      const src = path.join(modulesDir, name.name, 'web', 'src');
      if (isDir(src)) roots.push(src);
    }
  }
  const uiSrc = path.join(REPO, 'packages', 'ui', 'src');
  if (isDir(uiSrc)) roots.push(uiSrc);
  return roots;
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

const violations = [];
function report(rel, line, col, rule, message, snippet) {
  violations.push({ rel, line, col, rule, message, snippet });
}

/** 逐行扫描，返回 [lineNumber, lineText]。 */
function* lines(text) {
  const parts = text.split(/\r?\n/);
  for (let i = 0; i < parts.length; i++) yield [i + 1, parts[i]];
}

function checkA1(rel, lineNo, line) {
  if (HEX_ALLOWED.includes(rel)) return;
  for (const match of line.matchAll(HEX_RE)) {
    report(
      rel,
      lineNo,
      match.index + 1,
      'A1',
      `硬编码颜色 ${match[0]}；颜色只能引 var(--*)，token 真源是 packages/ui/src/styles/tokens.css`,
      line.trim(),
    );
  }
}

function checkA2(rel, lineNo, line) {
  for (const match of line.matchAll(EMOJI_RE)) {
    if (EMOJI_ALLOWED.has(match[0])) continue;
    report(
      rel,
      lineNo,
      match.index + 1,
      'A2',
      `出现 emoji「${match[0]}」；图标必须用 @work/ui 的线性 Icon，不得用 emoji 占位`,
      line.trim(),
    );
  }
}

/** A4 只作用于 CSS 声明行（`prop: value;`）。 */
function checkA4(rel, lineNo, line) {
  if (rel.endsWith('tokens.css')) return;
  const decl = /^\s*([a-z-]+)\s*:\s*([^;{]+);/i.exec(line);
  if (!decl) return;
  const [, prop, value] = decl;
  const group = TOKEN_ONLY_PROPS.find(([re]) => re.test(prop.toLowerCase()));
  if (!group) return;
  const literal = LENGTH_RE.exec(value);
  if (!literal) return;
  report(
    rel,
    lineNo,
    line.indexOf(value) + 1,
    'A4',
    `${group[1]}属性 ${prop} 写了裸长度 ${literal[0]}；须引 token（--sp-*/--r-*/--shadow-*/--font*）`,
    line.trim(),
  );
}

const roots = scanRoots();
const files = [];
for (const root of roots) walk(root, files);

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
  for (const [lineNo, line] of lines(text)) {
    checkA1(rel, lineNo, line);
    checkA2(rel, lineNo, line);
    if (rel.endsWith('.css')) checkA4(rel, lineNo, line);
  }
}

if (VERBOSE) {
  console.log(`扫描 ${scanned} 个文件（A 类范围：apps/*/src、modules/*/web/src、packages/ui/src）`);
}

if (violations.length === 0) {
  console.log(`UI 还原度 A 类门禁：通过（${scanned} 个文件，A1/A2/A4 均无违规）`);
  process.exit(0);
}

for (const v of violations) {
  console.log(`${v.rel}:${v.line}:${v.col}  [${v.rule}] ${v.message}`);
  if (VERBOSE) console.log(`    ${v.snippet}`);
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
