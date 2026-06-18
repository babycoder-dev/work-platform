# Task: UI 地基还原收口切片（组件库 + 登录页 + 应用外壳 + 工作台首页 + 还原度门禁）

## 0. 任务定位

M8 之前的**收口切片**(类比 M3.5)。**不写新业务功能**——只把前端地基**按已提交的设计真源像素级还原**,
并**立"设计还原度"门禁**,让 M8 起每个里程碑的屏都能照各自设计稿做对、不再积债。

- **依据**:`docs/design/ui-fidelity-gap-foundation.md`(差距清单,本任务包逐条引用其 ID:L-_/S-_/W-\_)。
- **安全敏感判定**:本切片只动 `apps/workbench-shell` 与 `packages/ui`(纯前端/壳),**不触**
  `apps/platform-api/src/{auth,scope,audit,security,rbac,repositories}`、guard、data-scope、token/session、迁移。
  → **非安全敏感,不触发 security-reviewer 强制门禁**。
- 设计真源**早已在仓库**:根 `docs/design/ui-handoff/`(README 在根;设计稿 HTML + `tokens.css` 在其 `design/` 子目录)。
  **勿改动设计稿本身,它是只读基准。**
- **二审已修订(2026-06-18)**:据独立评审,修正了基于陈旧代码读取的断言——外壳面包屑/搜索/铃铛、工作台真实
  数据接线**均已交付**(改为回归保留),数据源收敛到真实存在的(M7 通知/navigationItems/权限门控的 presence board),
  门禁拆为可静态自证的 A 类 + 评审视觉 B 类。详见 §2/§6/§7 与差距清单的"二审更正"。

## 1. 必读

1. `docs/design/ui-fidelity-gap-foundation.md` —— 差距清单(本任务包的逐项依据 + L1/L2 边界)。
2. 设计真源:`docs/design/ui-handoff/design/企业工作台设计规范.html`(§02 登录页、§03 外壳+工作台、
   基础组件/业务组件段)、`tokens.css`(token 唯一真源)、`docs/design/ui-handoff/README.md`(实现说明)。
3. 现有实现:`apps/workbench-shell/src/app/App.tsx`、`apps/workbench-shell/src/styles.css`、
   `packages/ui/src/styles/{tokens.css,components.css}`、`packages/ui/src` 组件。
4. 根 `CLAUDE.md` 测试矩阵;**本机陷阱**:web 测试必须 `NODE_ENV=test`(生产模式会剥离 `React.act` 致假挂)。

## 2. 设计还原度门禁（本切片建立，后续所有 UI 切片复用）

门禁分两层。**A 类(实现方交付前必须自证,可静态/机器核验)** + **B 类(评审方人工抽查)**。

### A 类 · 实现方硬判据（可写成断言/可 grep，交付前必须全过）

| #   | 硬判据                                                                                                  | 怎么核验                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A1  | **零硬编码 hex**:`packages/ui/src/**` 与 `apps/workbench-shell/src/**` 的 css/tsx 颜色只引 `var(--*)`   | grep `#[0-9a-fA-F]{3,6}` 命中=0（`components.css` 现状已 0,主整改面是 `apps/workbench-shell/src/styles.css`）             |
| A2  | **零 emoji 占位**:源码无 emoji 当图标                                                                   | grep emoji 码点(👤🔒🔔☰⌕👋 等)命中=0,全部换线性 SVG                                                                      |
| A3  | **关键文案逐字一致**:在 `*.spec.tsx` 断言渲染文本**精确等于**设计稿字符串                               | 如「企业内网账号统一登录入口」「登 录」「请输入工号或邮箱」「登录即代表同意《内网使用规范》与《安全协议》」「内网工作台」 |
| A4  | **间距/圆角/阴影/字体只引 token 变量**(`--sp-*`/`--r-*`/`--shadow-*`/`--font`),落 4px 基准              | source-review css                                                                                                         |
| A5  | **真实接线/诚实占位回归保留**:既有真实未读/通知/应用入口接线、诚实 EmptyState 占位未被删/未被假数据替换 | source-review + 测试断言渲染的是真实字段                                                                                  |

