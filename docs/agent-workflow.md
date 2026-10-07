# Agent 协作与研发基建

状态：2026-10-05 立项（P0 进行中）｜ 定位：本仓「人 + 编码代理如何协作」的单一事实源。
权威性低于 `docs/constitution.md` / ADR / RFC，高于任务包；只写**怎么做**，不重复**做什么**。

## 0. 为什么有这份文档

项目由「人 + 多个编码代理」推进（Claude Code / Codex / DeepSeek Harness）。相关约定此前散落在
`.claude/`、`docs/ai-handoff.md`、`docs/development-workflow.md` §6/§7 与各 `CLAUDE.md` 里，
且**手工维护的状态文档已被证明会漂移**：`docs/ai-handoff.md` 停在 M3.5（最新提交写 `9c887bd`），
而项目当时已走到 M9 合并完成——漂移约 4.5 个月，期间无人察觉。

本文件吸收 DeepSeek Harness（DSH）的机制形态，把这些约定收敛到**可执行的守卫**上，并为长任务、
技能、编排三类协作能力定下承载物与引入顺序。

## 1. 第一原则

1. **承诺必须落到会红的检查上**；文档只做指针，不做守卫。写不出命令的「已完成」不算完成。
2. **一行日志不是证据**。2026-10-05 实测教训：`@nx/enforce-module-boundaries` 会偶发打印
   `No cached ProjectGraph is available. The rule will be skipped.`，但同一次运行**照样抓出越界依赖**
   （`pnpm -r` / `nx run-many` / `pnpm --filter` 三条路径实测均 exit 1）。据此断言「守卫失效」是错的——
   判断执法强度只能靠**故意违规的负向验证**，不能靠日志措辞。
3. **自证是最弱的一环**。凡规则声称「可静态/机器核验」，就必须有对应的脚本与 CI 步骤。

## 2. 门禁清单（可执行物 → 谁跑）

| 守卫 | 承载物 | 何时跑 |
| --- | --- | --- |
| UI 还原度 A 类（A1 零 hex / A2 零 emoji / A4 只引 token） | `scripts/check-ui-fidelity.mjs`（`pnpm fidelity`） | 本地 `pnpm verify` + CI |
| 模块边界 | eslint `@nx/enforce-module-boundaries`（三条 lint 路径实测生效）+ `.claude/hooks/guard-module-boundary.mjs`（写入期即时反馈） | lint / CI / 编辑时 |
| 交付门禁 | `pnpm verify`；涉 DB 加 `verify:full`，涉部署加 `docker:build` | 每次交付 |
| 证据纪律 | PR 模板 + `docs/verification-log.md` 条目形状 | PR |
| 设计还原度 B 类（人工并排比对，覆盖交互态） | 不可机器化，定稿前人工做 | 评审 |

A 类规则的**边界**（未覆盖项，改动时需一并决策）：A3（关键文案逐字一致）由 `*.spec.tsx` 断言承担；
A4 只覆盖 `padding|margin|gap|border-radius|box-shadow|font|font-size`（**单位覆盖全部 CSS 长度与百分比，
含 vw/vh/ch/%，零值 `0` / `0px` / `0%` 豁免**），`letter-spacing` / `line-height` / `transform` 的取值口径
待定；TSX 内联样式不在扫描范围内。
规则本身有回归测试：`scripts/lib/ui-fidelity-rules.spec.mjs`（由 `vitest.config.mts` 的
`scripts/**/*.spec.mjs` 收集）——**门禁自身也要有守卫**，否则规则会像 2026-10-07 那样被静默削弱
（当时 A4 只认 px/rem/em，`font-size:3vw` 这类裸值可直接绕过）。

## 3. 方言与挂载：一份实现、多入口

现状与目标：hook 逻辑一律放 `scripts/hooks/*.mjs`（方言无关、纯 Node、**不 spawn 子进程**），
各工具的配置只负责**挂载**：

| 方言 | 挂载点 | 现状 |
| --- | --- | --- |
| Claude Code | `.claude/settings.json` → hooks | 已挂 4 个 |
| Codex | `.codex/` 等价配置 | **待补（P0）** |
| DSH | 仓库内配置 | **待补（P0）** |

约定：hook 异常一律放行，绝不阻塞会话；唯一例外是**真边界违规**，用 `ask` 交人定夺，不硬拒
（避免误报把工作流卡死）。

现有 4 个 hook 的职责：`guard-module-boundary`（写入期边界）、`format-on-edit`（prettier + eslint --fix）、
`load-progress`（SessionStart 注入进度快照）、`remind-on-stop`（结束前提醒门禁与文档沉淀）。

## 4. 长任务与状态：替代手工 handoff

- **进度单一事实源** = `docs/foundation-progress.md`；会话启动由 `load-progress.mjs` 抽「总览 / 当前下一步 /
  当前阻塞项」注入上下文。动态内容走 hook，**不写进 `CLAUDE.md`**（后者只留稳定指针与坑）。
- **`docs/ai-handoff.md` 废弃**（P1）：手工维护的会话状态已被证明必然漂移，其职责由「进度注入 + git 历史」
  承担。
- **长任务纪律**（借鉴 DSH goal，P1）：phase = `active | paused | blocked | complete`；`blocked` 仅当
  **同一阻塞连续 ≥ 3 轮**且能给出具体阻塞条件时才允许，否则继续推进或在对话中问人；**resume / fork 后
  不自复活**，必须由人显式恢复。承载物：`docs/goal/<id>.md` + `scripts/goal.mjs`（校验非法转移与阈值）。

## 5. 技能（Skills）

- 布局 `.agents/skills/<name>/SKILL.md`；frontmatter 必填 `name` + `description`，可选 `whenToUse`；
  正文按需加载，目录只索引 frontmatter。
- 只放**可复用的操作手册**，不放规则（规则在 constitution / ADR / RFC）。首批（P1）：任务包模板、
  还原度门禁流程、数据库迁移纪律。

## 6. 多代理编排（Workflow）

- **出现真实 fan-out 需求才引入**（例：多文件审计 + 逐候选独立复核），且**只做一个用例，不建通用引擎**
  （沿 ADR-0005「不建引擎」原则）。
- 若照搬 DSH 语义：pipeline 阶段间**无栅栏**，某阶段失败只把该 item 丢成 `null` 并跳过后续阶段；
  而**编排脚本自身的误用（参数错、超 schema）应 fail-fast 终止整个脚本**，不得静默降级。
- 承载物：`workflows/*.mjs` 或直接复用 CI matrix（P1 决策）。

## 7. 明确不做（不搬清单）

- DSH 的**沙箱真实强制**（受限令牌 / ACL / 每工作区 SID）：需要隔离或并行时，改由**容器或 CI runner** 承担边界。
- DSH 的 **subagent 运行时**：与进程模型强耦合，搬出去只会变成负担。
- 为文档体系**再写总纲**：本文件即收口点，新增机制写进本节表格，不新开顶层文档。

## 8. 落地顺序

- **P0 · 承诺变守卫**：A 类门禁脚本化（✅ 已落地）→ 方言统一（补齐 Codex / DSH 挂载）→ 证据门禁
  （PR 模板 + verification-log 条目形状校验）。
- **P1 · 长任务与协作**：goal 纪律 + 废弃 `ai-handoff.md` → 首批 skills → 一个真实 workflow 用例。
- **P2 · 文档治理**：`docs/` 顶层 7 篇不在 `doc-index` 管辖内的文档逐一定性（纳入 / 归档 / 删除）；
  `iteration-roadmap.md`（自标已过时）归档。
