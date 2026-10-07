#!/usr/bin/env node
// "不要在 main 上干活"门禁 — CLI
//
// 规则与动机见 scripts/lib/branch-rules.mjs（含"为什么不是 git pre-commit hook"的说明）。
//
// 只在本地 main 分支上判定：有未提交改动或未推送提交即失败；CI 的 detached HEAD 与非 main 分支跳过。
//
// 用法：node scripts/check-branch.mjs [--verbose]
// 退出码：0 = 通过（或无需判定）；1 = 在 main 上还有活没搬走。

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { assess } from './lib/branch-rules.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

function git(args) {
  const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8', timeout: 30_000 });
  return result.status === 0 ? (result.stdout ?? '').trim() : null;
}

const branchRaw = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const detached = branchRaw === null || branchRaw === 'HEAD';

let dirty = false;
let ahead = 0;
if (!detached && branchRaw === 'main') {
  const status = git(['status', '--porcelain']) ?? '';
  // 只算已跟踪文件的改动（?? 未跟踪的临时产物不算"在 main 上干活"）。
  dirty = status
    .split(/\r?\n/)
    .filter(Boolean)
    .some((line) => !line.startsWith('??'));
  const count = git(['rev-list', '--count', 'origin/main..HEAD']);
  ahead = count === null ? 0 : Number(count) || 0;
}

const problems = assess({ branch: branchRaw ?? 'HEAD', detached, dirty, ahead });

if (problems.length === 0) {
  const scope = detached ? 'detached HEAD（CI），跳过' : `当前分支 ${branchRaw}`;
  console.log(`分支门禁：通过（${scope}；未提交改动=${dirty}，未推送提交=${ahead}）`);
  process.exit(0);
}

for (const problem of problems) {
  console.log(`[B1] ${problem}`);
}
console.log('分支门禁：失败。main 受远端保护，本地同样走分支 + PR。');
if (VERBOSE) console.log('（若确有例外，先切到分支再继续；不要用 --no-verify 之类的绕过方式。）');
process.exit(1);