### B 类 · 评审方人工抽查（不阻塞实现方交付，定稿前由评审做）

- 对该屏**渲染设计稿原型 + 实现并排比对**(本切片**显式授权**为还原核验渲染/截图设计稿——目标即像素级一致),
  逐区块看结构/间距/组件态差异,记录并回交修正。

> 验收**禁止"形似神不似"蒙混**:emoji 当图标、文案近似、硬编码颜色、间距随意 = A 类直接不合格。
> A 类是实现方交付前的硬门槛(能自证),B 类是评审方的视觉确认——两层都过才算还原达标。

## 3. L1 / L2 还原边界（来自差距清单 §⚠️，务必遵守）

- **L1 严格像素级**:视觉系统(组件库)、外壳 chrome、登录页、真实存在的屏的版式。
- **L2 仅视觉参考**:设计稿里**产品不存在的功能内容**(应用管理/在用应用48/应用清单表格/本月工单/
  文档资料/审批已建)——**用设计的组件样式渲染真实数据**(通知/在岗/待办/可访问入口),**不硬塞虚构内容**,
  **不**为此造未建后端。

## 4. UI-1 组件库对齐（根，先做；其余切片依赖它）

`packages/ui` 的组件照设计规范"基础组件/业务组件"段像素级还原(L1)。**基础组件**:
`Button`(primary/default/text × lg/sm/block 各态、字距)、`Input`(含 `input-affix` 前缀线性 SVG、lg 尺寸)、
`Checkbox`(选中态对勾 SVG)、`Card`(`card-head`/`card-body`/圆角/阴影)、
`Tag`(**五色 `blue/gray/green/orange/red`** + 状态点)、`Table`(`tbl` 表头/行/`dim` 列/操作列)、
`Avatar`、`Badge`(数字徽标)、以及统一的**线性 SVG 图标集**(替换 emoji,供外壳/登录复用)。
**业务组件(§7 工作台依赖,必须本切片随 UI-1 交付)**:`stat-card`(标签 + 图标方块 + 主数字 + delta 涨跌色)、
`quick-grid`(常用入口宫格)、动态/时间线卡片样式。

> 漏掉 Tag 两色或业务组件,UI-4 将无件可用、被迫现造或继续用自有 `workbench-home__*` 类(=没还原)。

- 断言:`components.css` + 组件全部走 token 变量、**无硬编码 hex**(门禁 A1);各组件态与设计稿并排一致(B 类)。
- 测试:关键组件 `*.spec.tsx`(`vitest.web.config.mts`,`NODE_ENV=test`)覆盖渲染 + 主要态。

## 5. UI-2 登录页（依赖 UI-1；消除差距 L-1..L-8）

| 断言                                                            | 依据 |
| --------------------------------------------------------------- | ---- |
| Logo 改 `工`(品牌字 mark,非 `W`)                                | L-1  |
| 副标题改「企业内网账号统一登录入口」                            | L-2  |
| 账号/密码前缀改**线性 SVG**(用户/锁),去 emoji                   | L-3  |
| 账号 placeholder「请输入工号或邮箱」                            | L-4  |
| 「记住登录」默认选中 + 自绘 checkbox/对勾,样式对齐              | L-5  |
| 主按钮文案「登 录」(含字距)                                     | L-6  |
| 底部提示「登录即代表同意《内网使用规范》与《安全协议》」        | L-7  |
| `login-stage`/`login-card` 圆角/阴影/内距/宽度/背景**逐值对齐** | L-8  |

> 注:现实现 `useState('admin')` 默认值会**让 placeholder 永不显示**(L-4 还原无效)——**默认值清空**,
> 若要 dev 便利可仅在 dev 环境预填。真实登录逻辑不动。

## 6. UI-3 应用外壳（依赖 UI-1）

> **二审更正**:面包屑/全局搜索壳/铃铛真实未读**已交付**(详见差距清单 §2 更正)。本切片对这些**回归保留 + 仅对齐
> 样式/文案/图标**,**勿删勿重写**。真差距集中在品牌/图标/侧栏徽标/角色/帮助图标。

