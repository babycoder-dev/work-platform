// 证据纪律的机器校验 · 规则（纯函数，无 I/O）
//
// 立意：docs/agent-workflow.md §1 第一原则「承诺必须落到会红的检查上」。
// 本规则**只校验形式**（条目是否有 Validation 小节、是否贴了命令与结果），
// **不校验真伪**——真伪只能靠人复核。把这点写清楚，避免把形式门禁当成绩效门禁。
//
// 为什么不追溯历史：2026-10 之前 48 条条目里只有 5 条带 Validation 小节，
// 一刀切会让门禁一上来就红 43 条，进而被绕过或删除。故设定生效起点，只约束新条目，
// 历史合规率由 CLI 如实打印（可见、但不阻断）。

/** 该日期（含）之后的条目必须满足证据形式。 */
export const CUTOFF = '2026-10-01';

// 小节标题：接受粗体 `**Validation**`，也接受标准 Markdown 标题 `### Validation` / `#### 验证`
// （Codex P2：只认粗体会让"看起来合规"的写法被 CI 拒绝，而文档并未规定必须用粗体）。
const VALIDATION_HEADING_RE = (l) =>
  /^\*\*.*(validation|验证).*\*\*\s*$/i.test(l) || /^#{1,6}\s*.*(validation|验证).*/i.test(l);
const SECTION_BOUNDARY_RE = /^(\*\*.+\*\*|#{1,6}\s.*)$/;
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;
const COMMAND_RE = /\b(pnpm|npm|node|git|docker|corepack|npx|tsx)\b/;
// 结果标记：`pass` 必须独立成词，否则 "bypass" 会误命中（Codex P2 给的反例）。
const OUTCOME_RE = /(exit\s*=?\s*\d+|\bpass(ed)?\b|\bfail(ed|ure)?\b|\bskipped\b|\bok\b|通过|失败|跳过|全绿|绿)/i;

/**
 * 把 markdown 按 `## ` 切成条目。
 * @returns {{ heading: string, date: string | null, body: string[], line: number }[]}
 */
export function parseEntries(text) {
  const lines = text.split(/\r?\n/);
  const starts = [];
  lines.forEach((line, i) => {
    if (/^##\s/.test(line)) starts.push(i);
  });
  return starts.map((start, k) => {
    const heading = lines[start].trim();
    const end = starts[k + 1] ?? lines.length;
    const dateMatch = DATE_RE.exec(heading);
    return {
      heading,
      date: dateMatch ? dateMatch[1] : null,
      body: lines.slice(start, end),
      line: start + 1,
    };
  });
}

/** 取某个小节的行（到下一个粗体小节或 Markdown 标题为止）。 */
function section(body, isTarget) {
  const start = body.findIndex((l) => isTarget(l.trim()));
  if (start === -1) return null;
  let end = body.length;
  for (let i = start + 1; i < body.length; i++) {
    if (SECTION_BOUNDARY_RE.test(body[i].trim())) {
      end = i;
      break;
    }
  }
  return body.slice(start + 1, end);
}

/**
 * 校验整篇 verification log。
 * @returns {{ violations: {line:number, heading:string, reason:string}[], inScope: number, legacy: number, legacyCompliant: number }}
 */
export function lintLog(text) {
  const entries = parseEntries(text);
  const violations = [];
  let inScope = 0;
  let legacy = 0;
  let legacyCompliant = 0;

  for (const entry of entries) {
    const isScoped = entry.date !== null && entry.date >= CUTOFF;
    const bullets = section(entry.body, (l) => VALIDATION_HEADING_RE(l));

    if (!isScoped) {
      legacy++;
      if (bullets) legacyCompliant++;
      continue;
    }

    inScope++;
    if (!bullets) {
      violations.push({
        line: entry.line,
        heading: entry.heading,
        reason: `条目缺 Validation/验证 小节（生效起点 ${CUTOFF} 之后必须写：跑了什么、结果如何）`,
      });
      continue;
    }
    const evidence = bullets.filter((l) => /^\s*[-*]\s/.test(l));
    if (evidence.length === 0) {
      violations.push({
        line: entry.line,
        heading: entry.heading,
        reason: 'Validation 小节没有条目化的证据（需要至少一条 "- `命令`：结果"）',
      });
      continue;
    }
    // 命令与结果必须在**同一条**证据里：早先版本允许命令出现在一条、结果出现在另一条，
    // 于是 `- \`pnpm\` is installed; bypass is intentional.` 也能通过（Codex P2 给的反例）。
    if (!evidence.some((l) => COMMAND_RE.test(l) && OUTCOME_RE.test(l))) {
      violations.push({
        line: entry.line,
        heading: entry.heading,
        reason:
          '没有任何一条证据同时包含「命令 + 结果」（例如 "- `pnpm verify`: pass (exit 0)"；' +
          '命令与结果分处两条不算）',
      });
    }
  }

  return { violations, inScope, legacy, legacyCompliant };
}

export const __testing = { COMMAND_RE, OUTCOME_RE, VALIDATION_HEADING_RE };
