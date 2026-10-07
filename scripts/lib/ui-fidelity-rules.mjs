// UI 设计还原度门禁 · A 类规则（纯函数，无 I/O）
//
// 规则出处：docs/development-workflow.md §7「A 类」与 docs/agent-workflow.md §2。
// 单独成模块是为了让规则本身可被单测覆盖——门禁自身也要有守卫
// （见 scripts/lib/ui-fidelity-rules.spec.mjs；vitest.config.mts 已收集该目录）。

/** 唯一允许出现 hex 的位置（token 真源）。 */
export const HEX_ALLOWED = ['packages/ui/src/styles/tokens.css'];

/** A2 例外：文本勾叉（常用于日志/注释），不算「emoji 当图标」。 */
const EMOJI_ALLOWED = new Set(['\u2713', '\u2714', '\u2717', '\u2718']);

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

/** A4 覆盖的属性 → 人类可读分组。 */
export const TOKEN_ONLY_PROPS = [
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

// 覆盖全部 CSS 长度/百分比单位：只认 px/rem/em 会让 vw / vh / ch / % 之类的裸值绕过规则。
const LENGTH_TOKEN_RE =
  /(-?\d*\.?\d+)(px|rem|em|ex|ch|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|cm|mm|q|in|pc|pt|%)/gi;

function push(out, rel, line, col, rule, message) {
  out.push({ rel, line, col, rule, message });
}

function checkA1(rel, lineNo, line, out) {
  if (HEX_ALLOWED.includes(rel)) return;
  for (const match of line.matchAll(HEX_RE)) {
    push(
      out,
      rel,
      lineNo,
      match.index + 1,
      'A1',
      `硬编码颜色 ${match[0]}；颜色只能引 var(--*)，token 真源是 packages/ui/src/styles/tokens.css`,
    );
  }
}

function checkA2(rel, lineNo, line, out) {
  for (const match of line.matchAll(EMOJI_RE)) {
    if (EMOJI_ALLOWED.has(match[0])) continue;
    push(
      out,
      rel,
      lineNo,
      match.index + 1,
      'A2',
      `出现 emoji「${match[0]}」；图标必须用 @work/ui 的线性 Icon，不得用 emoji 占位`,
    );
  }
}

/** A4 只作用于 CSS 声明（`prop: value`）；零值（0 / 0px / 0%）豁免。 */
function checkA4(rel, lineNo, line, out) {
  if (rel.endsWith('tokens.css')) return;
  // 把 { } 视作分隔符后按 ; 切块，这样「一行一个声明」与「整条规则写在一行」都能解析
  // （早先版本把正则锚在行首，`.a { padding: 13px; }` 会被整条漏掉）。
  for (const chunk of line.replace(/[{}]/g, ';').split(';')) {
    const decl = /^\s*([a-z-]+)\s*:\s*(.+?)\s*$/.exec(chunk);
    if (!decl) continue;
    const [, prop, value] = decl;
    const group = TOKEN_ONLY_PROPS.find(([re]) => re.test(prop.toLowerCase()));
    if (!group) continue;
    for (const match of value.matchAll(LENGTH_TOKEN_RE)) {
      if (Number(match[1]) === 0) continue;
      push(
        out,
        rel,
        lineNo,
        Math.max(1, line.indexOf(value) + 1),
        'A4',
        `${group[1]}属性 ${prop} 写了裸值 ${match[0]}；须引 token（--sp-*、--r-*、--shadow-*、--font*）`,
      );
      return; // 每行只报一次，避免刷屏
    }
  }
}

/** 对单个文件内容执行 A1/A2/A4，返回违规数组。 */
export function lintText(rel, text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    checkA1(rel, lineNo, line, out);
    checkA2(rel, lineNo, line, out);
    if (rel.endsWith('.css')) checkA4(rel, lineNo, line, out);
  }
  return out;
}

/** A 类扫描范围：apps 下各 app 的 src、modules 下各模块的 web/src、packages/ui/src。 */
export function inScope(rel) {
  if (rel.startsWith('packages/ui/src/')) return true;
  if (/^apps\/[^/]+\/src\//.test(rel)) return true;
  if (/^modules\/[^/]+\/web\/src\//.test(rel)) return true;
  return false;
}
