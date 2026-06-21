# UI 还原度差距清单 · 共享 `@work/ui` Modal vs 设计稿居中弹窗

状态：Open（待排期）｜ 2026-06-21 起草（M8-2b 首登向导复核衍生）｜ 作为「`@work/ui` Modal 对齐原型居中弹窗」follow-up 切片的依据

> 关联：`docs/foundation-progress.md` §7.2 已知 UI 还原度 Follow-up ｜ 门禁依据 `docs/development-workflow.md` §7 ｜
> 地基三屏差距清单 `docs/design/ui-fidelity-gap-foundation.md`（本文件是其同族续篇，专记组件库 Modal）。

## 这份文档是什么

把**共享组件** `@work/ui` 的居中弹窗（`.work-modal` / `.work-modal-shell` / `.work-scrim`，
源 `packages/ui/src/styles/components.css` + `packages/ui/src/components/Modal/Modal.tsx`）
与**设计真源的居中弹窗**逐项对照，列出不一致，供独立 follow-up 切片照单整改。

- 设计真源：`docs/design/ui-handoff/` 的居中弹窗范式 `.mscrim` / `.modal` / `.mh` / `.mf`
  （现交接拷贝见 `.codex/ui-handoff/.../design/组织成员.html` L384–397）。
- 现有实现：`packages/ui/src/styles/components.css` L413–496 + `packages/ui/src/styles/tokens.css`。

## ⚠️ 为什么单列、为什么现在做最划算

- **当前零消费者、零回归窗口**：`@work/ui` 的 `Modal` / `ConfirmDialog` 目前在 `apps/**` 与 `modules/**`
  **没有任何产品调用点**；M8-2b 首登向导是**自绘** `.first-login__*` 弹窗 markup，未走共享 Modal。
  因此现在对齐共享 Modal 是**零回归改动**——一旦组织成员（M8）/消息中心等屏开始采纳 `@work/ui` Modal，
  再改就要逐消费者回归。**采纳前对齐 = 最低成本。**
- **不并入 M8-2b 的 CSS 微修 PR**：那是首登向导自有类的像素修，本项是组件库根样式，影响面与排期不同，故独立。

## 差距清单（核心 5 处）

| #   | 项         | 共享实现（`@work/ui`）                                                             | 设计真源（居中弹窗）                                                | 偏差 / 整改方向                                                                                                                                     |
| --- | ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1 | 遮罩透明度 | `--scrim-bg: rgba(31,35,41,0.32)`（`.work-scrim`，抽屉/弹窗共用）                  | `.mscrim` = `rgba(31,35,41,.45)`（抽屉 `.scrim` 另为 `.35`）        | ❌ 弹窗遮罩偏浅。**注**：单一 `--scrim-bg` 无法同时命中抽屉 `.35` 与弹窗 `.45`——需拆 token（如 `--scrim-bg-modal`）或按组件覆写，不能简单调一个值。 |
| M-2 | 容器边框   | `.work-modal` 带 `border: 1px solid var(--line-1)`                                 | `.modal` **无边框**，仅 `border-radius` + `box-shadow`              | ❌ 多一圈边框。圆角 `--r-lg`(12px)、阴影 `--shadow-pop` 两端已一致，去掉 border 即可。                                                              |
| M-3 | 标题字号   | `.work-modal__title` = `--font-size-18`(18px) / 600                                | `.mh h3` = 16px / 600                                               | ❌ 标题偏大一阶。字阶 `--font-size-16` 已于 M8-2b 补入 tokens，改引它即可。                                                                         |
| M-4 | 页脚       | `.work-modal__footer` 带 `border-top: 1px solid --line-1` + padding `--sp-4`(16px) | `.mf` **无上边框**，padding `12px 22px 20px`，`flex-end` gap `10px` | ❌ 多了分隔线 + 内距不符。原型页脚无分隔线、上下不对称内距（上 12 / 下 20）。                                                                       |
| M-5 | 容器宽度   | `--modal-width: 420px`                                                             | `.modal` `width: 440px`                                             | ⚠️ 窄 20px。对齐为 440px（或新增对应 token）。                                                                                                      |

## 次级（整改时一并逐值核对，非阻塞）

- **头部内距/间距**：`.mh` = `padding:20px 22px 6px; gap:11px`；共享 `.work-modal__body` = `padding: --sp-6`(24px)，
  且未区分 header/body 段——原型 header 与 body 是分段内距，整改时按原型分段对齐（横向 22px 非 4px 网格，用 `calc(token)` 命中）。
- **图标范式**：原型 `.mh .mi` = 32×32 正圆、`svg` 18px。M8-2b 首登向导的 `.first-login__step-icon` 已照此对齐；
  共享 Modal 若引入 header 图标槽，复用同一范式。

## 整改边界（沿用 §7 门禁）

- **L1 严格像素级**：组件库是所有屏复用的根，居中弹窗版式（遮罩/容器/标题/页脚/宽度）= L1。
- **A4 零裸魔法值**：非 4px 网格值（如 padding 22 / 12 / 20、遮罩 .45）用 `calc(token …)` 或新增 token 命中，不写裸值。
- **A1 零硬编码 hex**：遮罩色仍走 token，必要时拆 `--scrim-bg-modal`。
- **采纳即回归**：整改后，后续采纳 `@work/ui` Modal 的屏（组织成员等）直接复用，不再各自造弹窗 markup。
