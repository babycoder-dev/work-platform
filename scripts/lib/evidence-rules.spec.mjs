// 证据形式门禁的回归测试。
//
// 存在理由同 A 类规则与 hook：门禁自身也要有守卫。这里尤其重要，因为规则里用了
// 「生效起点按日期」这种非直观逻辑——写错会让门禁要么永不生效、要么误伤历史条目。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CUTOFF, lintLog, parseEntries } from './evidence-rules.mjs';

const entry = (date, body) => `## ${date}\n\n### Some slice\n\n${body}\n`;

const GOOD = '**Validation**\n\n- `pnpm verify`: pass (exit 0)\n';
const NO_SECTION = '**Change set**\n\n- did some work\n';
const NO_COMMAND = '**Validation**\n\n- 手动看了一遍，没问题：通过\n';
const NO_OUTCOME = '**Validation**\n\n- `pnpm verify` 跑了\n';

describe('parseEntries', () => {
  it('按 `## ` 切分并取出日期与行号', () => {
    const text = `# Verification Log\n\n${entry('2026-10-05', GOOD)}${entry('2026-07-15', GOOD)}`;
    const entries = parseEntries(text);
    expect(entries).toHaveLength(2);
    expect(entries[0].date).toBe('2026-10-05');
    expect(entries[0].line).toBe(3);
    expect(entries[1].date).toBe('2026-07-15');
  });

  it('兼容 CRLF 与无日期标题（不算入生效范围）', () => {
    const text = '# Verification Log\r\n\r\n## 无日期小节\r\n\r\n- x\r\n';
    const entries = parseEntries(text);
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBeNull();
  });
});

describe('生效起点之后的条目必须写证据', () => {
  it('缺 Validation 小节 → 不合格', () => {
    const { violations } = lintLog(entry('2026-10-05', NO_SECTION));
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('Validation');
  });

  it('有 Validation 但没贴命令 → 不合格', () => {
    const { violations } = lintLog(entry('2026-10-05', NO_COMMAND));
    expect(violations.map((v) => v.reason).join()).toContain('命令');
  });

  it('有命令但没结果标记 → 不合格', () => {
    const { violations } = lintLog(entry('2026-10-05', NO_OUTCOME));
    expect(violations.map((v) => v.reason).join()).toContain('结果');
  });

  it('命令 + 结果齐全 → 合格', () => {
    expect(lintLog(entry('2026-10-05', GOOD)).violations).toEqual([]);
  });

  it('`**验证**` 与大小写变体同样被认作 Validation 小节', () => {
    expect(lintLog(entry('2026-10-05', '**验证**\n\n- `pnpm test`: 通过\n')).violations).toEqual([]);
    expect(lintLog(entry('2026-10-05', '**VALIDATION**\n\n- `pnpm test`: pass\n')).violations).toEqual(
      [],
    );
  });

  it('恰好等于生效起点当天的条目也在范围内', () => {
    expect(lintLog(entry(CUTOFF, NO_SECTION)).violations).toHaveLength(1);
  });

  // 以下两条来自 Codex 在 PR #44 上的 P2 审查。
  it('接受标准 Markdown 标题 `### Validation`（不只认粗体）', () => {
    expect(lintLog(entry('2026-10-05', '### Validation\n\n- `pnpm verify`: pass (exit 0)\n')).violations).toEqual(
      [],
    );
    expect(lintLog(entry('2026-10-05', '#### 验证\n\n- `pnpm test`: 通过\n')).violations).toEqual([]);
  });

  it('命令与结果必须落在同一条证据里', () => {
    const split = '**Validation**\n\n- `pnpm verify`\n- 结果：pass\n';
    const { violations } = lintLog(entry('2026-10-05', split));
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('同时包含');
  });

  it('反例：`bypass` 不得被当作结果标记', () => {
    const trap = '**Validation**\n\n- `pnpm` is installed; bypass is intentional.\n';
    expect(lintLog(entry('2026-10-05', trap)).violations).toHaveLength(1);
  });
});

describe('历史条目不追溯，但如实统计', () => {
  it('生效起点之前的条目即使不合格也不报违规', () => {
    const { violations, legacy, legacyCompliant } = lintLog(entry('2026-06-28', NO_SECTION));
    expect(violations).toEqual([]);
    expect(legacy).toBe(1);
    expect(legacyCompliant).toBe(0);
  });

  it('历史条目若已符合形式，会计入合规统计', () => {
    const { legacy, legacyCompliant } = lintLog(entry('2026-06-28', GOOD));
    expect(legacy).toBe(1);
    expect(legacyCompliant).toBe(1);
  });
});

describe('真实仓库的 verification-log', () => {
  it('当前不产生任何违规（门禁落地即是绿的）', () => {
    const repo = path.resolve(import.meta.dirname, '..', '..');
    const text = readFileSync(path.join(repo, 'docs', 'verification-log.md'), 'utf8');
    const { violations } = lintLog(text);
    expect(violations).toEqual([]);
  });
});
