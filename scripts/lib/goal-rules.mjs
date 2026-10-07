// 长任务（goal）纪律 · 规则（纯函数，无 I/O）
//
// 立意与出处：docs/agent-workflow.md §4。借鉴 DeepSeek Harness 的 goal 纪律里**可搬运的那部分**
// ——phase 状态机、轮次预算、以及「blocked 需同一阻塞连续 ≥3 轮」这道**硬闸**（不是提示词）。
// DSH 侧的事件溯源/回放/projection 不搬。
//
// 机器状态就放在 goal markdown 文件里的一个 HTML 注释块中，便于人读、也便于机器解析：
//
//   <!-- goal-state
//   { "id": "...", "objective": "...", "phase": "active", "roundsStarted": 0, "maxRounds": 12,
//     "blocker": { "reason": null, "consecutiveRounds": 0 } }
//   -->

export const PHASES = ['active', 'paused', 'blocked', 'complete'];

/** 同一阻塞必须连续这么多轮，才允许标 blocked（硬闸）。 */
export const BLOCKED_MIN_ROUNDS = 3;

export const DEFAULT_MAX_ROUNDS = 12;

const STATE_RE = /<!--\s*goal-state\s*([\s\S]*?)-->/;

/** 从 goal 文件文本里读出状态；缺失或损坏时返回 error。 */
export function readState(text) {
  const match = STATE_RE.exec(text);
  if (!match) return { error: '找不到 <!-- goal-state ... --> 状态块' };
  try {
    return { state: JSON.parse(match[1]) };
  } catch (error) {
    return { error: `状态块不是合法 JSON：${error.message}` };
  }
}

/** 把状态写回 goal 文件文本（没有状态块则插到一级标题之后）。 */
export function writeState(text, state) {
  const block = `<!-- goal-state\n${JSON.stringify(state, null, 2)}\n-->`;
  if (STATE_RE.test(text)) return text.replace(STATE_RE, block);
  const lines = text.split(/\r?\n/);
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  const at = h1 === -1 ? 0 : h1 + 1;
  lines.splice(at, 0, '', block);
  return lines.join('\n');
}

export function newGoal({ id, objective, maxRounds = DEFAULT_MAX_ROUNDS }) {
  return {
    id,
    objective,
    phase: 'active',
    roundsStarted: 0,
    maxRounds,
    blocker: { reason: null, consecutiveRounds: 0 },
  };
}

/** 校验状态不变量；返回违规说明数组（空数组=合法）。 */
export function validateGoal(state) {
  const problems = [];
  if (!state || typeof state !== 'object') return ['状态不是对象'];
  if (!state.id) problems.push('缺少 id');
  if (!state.objective) problems.push('缺少 objective');
  if (!PHASES.includes(state.phase)) problems.push(`phase 非法：${state.phase}`);
  if (!Number.isInteger(state.roundsStarted) || state.roundsStarted < 0) {
    problems.push('roundsStarted 必须是非负整数');
  }
  if (!Number.isInteger(state.maxRounds) || state.maxRounds < 1) {
    problems.push('maxRounds 必须是正整数');
  }
  if (Number.isInteger(state.roundsStarted) && Number.isInteger(state.maxRounds)) {
    if (state.roundsStarted > state.maxRounds) problems.push('roundsStarted 超过 maxRounds');
  }
  const blocker = state.blocker ?? { reason: null, consecutiveRounds: 0 };
  if (state.phase === 'blocked') {
    if (!blocker.reason) problems.push('blocked 状态必须写明具体阻塞条件');
    if (!Number.isInteger(blocker.consecutiveRounds) || blocker.consecutiveRounds < BLOCKED_MIN_ROUNDS) {
      problems.push(`blocked 需要同一阻塞连续 ≥${BLOCKED_MIN_ROUNDS} 轮`);
    }
  }
  if (blocker.consecutiveRounds > 0 && !blocker.reason) {
    problems.push('有连续阻塞计数却没写阻塞原因');
  }
  return problems;
}

/**
 * 记录一轮。带 blocker 表示这一轮仍卡在同一件事上。
 * 正常轮次会**重置**连续阻塞计数（有进展就不算连续卡住）。
 */
export function recordRound(state, { blocker = null } = {}) {
  if (state.phase === 'complete') return { error: '目标已完成，不能再记轮次' };
  const next = structuredClone(state);
  if (next.roundsStarted >= next.maxRounds) {
    return { error: `轮次预算已用尽（${next.maxRounds}），需显式提高 maxRounds 或收束目标` };
  }
  next.roundsStarted += 1;
  next.blocker = next.blocker ?? { reason: null, consecutiveRounds: 0 };
  if (blocker) {
    next.blocker.consecutiveRounds =
      next.blocker.reason === blocker ? next.blocker.consecutiveRounds + 1 : 1;
    next.blocker.reason = blocker;
  } else {
    next.blocker = { reason: null, consecutiveRounds: 0 };
  }
  return { state: next };
}

/** 标记 blocked：硬闸——同一阻塞必须已连续 ≥3 轮。 */
export function requestBlock(state) {
  if (state.phase === 'complete') return { error: '目标已完成，不能标 blocked' };
  const blocker = state.blocker ?? { reason: null, consecutiveRounds: 0 };
  if (!blocker.reason) {
    return {
      error: `尚未记录任何阻塞。请先用 \`round <id> --blocked "<具体阻塞>"\` 记录连续轮次；` +
        `同一阻塞连续 ≥${BLOCKED_MIN_ROUNDS} 轮才允许 blocked`,
    };
  }
  if (blocker.consecutiveRounds < BLOCKED_MIN_ROUNDS) {
    return {
      error:
        `「${blocker.reason}」目前只连续 ${blocker.consecutiveRounds} 轮，` +
        `距 blocked 门槛还差 ${BLOCKED_MIN_ROUNDS - blocker.consecutiveRounds} 轮。` +
        '难度大、不确定、或还有可做的事，都不是 blocked；请继续推进或在对话里问人。',
    };
  }
  const next = structuredClone(state);
  next.phase = 'blocked';
  return { state: next };
}

/** 显式切换 phase。complete 是终态；blocked → active/paused 必须显式调用（不自复活）。 */
export function setPhase(state, phase) {
  if (!PHASES.includes(phase)) return { error: `phase 非法：${phase}` };
  if (state.phase === 'complete' && phase !== 'complete') {
    return { error: 'complete 是终态，不能改回其它阶段' };
  }
  if (phase === 'blocked') return requestBlock(state);
  const next = structuredClone(state);
  next.phase = phase;
  next.blocker = next.blocker ?? { reason: null, consecutiveRounds: 0 };
  if (phase === 'complete') next.blocker = { reason: null, consecutiveRounds: 0 };
  return { state: next };
}
