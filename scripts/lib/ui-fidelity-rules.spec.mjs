// UI 还原度 A 类规则的回归测试。
//
// 存在理由：门禁自身也要有守卫。2026-10-07 Codex 在 PR #41 上指出 A4 只认 px/rem/em，
// 于是 font-size:3vw / padding:5% / margin:2ch 这类裸值可绕过规则——那是一次**规则本身的
// 覆盖缺口**，靠人工注入验证发现不了（当时我只测了 px）。本文件把每类单位的正/负样例固化。
//
// 由 vitest.config.mts 的 scripts/**/*.spec.mjs 收集（node 环境）。

import { describe, expect, it } from 'vitest';
import { inScope, lintText } from './ui-fidelity-rules.mjs';

const APP = 'apps/workbench-shell/src/styles.css';
const MODULE = 'modules/presence/web/src/styles.css';
const TOKENS = 'packages/ui/src/styles/tokens.css';

/** 取违规的 rule 列表，便于断言。 */
const rules = (rel, text) => lintText(rel, text).map((v) => v.rule);

describe('A1 零硬编码 hex', () => {
  it('抓到 hex 颜色', () => {
    expect(rules(APP, '.a { color: #ff0000; }')).toEqual(['A1']);
  });

  it('tokens.css 是唯一豁免', () => {
    expect(rules(TOKENS, ':root { --danger: #f54a45; }')).toEqual([]);
  });

  it('放行 var() 引用', () => {
    expect(rules(APP, '.a { color: var(--ink-1); }')).toEqual([]);
  });
});

describe('A2 零 emoji 当图标', () => {
  it('抓到 emoji', () => {
    expect(rules('modules/presence/web/src/pages/X.tsx', 'const icon = "🔔";')).toEqual(['A2']);
  });

  it('放行文本勾叉', () => {
    expect(rules('modules/presence/web/src/pages/X.tsx', '// ✓ 已完成')).toEqual([]);
  });
});

describe('A4 只引 token', () => {
  it.each([
    ['padding', 'padding: 13px;'],
    ['margin', 'margin: 2ch;'],
    ['gap', 'gap: 1.5rem;'],
    ['font-size 视口单位', 'font-size: 3vw;'],
    ['padding 百分比', 'padding: 5%;'],
    ['border-radius 百分比', 'border-radius: 50%;'],
    ['box-shadow 裸值', 'box-shadow: 0 1px 2px rgba(0,0,0,.2);'],
  ])('抓到裸值：%s', (_label, decl) => {
    expect(rules(APP, `.a { ${decl} }`)).toEqual(['A4']);
  });

  it.each([
    ['无单位零值', 'padding: 0;'],
    ['带单位零值', 'padding: 0px;'],
    ['零百分比', 'padding: 0%;'],
    ['token 引用', 'padding: var(--sp-3);'],
    ['calc 组合 token', 'gap: calc(var(--sp-4) - var(--border-width));'],
    ['calc 除 token', 'padding: calc(var(--sp-1) / 2);'],
    ['多值混合', 'padding: 0 var(--sp-2);'],
  ])('放行：%s', (_label, decl) => {
    expect(rules(APP, `.a { ${decl} }`)).toEqual([]);
  });

  it('不碰 A4 属性清单之外的属性', () => {
    expect(rules(APP, '.a { width: 100%; transform: translateY(-1px); letter-spacing: -0.5px; }')).toEqual(
      [],
    );
  });

  it('tokens.css 豁免（token 真源自身可以有裸值）', () => {
    expect(rules(TOKENS, ':root { --badge-padding-y: 1px; }')).toEqual([]);
  });
});

describe('扫描范围', () => {
  it.each([
    ['apps/*/src', APP, true],
    ['modules/*/web/src', MODULE, true],
    ['packages/ui/src', TOKENS, true],
    ['modules/*/api/src', 'modules/presence/api/src/x.ts', false],
    ['apps 构建产物', 'apps/workbench-shell/dist/x.css', false],
    ['仓库脚本', 'scripts/check-ui-fidelity.mjs', false],
  ])('%s', (_label, rel, expected) => {
    expect(inScope(rel)).toBe(expected);
  });
});
