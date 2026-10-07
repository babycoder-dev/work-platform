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

const VALIDATION_HEADING_RE = /^\*\*.*(validation|验证).*\*\*\s*$/i;
const ANY_BOLD_HEADING_RE = /^\*\*.+\*\*\s*$/;
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;
const COMMAND_RE = /\b(pnpm|npm|node|git|docker|corepack|npx|tsx)\b/;
const OUTCOME_RE = /(pass|fail|exit\s*=?\s*\d|skipped|ok\b|通过|失败|跳过|全绿|绿)/i;

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

/** 取某个粗体小节的行（到下一个粗体小节或条目末尾为止）。 */
function section(body, isTarget) {
  const start = body.findIndex((l) => isTarget(l.trim()));
  if (start === -1) return null;
  let end = body.length;
  for (let i = start + 1; i < body.length; i++) {
    if (ANY_BOLD_HEADING_RE.test(body[i].trim())) {
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
    const bullets = section(entry.body, (l) => VALIDATION_HEADING_RE.test(l));

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
    const evidence = bullets.filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));
    if (evidence.length === 0) {
      violations.push({
        line: entry.line,
        heading: entry.heading,
        reason: 'Validation 小节没有条目化的证据（需要至少一条 "- `命令`：结果"）',
      });
      continue;
    }
    if (!evidence.some((l) => COMMAND_RE.test(l))) {
      violations.push({
        line: entry.line,
        heading: entry.heading,
        reason: 'Validation 小节没有任何命令（需要贴出实际执行的命令，如 pnpm/git/docker/node）',
      });
    }
    if (!OUTCOME_RE.test(bullets.join('\n'))) {
      violations.push({
        line: entry.line,
        heading: entry.heading,
        reason: 'Validation 小节没有结果标记（pass/fail/exit N/通过/失败 等，便于复核）',
      });
    }
  }

  return { violations, inScope, legacy, legacyCompliant };
}

export const __testing = { COMMAND_RE, OUTCOME_RE, VALIDATION_HEADING_RE };