**真差距(本切片要消除):**

| 断言                                                                                    | 依据    |
| --------------------------------------------------------------------------------------- | ------- |
| 品牌 mark `工` + 产品名「内网工作台」(现 `W`/`Work Platform`,L207-208)                  | S-1     |
| 全部图标改设计的**线性 SVG**:侧栏 `ModuleIcon` 首字母、顶栏 `☰`/`⌕`/`🔔` 均换掉        | S-2/S-8 |
| **侧栏 nav 项**徽标接真实未读(消息中心位,现空 `badge-slot` L228)                        | S-3     |
| 侧栏底部第二行展示**角色**(现为部门 L239;无角色名则降级部门并记录)                      | S-5     |
| 顶栏补**帮助图标**(设计有、现无)                                                        | S-8     |
| 顶栏搜索框 placeholder 对齐设计「搜索应用、文档、成员」(现「搜索应用、成员、审批… ⌘K」) | S-7     |

**已交付 · 回归保留(仅样式对齐,勿回退):**

| 项                               | 现状                                  |
| -------------------------------- | ------------------------------------- |
| 顶栏面包屑(两级,末级加粗)        | 已有(L347) — S-6                      |
| 顶栏全局搜索壳 + ⌘K + 弹层       | 已有(L350-365) — S-7                  |
| 顶栏铃铛 + 真实未读 `Badge`      | 已有(L371-376) — S-8                  |
| 侧栏宽 220px                     | 已一致 — S-0                          |
| 侧栏分组**内容随 manifest 动态** | 保持动态,仅对齐**分组样式/层级**(S-4) |

> L2 注:搜索框/帮助的真实功能不在本切片,只做视觉还原 + 保留现有交互壳。

## 7. UI-4 工作台首页（依赖 UI-1/UI-3）

> **二审更正(关键)**:`WorkbenchHome` **已接真实数据**(未读 L606-613、最新消息真实通知 L647-654、常用应用
> 真实 navigationItems L631-646),且对未建功能**诚实占位 + EmptyState、明确不展示原型假数据**(L657)。
> 所以本切片**是"换皮"——把自造 `workbench-home__*` 类换成 UI-1 的 `stat-card`/`card`/`tbl`/`quick-grid` 视觉**,
> **不是重写数据、不是接新源**。真实接线与诚实占位**一律回归保留,勿删勿造假**。

**可用的真实数据源(只接这些,不接不存在的):**

- ✅ 未读数 + 最近通知(M7 已交付,现已接)。
- ✅ 可访问入口(`navigationItems`,现已接)。
- ⚠️ 在岗:仅 `GET /presence/board`(**受 `presence:board:view` 权限门控、返回原始记录无聚合**)——
  **可选卡**:有权限才渲染(前端从 board items 客户端统计在岗数),**无权限整卡不渲染**(不空占位);无权限/无 API
  的不接。
- ❌ 待审批(M11 未建)、我的待办(vNext)、在用应用/工单/系统可用率(虚构)——**保持诚实占位或不展示,不接、不造**。

| 断言                                                                                                   | 依据 / L 层   |
| ------------------------------------------------------------------------------------------------------ | ------------- |
| 问候区**版式**换 UI-1 样式;子句继续用真实数据(勿写"3 项待办"假数)                                      | W-1 / L1 版式 |
| 头部按钮换 UI-1 样式;诚实标注的"M11 待接入"等保留(不放可点死按钮)                                      | W-2           |
| 数据卡换 `stat-card` **视觉(L1)**;内容**维持现状**(未读=真实;待审批/我的待办=诚实占位;在岗=可选权限卡) | W-3           |
| 卡片换 `card`/`tbl` **视觉(L1)**;沿用现有真实内容(常用应用/待处理占位),**不照搬设计"应用清单"虚构表**  | W-4           |
| 常用入口换 `quick-grid` **视觉**;内容(真实入口)保留                                                    | W-5           |
| 最新消息/系统动态换设计卡片**视觉**;真实通知接线 + 系统动态诚实占位**保留**                            | W-6           |

