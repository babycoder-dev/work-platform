# Task: M6-W 前端地基 + 工作台首页

> **范围已重定义（2026-06-06）。** 原 M6-W = forms 配置页 + 填报控件（RFC §13）。产品原型
> （`claude design` handoff）交付的是**整套产品 UI 愿景**（设计系统 + 应用外壳 + 工作台首页 +
> 审批/组织/待办/消息），其中**没有** forms 配置/填报页面，而工作台首页等都依赖一套尚不存在的
> 前端地基。故 M6-W 重定义为「前端地基 + 工作台首页」，原 forms 填报 UI 推迟到 **M8**（其真实
> 消费方 = 组织成员 → `profile.employee` 槽位表单渲染）。本任务包据此立项。

## 状态

前置依赖：M6 后端已交付（M6-1/2/3 + M6-4 全部合入 main，HEAD ≥ M6-4）。本切片**只做前端**，
不改后端 API（若发现必须改 platform 菜单契约，停下来标记为 follow-up，不在本切片擅自改）。

## 0. 任务定位

把产品原型落成真实前端地基：在 `packages/ui` 建**设计 token 层 + 基础组件库**，在
`workbench-shell` 落**应用外壳（可折叠侧栏 + 顶栏）+ 登录页重构 + 工作台首页**。后续每个业务
模块 UI（M7/M8/M9/M10/M11）都复用这套地基。

**本切片是地基，不是业务模块**：除工作台首页外，不实现审批/组织/待办/消息任何业务页面。

## 1. 必读（按序）

1. 产品原型 handoff（已纳入版本库）：`docs/design/ui-handoff/`
   - `README.md` — 自足实现说明（§4 应用外壳、§5 各页、§6 顶栏组件、§7 组件库、§8 token、§9 交互）
   - `design/tokens.css` — **设计 token 唯一真源，先读**
   - `design/企业工作台设计规范.html` — 基础组件 + 登录页 + 外壳的可视化规格（实现参考，非产品页）
   - `design/工作台.html` — 工作台首页（本切片要复现的页面，已读，逻辑/数据为演示用）
   - `design/search.js` — 全局搜索组件（演示用硬编码 INDEX，本切片只做前端壳，见 §4）
2. `apps/workbench-shell/CLAUDE.md` — 模块挂载、registry 静态 import、菜单/路由来自 manifest、
   web spec 用 `vitest.web.config.mts`
3. `packages/CLAUDE.md` — packages 单向依赖：**packages/\* 不得 import apps/\* 或 modules/\***
4. 根 `CLAUDE.md` — 三套 vitest 配置（web 用 `vitest.web.config.mts` / jsdom，`*.spec.tsx`）、
   prettier（单引号/分号/printWidth 100）、Conventional Commits
5. `AGENTS.md` — 模块边界、统一错误格式、提交规范
6. 现状基线（实现前通读，避免重复造/破坏既有 seam）：
   - `apps/workbench-shell/src/app/App.tsx`（现有极简 shell + 登录 + WorkbenchHome stub，要替换）
   - `apps/workbench-shell/src/app/navigation.ts`（`buildNavigationItems`，现在拍平了 `parentId`）
   - `apps/workbench-shell/src/styles.css`（现有 `shell__*` / `login__*` 样式）
   - `packages/ui/src/index.ts`（现在是空壳，只 re-export 一个类型）
   - `packages/platform-contract/src/rbac.ts` 的 `MenuDto`（字段见 §3.6）

## 2. 架构决策（必须遵守）

1. **分层归属**：
   - **presentational 基础组件 + token 层** → `packages/ui`。不含任何会话/路由/业务逻辑，纯展示
     - 受控 props。**不得** import `apps/*` 或 `modules/*`（packages 单向依赖）。
   - **应用外壳（侧栏 + 顶栏 + 布局 + 会话/路由接线）** → `apps/workbench-shell`，**消费**
     `@work/ui` 的基础组件。shell 知道 session/menus/router，组件库不知道。
