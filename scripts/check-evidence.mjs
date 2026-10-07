#!/usr/bin/env node
// 证据纪律门禁 — CLI
//
// 校验 docs/verification-log.md 中**生效起点之后**的条目是否具备证据形式：
// 有 Validation/验证 小节，且其中至少一条「命令 + 结果」。
//
// 这是**形式门禁，不是真伪门禁**：它无法判断命令是否真的跑过。真伪靠人复核；
// 本门禁只保证「记录里有可复核的东西可查」，取代此前 PR 模板里毫无约束力的勾选框。
//
// 为什么不追溯历史：2026-10 之前 48 条条目只有 5 条带 Validation 小节，一刀切会让门禁
// 一上来就红 43 条，从而被绕过。CLI 会把历史合规率打印出来（可见、不阻断）。
//
// 用法：node scripts/check-evidence.mjs [--verbose]
// 退出码：0 = 通过；1 = 生效起点之后的条目不合格。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CUTOFF, lintLog } from './lib/evidence-rules.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const LOG = path.join(REPO, 'docs', 'verification-log.md');
const VERBOSE = process.argv.includes('--verbose');

let text;
try {
  text = readFileSync(LOG, 'utf8');
} catch (error) {
  console.error(`无法读取 docs/verification-log.md：${error.message}`);
  process.exit(1);
}

const { violations, inScope, legacy, legacyCompliant } = lintLog(text);

const legacyPct = legacy === 0 ? 0 : Math.round((legacyCompliant / legacy) * 100);
if (VERBOSE || violations.length > 0) {
  console.log(
    `生效起点 ${CUTOFF}：受约束条目 ${inScope} 条；历史条目 ${legacy} 条（其中 ${legacyCompliant} 条已符合形式，${legacyPct}%）`,
  );
}

if (violations.length === 0) {
  console.log(`证据形式门禁：通过（生效起点后 ${inScope} 条条目均含 Validation 小节与「命令 + 结果」）`);
  process.exit(0);
}

for (const v of violations) {
  console.log(`docs/verification-log.md:${v.line}  [E1] ${v.heading} — ${v.reason}`);
}
console.log(
  `证据形式门禁：失败，${violations.length} 处不合格（生效起点 ${CUTOFF}）。` +
    '写法见 docs/agent-workflow.md §2；本条只校验形式，真伪仍需人工复核。',
);
process.exit(1);