> **严禁**为凑设计版式塞"48 个应用""本月工单 236"等无源虚构内容,或把诚实 EmptyState 换成假数据(违 L2/门禁 A5)。

## 8. 测试要求

- 组件/页面 `*.spec.tsx` 走 `vitest.web.config.mts`,**`NODE_ENV=test`**(否则 `React.act` 假挂)。
- 覆盖:UI-1 关键组件渲染+态;登录页**关键文案逐字断言**(门禁 A3)/图标/默认态;外壳品牌/侧栏徽标;工作台首页
  **真实数据渲染**(mock 数据源,断言渲染的是真实字段而非虚构常量;并断言诚实占位仍在=门禁 A5)。
- **门禁 A1/A2 静态核验**:对 `apps/workbench-shell/src/**`(尤其 `styles.css`——`workbench-home__*`/`login-card__*`
  样式所在,最可能有魔法值;`components.css` 现状已 0 hex)与 `packages/ui/src/**` grep 硬编码 hex / emoji 码点,断言=0。
- `pnpm verify` 全绿(lint/typecheck/test/test:e2e/build);本切片不涉 DB/部署形态,无需 verify:full/docker:build。
- 禁止假绿/占位蒙混;还原度门禁(§2)A 类逐屏过 + B 类视觉抽查,verification-log 附核对。

## 9. 退出清单

- [ ] UI-1 组件库(基础 + 业务组件 stat-card/quick-grid)照设计规范还原,Tag 五色,全走 token、零硬编码 hex,关键组件有 web 测试。
- [ ] UI-2 登录页 L-1..L-8 全部消除(含默认值清空使 placeholder 生效),门禁过。
- [ ] UI-3 应用外壳真差距(S-1/S-2/S-3/S-5/S-8 帮助图标 + S-7 文案)消除;S-0/S-4 确认。
- [ ] UI-4 工作台首页换 UI-1 组件视觉(W-1..W-6),无虚构内容充数,门禁过。
- [ ] **回归保留(勿回退)**:外壳面包屑/全局搜索壳/铃铛真实未读、工作台真实未读/通知/应用入口接线、诚实 EmptyState 占位——全部仍在,未被删除或替换为假数据(门禁 A5)。
- [ ] 门禁 A 类(零 hex/零 emoji/文案逐字/token-only)实现方已自证;B 类视觉抽查由评审完成。
- [ ] 每屏 verification-log 附**还原度核对表 + 并排比对结论**。
- [ ] `pnpm verify` 全绿;设计稿(`docs/design/ui-handoff/`)未被改动。

## 10. 文档同步

- `docs/verification-log.md`:每个 UI-\_ 切片完成后追加(命令矩阵 + 门禁核对 + 差距 ID 销项)。
- `docs/development-workflow.md`:把"设计还原度门禁"(§2)正式纳入 UI 类交付的验收门禁(一段说明 + 链到本任务包/差距清单)。
- `docs/foundation-progress.md`:在 M8 之前登记本收口切片(状态/下一步);完成后标 Done。
- 可选 `docs/doc-index.md`:§7 收录差距清单 + 本任务包(便于后续 UI 切片引用还原度门禁)。

## 11. 提交规范

Conventional Commits,建议按切片分次提交(`feat(ui-shell)` / `fix(ui-shell)` 等),显式 `git add`。示例:

```
feat(ui): align component library + login/shell/workbench to design handoff

Pixel-perfect remediation against docs/design/ui-handoff per the foundation gap
analysis: token-only styling (no hardcoded hex), line-icon set (no emoji),
breadcrumb/search/badge in the shell, and a real-data workbench home using the
design's components (no fictional app-list/work-order content, L1/L2 boundary).
Establish the design-fidelity gate as a UI delivery gate.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

## 12. 交付边界

- 不做功能屏(组织成员→M8、消息中心→M7 回补、我的待办/审批→M11),它们在各自里程碑照对应设计稿做 L1 还原。
- 不改后端、不动设计稿、不引入新依赖(除非设计某组件确需,先在 PR 说明)。
- 切片顺序:**UI-1 → (UI-2 ‖ UI-3) → UI-4**;UI-1 是其余前置。