2. **token 层落地方式**：把 `design/tokens.css` 的 CSS 变量**端口**为 `packages/ui` 的一份
   样式入口（如 `packages/ui/src/styles/tokens.css`），组件一律引用 CSS 变量，**不得散落写死
   魔法值**（颜色/间距/圆角/阴影全部走 token）。沿用仓库现有「原生 CSS」风格（参考 `styles.css`），
   不引入 CSS-in-JS 运行时。**接线步骤须显式落地**：
   - `apps/workbench-shell/package.json` 的 `dependencies` 加 `"@work/ui": "workspace:*"`，
     `pnpm install`（当前全仓无任何 `@work/ui` 引用）。
   - `packages/ui/package.json` 声明样式子路径导出（`exports` 暴露如 `@work/ui/styles/tokens.css`），
     确保 Vite + `vite-tsconfig-paths` 能解析；token 样式由 shell 在 `src/main.tsx` **引入一次**
     （现状仅 `import './styles.css'`，在其前加 `import '@work/ui/styles/tokens.css'`）。
     **注意 `exports` 一旦存在会屏蔽 `main` 隐式入口**——必须同时在 `exports` 里补主入口
     `"." : "./src/index.ts"`，否则 `import { X } from '@work/ui'` 会解析失败。
   - packages/ui 现 `build=tsc --noEmit`、`main=./src/index.ts`；新增样式资源不要破坏该约定。
3. **不新增重型 UI 框架依赖**：第一期用**自研最小原语**复刻视觉（按当前 React 19 + Vite 零 UI 框架
   栈）。**仅当**某个可访问性原语（如带 focus-trap 的弹窗、键盘可达的下拉）自研成本明显过高时，
   才考虑引入一个**无样式 headless 库**——届时**先停下来在交付说明里标记并征询**，不擅自加依赖。
   保持内网包体精简。
4. **图标**：原型用内联 SVG（24×24 stroke 线性）。`MenuDto` **无 icon 字段**（见 §3.6），故菜单
   图标用 shell 内 **`moduleName → 图标` 静态映射**实现（presentational，不属于数据）；后端菜单
   icon 字段列为**预留/vNext**。
5. **不伪造演示数据**：原型里的数字/feed/会话（待审批 12、待办 9、未读 5、在岗 231、系统动态条目
   等）是**演示假数据**。真实实现**禁止硬编码这些值**——有真实来源就接，没来源的渲染**空状态/占位**
   并标注「数据待接入（对应里程碑）」。详见 §3.5 与 §4。
6. **保真度**：高保真，像素级复现视觉（颜色/字号/间距/圆角/阴影/过渡按 token 与 README §8）。
   **响应式断点**按 README §9：≤1080px 统计卡转 2 列、双栏区转单列。**`prefers-reduced-motion`**：
   对折叠/浮层/完成等动画加 `@media (prefers-reduced-motion: reduce)` 降级（验收项，非"见 README"带过）。
7. **文案 / i18n**：本期沿用**中文硬编码**文案（与仓库现状一致），**不引入 i18n 框架**；预留为后续。
8. **保持挂载 seam**：不破坏 `module-registry` / `load-remote-module` 的远程微前端预留；菜单/路由
   仍由 manifest 数据驱动，不在 shell 硬编码业务模块菜单。

## 3. 范围拆解

### 3.1 设计 token 层（`packages/ui`）

- 端口 `design/tokens.css` 全部变量：蓝阶、中性灰阶、语义色、间距（4px 基准）、圆角、阴影、字体栈
  （清单见 README §8）。
- 由 shell 根入口统一引入；提供从 `@work/ui` 可消费的样式入口约定。

### 3.2 基础组件库（`packages/ui`）

按 README §7 + `企业工作台设计规范.html` 复刻以下**受控** presentational 组件。仓库现无 UI 组件
先例，**本切片定约定**：每个组件一目录 `packages/ui/src/components/<Name>/`，含
`<Name>.tsx` + `<Name>.spec.tsx`（+ 必要的 `<Name>.css`），统一从 `packages/ui/src/index.ts` 导出。

