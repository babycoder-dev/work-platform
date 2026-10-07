// goal 纪律规则的回归测试。
//
// 重点是**硬闸**：同一阻塞连续 ≥3 轮才允许 blocked。这条如果写错，纪律就退化成提示词，
// 目标可以随时被标成 blocked 然后无限期搁置——这正是要防的事。

import { describe, expect, it } from 'vitest';
import {
  BLOCKED_MIN_ROUNDS,
  goalIdProblem,
  newGoal,
  normalizeMaxRounds,
  readState,
  recordRound,
  requestBlock,
  setPhase,
  validateGoal,
  writeState,
} from './goal-rules.mjs';

const base = () => newGoal({ id: 'g1', objective: '把 X 做完', maxRounds: 5 });

/** 连续记录 n 轮同一阻塞。 */
function blockedRounds(state, reason, n) {
  let current = state;
  for (let i = 0; i < n; i++) {
    const result = recordRound(current, { blocker: reason });
    if (result.error) throw new Error(result.error);
    current = result.state;
  }
  return current;
}

describe('状态块的读写', () => {
  it('写入后再读回得到同一状态', () => {
    const state = base();
    const { state: parsed } = readState(writeState('# Goal: x\n', state));
    expect(parsed).toEqual(state);
  });

  it('没有状态块时报错而不是静默返回空', () => {
    expect(readState('# Goal: x\n').error).toContain('找不到');
  });

  it('状态块不是合法 JSON 时报错', () => {
    expect(readState('<!-- goal-state\n{ nope }\n-->').error).toContain('JSON');
  });

  it('重复写入不会产生第二个状态块', () => {
    const once = writeState('# Goal: x\n', base());
    const twice = writeState(once, { ...base(), roundsStarted: 1 });
    expect(twice.match(/goal-state/g)).toHaveLength(1);
    expect(readState(twice).state.roundsStarted).toBe(1);
  });
});

describe('validateGoal', () => {
  it('新建的目标合法', () => {
    expect(validateGoal(base())).toEqual([]);
  });

  it('缺 id / objective / phase 非法都报错', () => {
    expect(validateGoal({ ...base(), id: '' }).join()).toContain('id');
    expect(validateGoal({ ...base(), objective: '' }).join()).toContain('objective');
    expect(validateGoal({ ...base(), phase: 'done' }).join()).toContain('phase 非法');
  });

  it('blocked 必须写明原因且连续轮次达标', () => {
    const noReason = { ...base(), phase: 'blocked' };
    expect(validateGoal(noReason).join()).toContain('阻塞条件');

    const tooFew = { ...base(), phase: 'blocked', blocker: { reason: 'x', consecutiveRounds: 2 } };
    expect(validateGoal(tooFew).join()).toContain(`≥${BLOCKED_MIN_ROUNDS}`);
  });

  it('轮次超过预算报错', () => {
    expect(validateGoal({ ...base(), roundsStarted: 9 }).join()).toContain('超过 maxRounds');
  });
});

describe('recordRound', () => {
  it('普通轮次累加并重置连续阻塞', () => {
    const one = blockedRounds(base(), '等外部答复', 1);
    const two = recordRound(one, {}).state;
    expect(two.roundsStarted).toBe(2);
    expect(two.blocker).toEqual({ reason: null, consecutiveRounds: 0 });
  });

  it('同一阻塞连续累加，换了原因则重新计数', () => {
    const one = blockedRounds(base(), 'A', 1);
    const same = recordRound(one, { blocker: 'A' }).state;
    expect(same.blocker.consecutiveRounds).toBe(2);
    const changed = recordRound(same, { blocker: 'B' }).state;
    expect(changed.blocker).toEqual({ reason: 'B', consecutiveRounds: 1 });
  });

  it('预算用尽后拒绝继续记轮次', () => {
    let state = base();
    for (let i = 0; i < 5; i++) state = recordRound(state, {}).state;
    expect(recordRound(state, {}).error).toContain('预算已用尽');
  });

  it('已完成的目标不能再记轮次', () => {
    const done = setPhase(base(), 'complete').state;
    expect(recordRound(done, {}).error).toContain('已完成');
  });
});

