// 文档路径引用规则的回归测试。
//
// 关键在**区分两类"不存在"**：曾存在过（悬空指针＝真漂移）vs 从未存在（前瞻引用/别的项目的路径）。
// 这个区分如果写错，门禁要么漏掉真漂移，要么制造 30+ 条误报（2026-10-07 实测过后者）。

import { describe, expect, it } from 'vitest';
import { extractRefs, isExempt, lintText } from './doc-ref-rules.mjs';

const io = ({ exists = [], removed = [] } = {}) => ({
  exists: (ref) => exists.includes(ref),
  wasRemoved: (ref) => removed.includes(ref),
});

describe('extractRefs', () => {
  it('抓 docs/ 与 scripts/ 下的带扩展名路径', () => {
    expect(extractRefs('见 `docs/agent-workflow.md` 与 scripts/hooks/load-progress.mjs')).toEqual([
      'docs/agent-workflow.md',
      'scripts/hooks/load-progress.mjs',
    ]);
  });

  it('不抓裸文件名与目录（避免把目录树列表、代码片段误判）', () => {
    expect(extractRefs('  iteration-roadmap.md')).toEqual([]);
    expect(extractRefs('docs/adr/')).toEqual([]);
  });
});

describe('isExempt', () => {
  it('含 doc-ref-allow 的行豁免', () => {
    expect(isExempt('见 `docs/nope.md` <!-- doc-ref-allow -->')).toBe(true);
    expect(isExempt('见 `docs/nope.md`')).toBe(false);
  });
});

describe('lintText', () => {
  it('存在的引用不报', () => {
    const { violations, planned } = lintText('x.md', '见 `docs/a.md`', io({ exists: ['docs/a.md'] }));
    expect(violations).toEqual([]);
    expect(planned).toEqual([]);
  });

  it('曾存在过的路径 → 悬空指针（违规）', () => {
    const { violations } = lintText('x.md', '见 `docs/old.md`', io({ removed: ['docs/old.md'] }));
    expect(violations).toHaveLength(1);
    expect(violations[0].ref).toBe('docs/old.md');
  });

  it('从未存在过的路径 → 前瞻引用，不算违规但登记', () => {
    const { violations, planned } = lintText('x.md', '建议补充 `docs/planned.md`', io());
    expect(violations).toEqual([]);
    expect(planned).toHaveLength(1);
  });

  it('豁免行被跳过', () => {
    const { violations, planned } = lintText(
      'x.md',
      '未创建 `docs/planned.md` <!-- doc-ref-allow -->',
      io({ removed: ['docs/planned.md'] }),
    );
    expect(violations).toEqual([]);
    expect(planned).toEqual([]);
  });

  it('自引用被跳过', () => {
    const { violations } = lintText('docs/a.md', '本文件 docs/a.md', io({ removed: ['docs/a.md'] }));
    expect(violations).toEqual([]);
  });

  it('报告行号', () => {
    const { violations } = lintText('x.md', 'line1\nline2 `docs/old.md`\n', io({ removed: ['docs/old.md'] }));
    expect(violations[0].line).toBe(2);
  });
});