- **Button**（`primary/default/text/danger` × `lg/sm/block`，含 disabled 态、图标位）
- **Input / Textarea / Select**（含 `lg`、前缀图标 affix、hover/focus/disabled 态；select 自绘箭头）
- **Tag**（blue/green/orange/red/gray/purple/cyan，可带圆点）
- **Table**（表头/单元格/hover/选中行；支持组合单元格如图标方块+名称+副标、头像+名、tabular-nums 金额）
- **EmptyState**（柔光插画 + 标题 + 说明 + 可选 CTA；分语境占位）
- **Avatar**（圆形渐变 + 姓氏单字占位）
- **Badge / Dot**（红色角标、未读红点）
- **Dropdown / Menu 浮层**（点外/Esc 关闭，淡入 + translateY）
- **Drawer**（右滑 540/384，遮罩 + transform 过渡 + 阴影）—— 组件壳本期建，业务内容不做
- **ConfirmDialog / Modal**（居中，图标+标题+副标+表单槽+底部按钮，Esc/点遮罩关闭）
- **Tabs / Segmented / Pager / Checkbox / Switch**（按规格，供后续模块复用）
- **Toast**（顶部居中，自动消失）
  > 组件需有最小可访问性：键盘可达、Esc 关闭浮层、focus 态可见。每个组件配 `*.spec.tsx`（见 §6）。

### 3.3 应用外壳（`workbench-shell`）

按 README §4 复刻，替换 `App.tsx` 现有 `AppShell`：

- **侧栏**（220px，可折叠至 64px）：品牌区、分组菜单（图标+文字+选中态+角标位）、底部用户卡片；
  折叠态过渡 `width .22s`；折叠状态用 localStorage 持久化（README §9）。
- **顶栏**（56px）：折叠按钮、面包屑、搜索框、通知铃铛（+ 红点）、头像。
- **顶栏三组件**（README §6）：
  - **全局搜索框**：本期做**前端壳 + 交互**（聚焦浮层、↑↓/Enter/Esc、⌘K/Ctrl+K 聚焦）；
    结果来源**接后端搜索 API 属预留**——本期渲染空态/「搜索后端待接入」，**不照搬 search.js 的硬编码
    INDEX 当真实数据**。
  - **通知下拉**：本期做壳 + 交互；数据来源（通知 API）属 **M7 预留**，本期空态/占位。
  - **头像菜单**：用户卡片（取真实 currentUser）+ 菜单项（个人信息/设置在位状态/偏好/退出登录）；
    本期只接「退出登录」到现有 `handleLogout`，其余项占位（toast/禁用并标注）。

### 3.4 登录页重构

- 按 README §5.1 + `企业工作台设计规范.html` 复刻登录卡片视觉，复用 §3.2 组件（Input/Button）。
- 行为保持现有 `handleLogin`/错误展示不变（不改认证逻辑）。

### 3.5 工作台首页（`工作台.html` → React 页面）

按 `工作台.html` 复刻布局：问候区（+ 时钟）、4 张统计卡、左列（待处理事项 + 常用应用网格）、
右列（最新消息 + 系统动态）。**数据接线规则（关键）**：

- **问候 / 用户名 / 部门**：用真实 `currentUser`（bootstrap 已有）。**本期做**。
- **常用应用网格 / 快捷入口**：由真实菜单（`navigationItems`）驱动跳转，不硬编码业务模块。**本期做**。
- **统计卡（待我审批 / 我的待办 / 未读消息 / 在岗成员）**：
  - 在岗成员：若可经 gateway 公开 API 取 presence 汇总则接为**唯一 live 示例**（可选）；否则占位。
  - 待我审批（M11）/ 我的待办（无模块）/ 未读消息（M7）：**无来源 → 渲染占位/空态 + 「数据待接入」**，
    **不显示原型演示数字**。
- **待处理事项 / 最新消息 / 系统动态**：来源均未建 → **空状态占位**，不硬编码原型条目。
  > 即：首页结构与视觉 1:1，但凡无真实后端来源的区块一律空态化并标注，严禁伪造数据。

### 3.6 菜单数据驱动集成

`MenuDto` 字段：`id / moduleName / parentId? / title / path / permissionCode? / sortOrder / status`。

- **分组**：消费 `parentId` 构建两级菜单树（父=分组标题，子=菜单项）。**本期做**（消费已有字段）；
  若 seed 暂未配置父菜单，则平铺渲染并保证不崩。是否补 seed 父菜单为可选，不在本切片强制改后端。
