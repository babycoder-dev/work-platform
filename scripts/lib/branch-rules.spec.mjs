// "不要在 main 上干活"规则的回归测试。
//
// 重点：只在该管的时候管——CI 是 detached HEAD，且非 main 分支不该被拦，否则每次都得加豁免，
// 门禁很快会被绕过（本仓已有先例：一条会误报 32 次的门禁规则只能被削弱）。

import { describe, expect, it } from 'vitest';
import { assess } from './branch-rules.mjs';

const on = (overrides = {}) => ({ branch: 'main', detached: false, dirty: false, ahead: 0, ...overrides });

describe('assess', () => {
  it('main 上干净且与远端齐平 → 通过', () => {
    expect(assess(on())).toEqual([]);
  });

  it('main 上有未提交改动 → 报', () => {
    expect(assess(on({ dirty: true })).join()).toContain('未提交改动');
  });

  it('main 上有未推送提交 → 报，并给出补救办法', () => {
    const problems = assess(on({ ahead: 2 }));
    expect(problems.join()).toContain('2 个未推送提交');
    expect(problems.join()).toContain('reset --hard origin/main');
  });

  it('两种问题同时存在时都报', () => {
    expect(assess(on({ dirty: true, ahead: 1 }))).toHaveLength(2);
  });

  it('非 main 分支一律放行（否则门禁会被绕过）', () => {
    expect(assess(on({ branch: 'feat/x', dirty: true, ahead: 3 }))).toEqual([]);
  });

  it('detached HEAD（CI）一律放行', () => {
    expect(assess({ branch: 'HEAD', detached: true, dirty: true, ahead: 5 })).toEqual([]);
  });
});
