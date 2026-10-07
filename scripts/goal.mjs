#!/usr/bin/env node
// 长任务（goal）纪律 — CLI
//
// 用途与规则见 docs/agent-workflow.md §4；纯规则在 scripts/lib/goal-rules.mjs（可单测）。
// 本文件只负责读写 docs/goal/<id>.md、打印结果、给退出码。
//
// 它存在的意义是**让纪律可执行**，而不是再写一段约定：最典型的是 `block` ——
// 同一阻塞未连续 ≥3 轮时会被**直接拒绝**，你无法用一句"遇到困难"把目标标成 blocked。
//
// 用法：
//   node scripts/goal.mjs create --id <id> --objective "<目标>" [--max-rounds N]
//   node scripts/goal.mjs list
//   node scripts/goal.mjs show <id>
//   node scripts/goal.mjs round <id> [--note "<本轮进展>"] [--blocked "<同一阻塞>"]
//   node scripts/goal.mjs block <id>
//   node scripts/goal.mjs pause <id> | resume <id> | complete <id> [--note "<证据/结论>"]
//   node scripts/goal.mjs validate
// 退出码：0 = 成功；1 = 被规则拒绝或用法错误。

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BLOCKED_MIN_ROUNDS,
  DEFAULT_MAX_ROUNDS,
  newGoal,
  readState,
  recordRound,
  setPhase,
  validateGoal,
  writeState,
} from './lib/goal-rules.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const GOAL_DIR = path.join(REPO, 'docs', 'goal');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(message);
}

/** 解析 `--flag value` 与位置参数。 */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      flags[key] = value;
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

const TEMPLATE = (state) => `# Goal: ${state.objective}

状态文件由 \`scripts/goal.mjs\` 维护；规则见 \`docs/agent-workflow.md\` §4。
**不要手改下面状态块以外的字段**（改坏了 \`node scripts/goal.mjs validate\` 会报）。

## Rounds
`;

function goalPath(id) {
  return path.join(GOAL_DIR, `${id}.md`);
}

function loadGoal(id) {
  if (!id) fail('缺少 goal id');
  let text;
  try {
    text = readFileSync(goalPath(id), 'utf8');
  } catch {
    fail(`找不到 ${path.relative(REPO, goalPath(id))}`);
  }
  const { state, error } = readState(text);
  if (error) fail(`${id}: ${error}`);
  return { text, state };
}

function saveGoal(id, text, state) {
  writeFileSync(goalPath(id), writeState(text, state), 'utf8');
}

function appendNarrative(text, line) {
  return `${text.replace(/\s*$/, '')}\n- ${line}\n`;
}

function goalIds() {
  try {
    return readdirSync(GOAL_DIR)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => f.slice(0, -3));
  } catch {
    return [];
  }
}

const [command, ...rest] = process.argv.slice(2);
const { flags, positional } = parseArgs(rest);
const id = positional[0];
const stamp = new Date().toISOString().slice(0, 10);

switch (command) {
  case 'create': {
    if (!flags.id) fail('需要 --id');
    if (!flags.objective) fail('需要 --objective');
    mkdirSync(GOAL_DIR, { recursive: true });
    if (goalIds().includes(flags.id)) fail(`已存在：${flags.id}`);
    const state = newGoal({
      id: flags.id,
      objective: flags.objective,
      maxRounds: flags['max-rounds'] ? Number(flags['max-rounds']) : DEFAULT_MAX_ROUNDS,
    });
    const text = writeState(TEMPLATE(state), state);
    writeFileSync(goalPath(flags.id), text, 'utf8');
    ok(`已创建 ${path.relative(REPO, goalPath(flags.id))}（phase=active，预算 ${state.maxRounds} 轮）`);
    break;
  }

  case 'list': {
    const ids = goalIds();
    if (ids.length === 0) {
      ok('当前没有 goal。用 `node scripts/goal.mjs create --id <id> --objective "<目标>"` 新建。');
      break;
    }
    for (const goalId of ids) {
      const { state } = loadGoal(goalId);
      const blocker = state.blocker?.reason ? ` 阻塞=${state.blocker.reason}(${state.blocker.consecutiveRounds})` : '';
      ok(`${state.phase.padEnd(8)} ${state.roundsStarted}/${state.maxRounds}  ${goalId}${blocker}`);
    }
    break;
  }

  case 'show': {
    const { state } = loadGoal(id);
    ok(JSON.stringify(state, null, 2));
    break;
  }

  case 'round': {
    const { text, state } = loadGoal(id);
    const blocker = flags.blocked && flags.blocked !== true ? flags.blocked : null;
    const result = recordRound(state, { blocker });
    if (result.error) fail(result.error);
    const note = flags.note && flags.note !== true ? flags.note : '';
    saveGoal(id, appendNarrative(text, `${stamp} r${result.state.roundsStarted}: ${note}${blocker ? `（仍卡在：${blocker}）` : ''}`), result.state);
    ok(
      `已记录第 ${result.state.roundsStarted}/${result.state.maxRounds} 轮；` +
        (blocker
          ? `同一阻塞「${blocker}」已连续 ${result.state.blocker.consecutiveRounds} 轮` +
            (result.state.blocker.consecutiveRounds >= BLOCKED_MIN_ROUNDS ? '（已达 blocked 门槛）' : `（需 ≥${BLOCKED_MIN_ROUNDS}）`)
          : '连续阻塞计数已重置（有进展）'),
    );
    break;
  }

  case 'block': {
    const { text, state } = loadGoal(id);
    const result = setPhase(state, 'blocked');
    if (result.error) fail(result.error);
    saveGoal(id, appendNarrative(text, `${stamp} blocked：${result.state.blocker.reason}`), result.state);
    ok(`已标 blocked：${result.state.blocker.reason}（连续 ${result.state.blocker.consecutiveRounds} 轮）`);
    break;
  }

  case 'pause':
  case 'resume':
  case 'complete': {
    const { text, state } = loadGoal(id);
    const target = command === 'pause' ? 'paused' : command === 'resume' ? 'active' : 'complete';
    const result = setPhase(state, target);
    if (result.error) fail(result.error);
    const note = flags.note && flags.note !== true ? flags.note : '';
    saveGoal(id, appendNarrative(text, `${stamp} → ${target}${note ? `：${note}` : ''}`), result.state);
    ok(`已切换到 ${target}`);
    break;
  }

  case 'validate': {
    const ids = goalIds();
    if (ids.length === 0) {
      ok('当前没有 goal 文件，无需校验。');
      break;
    }
    let bad = 0;
    for (const goalId of ids) {
      const { state } = loadGoal(goalId);
      const problems = validateGoal(state);
      if (problems.length > 0) {
        bad++;
        console.error(`✗ ${goalId}: ${problems.join('；')}`);
      }
    }
    if (bad > 0) fail(`${bad} 个 goal 文件不合法`);
    ok(`校验通过：${ids.length} 个 goal 文件均合法`);
    break;
  }

  default:
    fail('用法见文件头注释：create | list | show | round | block | pause | resume | complete | validate');
}