- **图标**：`moduleName → SVG` 静态映射（§2.4）。**本期做（前端映射）**；后端 icon 字段=**预留**。
- **角标计数**：`MenuDto` 无字段且来源（消息/待办/审批数）未建。组件保留角标槽位但**本期不接 live
  数据=预留（M7/M11）**。
- 扩展 `navigation.ts` 支持分组时，保留 `buildNavigationItems` 既有契约与测试，新增分组构建函数 +
  其单测。

### 3.7 分阶段交付（强烈建议，按 3 个 PR/提交分段，便于独立审查）

本切片体量较大（十余组件 + 外壳 + 首页 + 测试基建），建议分三段提交，依赖顺序 W-1 → W-2 → W-3，
每段自带 spec 且 `pnpm verify` 可独立通过：

- **W-1 地基层**：测试基建（§6 扩 include）+ token 端口 + 静态组件（Button / Input / Textarea /
  Select / Tag / Avatar / Badge·Dot / EmptyState / Table）+ 各自 spec。无外部依赖，先行。
- **W-2 交互原语 + 外壳**：浮层类（Dropdown·Menu / Drawer / Modal·ConfirmDialog / Toast / Tabs /
  Segmented / Pager / Checkbox / Switch）+ 应用外壳（侧栏折叠 + 顶栏三组件 + ⌘K + localStorage）+
  登录页重构 + `navigation.ts` 分组函数。依赖 W-1。
- **W-3 工作台首页**：首页布局 + 真实数据接线 + 空态化 + presence 不回归。依赖 W-1/W-2。

若坚持单次提交，至少在 PR 描述中标出上述阶段与各阶段可验证点。

## 4. 本期做 / 预留 / 不做（对齐「文档区分本期做与预留」约定）

| 项                                   | 本期做             | 预留（占位+标注）   | 不做（其它里程碑）        |
| ------------------------------------ | ------------------ | ------------------- | ------------------------- |
| token 层 + 基础组件库                | ✅ packages/ui     | —                   | —                         |
| 应用外壳（侧栏/顶栏/折叠）           | ✅                 | —                   | —                         |
| 登录页视觉重构                       | ✅（不改认证逻辑） | —                   | —                         |
| 工作台首页结构与视觉                 | ✅                 | —                   | —                         |
| 首页：用户问候/菜单驱动入口          | ✅ 真实数据        | —                   | —                         |
| 首页：在岗统计                       | 可选 live          | 无则占位            | —                         |
| 首页：审批/待办/消息统计与预览       | —                  | ✅ 空态+「待接入」  | 业务页 M7/M8/M11          |
| 全局搜索                             | ✅ 前端壳+键盘交互 | 搜索后端 API        | —                         |
| 通知下拉                             | ✅ 壳+交互         | 通知 API（M7）      | —                         |
| 菜单分组（parentId）                 | ✅ 消费字段        | seed 父菜单（可选） | —                         |
| 菜单图标                             | ✅ 前端映射        | 后端 icon 字段      | —                         |
| 菜单角标计数                         | 槽位               | live 数据（M7/M11） | —                         |
| 审批/组织成员/我的待办/消息中心 页面 | —                  | —                   | ✅ M7/M8/M9/M11/vNext(IM) |
| forms 配置/填报 UI                   | —                  | —                   | ✅ 迁移到 M8              |

## 5. 验收断言

- [ ] `packages/ui` 导出 token 样式入口 + §3.2 全部基础组件；组件零 `apps/*`、`modules/*` import。
- [ ] `workbench-shell` 用 `@work/ui` 组件渲染新外壳；侧栏可折叠（状态持久化）；顶栏搜索/通知/头像
      三组件交互可用（点外/Esc/⌘K）。
- [ ] 登录页视觉重构完成，登录/登出/错误展示行为不回归。
- [ ] 工作台首页 1:1 复现布局；真实数据区（问候/菜单入口）接通；无来源区块为空态占位，**无任何
      原型演示假数据残留**。原型演示数字为 **待审批 12 / 待办 9 / 未读 5 / 在岗 231**；验收方式
      不是裸数字 grep（会误伤端口/尺寸/token），而是**审查首页组件源码**：统计卡/feed/消息区数值
      一律来自 props / 接口 / 空态常量，**无内联业务字面量**。