describe('blocked 硬闸', () => {
  it('没有任何阻塞记录时拒绝', () => {
    expect(requestBlock(base()).error).toContain('尚未记录任何阻塞');
  });

  it(`连续 ${BLOCKED_MIN_ROUNDS - 1} 轮时拒绝，并说明还差几轮`, () => {
    const two = blockedRounds(base(), '等法务背书', BLOCKED_MIN_ROUNDS - 1);
    const { error } = requestBlock(two);
    expect(error).toContain('还差 1 轮');
    expect(error).toContain('都不是 blocked');
  });

  it(`连续 ${BLOCKED_MIN_ROUNDS} 轮后允许`, () => {
    const three = blockedRounds(base(), '等法务背书', BLOCKED_MIN_ROUNDS);
    const result = requestBlock(three);
    expect(result.error).toBeUndefined();
    expect(result.state.phase).toBe('blocked');
    expect(validateGoal(result.state)).toEqual([]);
  });

  it('中间有进展会打断连续性，从而回到门槛之外', () => {
    const one = blockedRounds(base(), '等法务背书', 1);
    const progressed = recordRound(one, {}).state;
    const again = recordRound(progressed, { blocker: '等法务背书' }).state;
    expect(again.blocker.consecutiveRounds).toBe(1);
    expect(requestBlock(again).error).toContain('还差');
  });
});

describe('phase 切换', () => {
  it('complete 是终态', () => {
    const done = setPhase(base(), 'complete').state;
    expect(setPhase(done, 'active').error).toContain('终态');
  });

  it('切到 blocked 必须过同一道硬闸', () => {
    expect(setPhase(base(), 'blocked').error).toContain('尚未记录任何阻塞');
  });

  it('blocked → active 需要显式调用（不自复活）', () => {
    const blocked = setPhase(blockedRounds(base(), 'r', BLOCKED_MIN_ROUNDS), 'blocked').state;
    expect(setPhase(blocked, 'active').state.phase).toBe('active');
  });

  it('pause / resume 可自由切换', () => {
    const paused = setPhase(base(), 'paused').state;
    expect(paused.phase).toBe('paused');
    expect(setPhase(paused, 'active').state.phase).toBe('active');
  });
});

// 以下三条来自 Codex 在 PR #45 上的 P2 审查。
describe('输入与状态校验', () => {
  it('goal id 必须是安全文件名：拒绝路径分隔符、上跳与以点开头', () => {
    expect(goalIdProblem('m10-daily-report')).toBeNull();
    expect(goalIdProblem('../ai-handoff')).toContain('不合法');
    expect(goalIdProblem('a/b')).toContain('不合法');
    expect(goalIdProblem('.hidden')).toContain('不合法');
    expect(goalIdProblem('')).toContain('缺少 id');
  });

  it('goal id 拒绝保留名 README（否则会覆盖目录说明）', () => {
    expect(goalIdProblem('README')).toContain('保留名');
    expect(goalIdProblem('readme')).toContain('保留名');
  });

  it('--max-rounds 必须是正整数，NaN 不得写盘成 null', () => {
    expect(normalizeMaxRounds(undefined)).toEqual({ value: 12 });
    expect(normalizeMaxRounds('6')).toEqual({ value: 6 });
    expect(normalizeMaxRounds('nope').error).toContain('正整数');
    expect(normalizeMaxRounds('0').error).toContain('正整数');
    expect(normalizeMaxRounds('2.5').error).toContain('正整数');
  });

  it('blocked 态下不允许记轮次（必须先 resume）', () => {
    const blocked = setPhase(blockedRounds(base(), 'r', BLOCKED_MIN_ROUNDS), 'blocked').state;
    expect(recordRound(blocked, {}).error).toContain('resume');
    expect(recordRound(blocked, { blocker: 'r' }).error).toContain('resume');
  });

  it('paused 态下同样不允许记轮次', () => {
    expect(recordRound(setPhase(base(), 'paused').state, {}).error).toContain('resume');
  });
});
