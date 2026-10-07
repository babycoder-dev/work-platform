#!/usr/bin/env node
// Stop hook: 当本会话产生了未提交的源码改动、且尚未提醒过时，在 Claude 准备
// 结束时温和提醒一次：
//   1) 是否已跑交付门禁 `pnpm verify`（lint+typecheck+test+e2e+build）；
//   2) 是否该把经验/踩坑沉淀回 CLAUDE.md，或在 docs/verification-log.md 追加
//      验收记录、更新 docs/foundation-progress.md。
//
// 对应 Claude Code 大型代码库最佳实践里 stop hook 的定位：趁上下文新鲜做
// "持续改进"，而非事后补救；同时给"没跑 verify 就宣称完成"上一道保险。
//
// 防打扰 / 防死循环（三重保险）：
//   - 只在 apps/ modules/ packages/ 有未提交改动时才触发；
//   - 每个会话(session_id)最多提醒一次，用 os.tmpdir() 标记文件去重；
//   - 收到 stop_hook_active=true 直接放行。
// 任何异常一律放行(exit 0 且无输出)，绝不卡住会话结束。
//
// 机制：Stop hook 用 stdout 输出 {decision:"block", reason} 才能把提醒喂回
// Claude 让其再补一轮；不输出即放行。与其它 hook 一致：不用 jq，用 Node 解析。

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readStdin(stream) {
  return new Promise((resolve) => {
    let data = '';
    stream.on('data', (c) => (data += c));
    stream.on('end', () => resolve(data));
    stream.on('error', () => resolve(''));
  });
}

const allow = () => process.exit(0); // 无输出 = 允许结束

const raw = await readStdin(process.stdin);

let payload = {};
try {
  payload = JSON.parse(raw || '{}');
} catch {
  allow();
}

// 1) 已经因上次 block 而续跑：放行，杜绝死循环。
if (payload.stop_hook_active) allow();

const repo = process.cwd();

// 2) 本会话是否已提醒过（按 session_id 去重，标记文件放在系统临时目录）。
const sessionId = String(payload.session_id || '').replace(/[^a-zA-Z0-9_-]/g, '');
const marker = sessionId ? path.join(os.tmpdir(), `claude-stop-reminded-${sessionId}`) : null;
if (marker && existsSync(marker)) allow();

// 3) 是否存在 apps/ modules/ packages/ 下的未提交改动。
const git = spawnSync('git', ['status', '--porcelain'], {
  cwd: repo,
  encoding: 'utf8',
  timeout: 5000,
});
if (git.status !== 0 || !git.stdout) allow();

const dirtySource = git.stdout
  .split(/\r?\n/)
  .some((line) => /\b(apps|modules|packages)\//.test(line));
if (!dirtySource) allow();

// 触发提醒：先落标记（本会话此后不再提醒），再 block 一次。
try {
  if (marker) writeFileSync(marker, new Date().toISOString());
} catch {
  // 标记写不进去也无所谓，stop_hook_active 仍能防循环。
}

const reason = [
  '检测到 apps/ modules/ packages/ 有未提交改动。结束前请确认（本会话仅提醒一次）：',
  '',
  '1. 是否已运行交付门禁 `pnpm verify`（lint+typecheck+test+e2e+build）？',
  '   若改动涉及 DB 则还需 `pnpm verify:full`，涉及部署则还需 `pnpm docker:build`。',
  '   若尚未运行却要宣称完成，请先运行并贴出真实结果（evidence before assertions）。',
  '2. 是否有值得沉淀的经验/踩坑该写回 CLAUDE.md？本切片是否需要在',
  '   `docs/verification-log.md` 追加验收记录、并更新 `docs/foundation-progress.md`？',
  '',
  '若以上都已完成或不适用，简要说明后即可结束，无需重复劳动。',
].join('\n');

process.stdout.write(JSON.stringify({ decision: 'block', reason }));
process.exit(0);
