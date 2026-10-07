---
name: ui-fidelity-gate
description: Pass the Work Platform UI design-fidelity gate when implementing or changing user-facing screens — the machine-checked A-class rules plus the manual side-by-side B-class review. Use for any shell, login, or module UI work.
whenToUse: 实现或修改任何面向用户的界面时
---

# UI 还原度门禁

规则出处：`docs/development-workflow.md` §7（本文件是操作手册，不新增规则）。设计真源在
`docs/design/ui-handoff/`——**只读基准，勿改**。

## 先判层级

- **L1 严格像素级**：视觉系统（`packages/ui`）、外壳 chrome、登录页、**真实存在**的屏的版式。
- **L2 仅视觉参考**：设计稿里本产品**尚未建**的功能内容——用设计的组件样式渲染真实数据，**不为此造后端、
  不照搬虚构演示内容**。该屏无专稿时，按登录页 + 外壳基准锚定。

## A 类：机器校验（`pnpm fidelity`，已进 `pnpm verify` 与 CI）

| 规则 | 含义 |
| --- | --- |
| A1 | UI 源码不得出现硬编码 hex；颜色只引 `var(--*)`。唯一豁免 `packages/ui/src/styles/tokens.css` |
| A2 | 不得用 emoji 当图标；图标一律用 `@work/ui` 的线性 `Icon` |
| A4 | `padding` / `margin` / `gap` / `border-radius` / `box-shadow` / `font` / `font-size` 不得写裸长度，只引 token（`--sp-*`、`--r-*`、`--shadow-*`、`--font*`）；覆盖全部 CSS 长度与百分比单位，零值豁免 |

扫描范围：`apps/<app>/src`、`modules/<module>/web/src`、`packages/ui/src`。
**不在范围内**（改动需一并决策）：A3 由 `*.spec.tsx` 断言承担；`letter-spacing` / `line-height` /
`transform` 与 TSX 内联样式不扫。

## B 类：人工并排比对（不可机器化，定稿前做）

渲染设计稿原型与实现**并排**，逐区块核对结构 / 间距 / 组件态。**必须覆盖交互态**——报错、hover、
下拉浮层展开、加载中、空态 vs 有数据；只看默认静态截图会漏掉长报错撑宽、浮层错位这类只在交互态暴露的问题。
可用无头浏览器对每个状态各截一张并排比。

## 常见踩坑

- 关键文案要在 `*.spec.tsx` 里**逐字断言**设计稿字符串——这是 A3 的实际承担方式。
- 不得把已交付的**真实数据接线**换成设计稿的虚构演示数据；未建功能用**诚实 EmptyState / 占位**。
- token 唯一真源是 `packages/ui/src/styles/tokens.css`：新增视觉常量先加 token，再在样式里引用。
- 设计的非 4px 网格值用 `calc(token …)` 组合命中，不要写裸魔法值。