- [ ] 菜单按 `parentId` 分组渲染；`moduleName→图标` 映射生效；角标槽位存在但未接 live 数据。
- [ ] 视觉走 token 变量：组件 CSS 中颜色/间距/圆角/阴影只用 `var(--…)`；辅助检查 token 文件以外
      不出现 `#[0-9a-fA-F]{3,6}` 裸色值与魔法 `px`（合理例外如 `1px` 边框可注明）。
- [ ] 既有 presence web 页面在新外壳内仍能正常挂载与展示（不回归）。
- [ ] **新增 `.spec.tsx` 确被收集**（见 §6 测试基建）：`pnpm test:web` 输出的文件/用例数较改动前
      明显增加，不得出现"绿但没跑"。
- [ ] `pnpm verify` 全过（含 `test`=unit+web、`build`）；新增依赖（若有 headless 库）已先征询。

## 6. 测试要求

> **测试基建（必做第一步，否则后续 spec 全部白写）**：`vitest.web.config.mts` 现 `include` 只有
> `['modules/**/web/**/*.spec.tsx']`——放在 `packages/ui/**` 与 `apps/workbench-shell/**` 下的
> `.spec.tsx` **不会被收集**（CLAUDE.md 警示的"测试绿其实没跑"）。先把 include 扩为
> `['modules/**/web/**/*.spec.tsx', 'packages/**/*.spec.tsx', 'apps/**/*.spec.tsx']`，并验证扩后
> `pnpm test:web` 确实收集到新目录的 spec（对照文件/用例数）。注意 `apps/**/*.spec.ts`（非 tsx，
> 如 `navigation.spec.ts`）归 unit config，不受此项影响。

- 组件库：每个 `packages/ui` 组件配 `*.spec.tsx`（jsdom / `vitest.web.config.mts`）——渲染、变体、
  受控交互（点击/键盘/Esc/disabled）。
- 外壳：侧栏折叠切换、菜单分组渲染、顶栏浮层互斥与点外关闭、⌘K 聚焦的 `*.spec.tsx`。
- 导航：`navigation.ts` 分组构建函数单测（保留既有 `buildNavigationItems` 测试）。
- 首页：渲染真实数据区 + 无来源区块呈空态（断言不出现演示数字）的 `*.spec.tsx`。
- 命令：`pnpm test`（unit + web）、`pnpm verify`。Postgres 无关，本切片不涉及 DB。

## 7. 完成后更新文档

1. `docs/rfc/m6-dynamic-forms-file-storage.md` §13 切片表：把 **M6-W** 行范围改为「前端地基
   （token + 组件库）+ 应用外壳 + 登录页 + 工作台首页」；新增一行/注记说明 **forms 配置/填报 UI
   迁移到 M8**（其真实消费方为 `profile.employee` 槽位渲染）。§14 已决定事项补一条该重定义。
2. `docs/foundation-progress.md`：§6.2 M6 切片表 M6-W 行状态/范围更新（完成后置 Done + 日期 + 锚点）；
   §6 当前下一步在本切片合入后指向 **M7**。
3. `docs/verification-log.md`：加 `### M6-W Frontend Foundation & Workbench Home`，含命令矩阵实测、
   本期做/预留落地核对、Follow-up（forms UI→M8、搜索/通知后端→M7、菜单 icon/角标→预留）。
4. 若分组/图标的取舍需要架构层确认，按 `docs/doc-index.md` §5 触发文档审查。

## 8. 提交规范

Conventional Commits，显式 `git add`。建议信息：

```
feat(web): frontend foundation (design tokens, ui component library, app shell, workbench home)

Port the product prototype into a real frontend base: design-token layer and
base component library in @work/ui, a collapsible app shell (sidebar + topbar
search/notifications/avatar) and a restyled login in workbench-shell, and the
workbench home page wired to real user/menu data with graceful placeholders for
not-yet-built modules (no demo data hardcoded). Redefine M6-W as the frontend
foundation; forms config/fill UI moves to M8.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
