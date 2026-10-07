// 仓库 hook 的冒烟测试。
//
// 存在理由与 A 类规则的 spec 相同：门禁/守卫自身也要有守卫。四个 hook 此前完全没有测试，
// 而它们是「写入期边界拦截 / 编辑后格式化 / 会话启动注入进度 / 结束前提醒」的唯一实现——
// 改坏了不会有任何信号。这里用真实 stdin 载荷跑真实进程，断言可观察输出。
//
// 由 vitest.config.mts 的 scripts/**/*.spec.mjs 收集（node 环境）。会 spawn node 子进程，
// 因此只在非受限环境（CI / 本地完全权限）有意义。

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HOOKS_DIR = import.meta.dirname;
const REPO = path.resolve(HOOKS_DIR, '..', '..');

/** 以给定 stdin 载荷运行 hook，返回可观察结果。 */
function runHook(name, payload, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join(HOOKS_DIR, `${name}.mjs`)], {
    cwd: REPO,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ...extraEnv },
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

describe('guard-module-boundary：写入期模块边界拦截', () => {
  const file = 'modules/presence/web/src/pages/Probe.tsx';

  it('跨业务模块 import → 请求确认（ask）而不是放行', () => {
    const { status, stdout } = runHook('guard-module-boundary', {
      tool_input: { file_path: file, content: "import '@work/approval-contract';" },
    });
    expect(status).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('approval');
  });

  it('具名导入同样被抓（`... from "..."` 形式）', () => {
    const { status, stdout } = runHook('guard-module-boundary', {
      tool_input: { file_path: file, content: "import { x } from '@work/approval-contract';" },
    });
    expect(status).toBe(0);
    expect(JSON.parse(stdout).hookSpecificOutput.permissionDecision).toBe('ask');
  });

  it('依赖自身模块的包 → 放行（无输出）', () => {
    const { status, stdout } = runHook('guard-module-boundary', {
      tool_input: { file_path: file, content: "import { x } from '@work/presence-contract';" },
    });
    expect(status).toBe(0);
    expect(stdout).toBe('');
  });

  it('业务模块之外的文件 → 不干预', () => {
    const { status, stdout } = runHook('guard-module-boundary', {
      tool_input: { file_path: 'apps/platform-api/src/x.ts', content: "import '@work/approval-contract';" },
    });
    expect(status).toBe(0);
    expect(stdout).toBe('');
  });
});

describe('load-progress：会话启动注入进度快照', () => {
  it('输出 SessionStart 上下文，且含进度快照标题', () => {
    const { status, stdout } = runHook('load-progress', {});
    expect(status).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain('基建进度快照');
  });

  it('注入活跃 goal；没有 goal 文件时不出现该段', () => {
    const bare = JSON.parse(runHook('load-progress', {}).stdout);
    expect(bare.hookSpecificOutput.additionalContext).not.toContain('活跃长任务');

    const dir = mkdtempSync(path.join(os.tmpdir(), 'work-goal-'));
    const state = {
      id: 'g1',
      objective: '演练目标',
      phase: 'blocked',
      roundsStarted: 3,
      maxRounds: 8,
      blocker: { reason: '等法务背书', consecutiveRounds: 3 },
    };
    writeFileSync(
      path.join(dir, 'g1.md'),
      `# Goal: 演练\n\n<!-- goal-state\n${JSON.stringify(state)}\n-->\n`,
      'utf8',
    );

    const withGoal = runHook('load-progress', {}, { WORK_GOAL_DIR: dir });
    const context = JSON.parse(withGoal.stdout).hookSpecificOutput.additionalContext;
    expect(context).toContain('活跃长任务');
    expect(context).toContain('等法务背书');
    expect(context).toContain('g1');
  });
});

describe('remind-on-stop：结束前门禁提醒', () => {
  it('stop_hook_active 时放行，杜绝死循环', () => {
    const { status, stdout } = runHook('remind-on-stop', { stop_hook_active: true, session_id: 'spec-loop' });
    expect(status).toBe(0);
    expect(stdout).toBe('');
  });

  it('任何情况下都不得让会话崩溃；若有输出必须是合法的 block 形状', () => {
    const { status, stdout } = runHook('remind-on-stop', { session_id: `spec-${Date.now()}` });
    expect(status).toBe(0);
    if (stdout !== '') {
      const out = JSON.parse(stdout);
      expect(out.decision).toBe('block');
      expect(typeof out.reason).toBe('string');
      expect(out.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('format-on-edit：编辑后格式化', () => {
  it('文件不存在时静默放行，不阻塞编辑', () => {
    const { status, stdout } = runHook('format-on-edit', {
      tool_input: { file_path: 'modules/presence/web/src/__does_not_exist__.ts' },
    });
    expect(status).toBe(0);
    expect(stdout).toBe('');
  });

  it('空载荷不崩溃', () => {
    const { status } = runHook('format-on-edit', {});
    expect(status).toBe(0);
  });
});
