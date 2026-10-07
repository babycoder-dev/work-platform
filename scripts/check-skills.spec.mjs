// 技能格式门禁的端到端测试（真实进程 + 临时技能根）。
//
// 为什么单独测 CLI：遍历逻辑是这道门禁最容易出错的地方，而它不在纯规则里。Codex 在 PR #46 上指出
// 我把 references/scripts/assets 加进跳过列表后，`foo/references/SKILL.md` 这种嵌套技能**不会被发现**——
// 门禁宣称拦嵌套却漏检。本文件把这类遍历用例固化，避免再次退化。

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = path.join(import.meta.dirname, 'check-skills.mjs');

const VALID_SKILL = `---
name: demo
description: A sufficiently long description so the validator accepts this demo skill.
---

# Demo

正文。
`;

/** 在临时技能根里造目录/文件，返回根路径。 */
function makeRoot(entries) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'work-skills-'));
  for (const [rel, content] of Object.entries(entries)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return root;
}

function runGate(root) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, WORK_SKILL_ROOTS: root },
  });
  return { status: result.status, stdout: result.stdout ?? '' };
}

describe('技能格式门禁（CLI）', () => {
  it('合法技能 → 通过', () => {
    const root = makeRoot({ 'demo/SKILL.md': VALID_SKILL });
    const { status, stdout } = runGate(root);
    expect(status).toBe(0);
    expect(stdout).toContain('通过');
  });

  it('嵌套 SKILL.md（含 references/ 之下）→ 必须被抓，不能被跳过列表放过', () => {
    const root = makeRoot({
      'demo/SKILL.md': VALID_SKILL,
      'demo/references/SKILL.md': VALID_SKILL,
    });
    const { status, stdout } = runGate(root);
    expect(status).toBe(1);
    expect(stdout).toContain('不支持嵌套');
  });

  it('技能目录缺少 SKILL.md → 报错（该目录不会被加载）', () => {
    const root = makeRoot({ 'demo/notes.md': 'no skill file here\n' });
    const { status, stdout } = runGate(root);
    expect(status).toBe(1);
    expect(stdout).toContain('没有 SKILL.md');
  });

  it('frontmatter 的 name 与目录名不一致 → 报错（否则技能静默不加载）', () => {
    const root = makeRoot({ 'other/SKILL.md': VALID_SKILL });
    const { status, stdout } = runGate(root);
    expect(status).toBe(1);
    expect(stdout).toContain('目录名');
  });
});
