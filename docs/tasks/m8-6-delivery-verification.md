# Task: M8-6 人员 / 组织 / 档案交付验证

## 状态

前置依赖：**M8-1 ~ M8-5b 全部合入 `main` 后方可执行**。截至起草，M8-1 部门管理 / M8-2a 档案读写后端 / M8-2b 首登向导 / M8-3 `profile.updated` / M8-4a 近况后端 / M8-4b 近况前端 / M8-5a 聚合后端使能 / M8-5b 人页聚合前端均已合入 `main`（M8-5b = PR #29，squash `a8e46b9`；M8 文档收口 `2497782`）。执行前 `git log --oneline -12` 确认这些都在当前 `main` 上、工作树干净。

## 0. 任务定位

M8 收尾切片：跑全量交付门禁、做端到端 smoke（部门管理 → 建账号 → 首登向导 → 档案读写按 `profile` 写授权 → `profile.updated` 通知本人 → 近况批量 → 人页聚合固定+自定义+在位+近况），把结果沉淀到 `verification-log.md`，把 M8 整段在进度板置 `Done`，并**对账 RFC §15 本期做 / 预留**与扫尾 §7.1–7.5 既有 follow-up。

- **不写新功能代码**；只允许修“验证过程中暴露的回归 bug”（并在 log 记录修了什么、为什么）。
- **安全敏感判定**：本切片是纯验证刀。M8 整体属安全敏感（RFC §13），但**每个触及安全面的子切片（M8-1/2a/3/4a/5a）合并前都已各自过 security-reviewer**（结论与 baseline 同步见各自 verification-log）。**故 M8-6 本身不强制 security-reviewer**；**但若验证中临时改到 `apps/platform-api/src/{auth,scope,audit,security,rbac,repositories}`、guard/data-scope/token/session、`profile` 写授权或迁移，则该回归修复必须补 security-reviewer 二审**，不得在交付刀里悄悄改安全面。
- **本切片是验证门禁，非功能门禁**：核心产出是“证据 + 文档收口 + §15 对账”，不是新能力。

## 1. 必读

1. `docs/rfc/m8-people-org-profile.md`：**§12 测试要求**、**§16 后端退出标准（10 条）**、**§15 本期做 / 预留 / 不做表**（§5 对账依据）、§13 安全要求、§17 切片计划（含 M8-5 拆分脚注 = 照片延后）
2. `docs/runbooks/presence-mvp-smoke.md`（docker postgres 起停、`pnpm db:setup`、`verify:full`、28P01 故障树，本切片复用其 bring-up；**无人员域专属 runbook**，M8 smoke 步骤见本任务包 §3 内联）
3. `docs/development-workflow.md`（交付门禁定义；§7 UI 还原度门禁——M8-5b 已过，本片不重跑还原刀）
4. 根 `CLAUDE.md`（三套 Vitest config、env-gated 测试“假绿”gotcha、`NODE_ENV` / Node25 localStorage 陷阱见 §4）
5. 上一交付验证先例：`docs/tasks/m7-5-delivery-verification.md` + `docs/tasks/m5-4-delivery-verification.md`，以及 verification-log 的 `### M7-5 ...` / `### M6-4 ...`（本片“命令矩阵 / smoke / 退出清单 / follow-up”格式照搬）
6. `docs/foundation-progress.md` **§7.1–7.5**（既有安全 / UI / 代码质量 / 领域语义 follow-up，本片 §5.5 须逐节裁定“折进 / 显式结转”）

## 2. 验证矩阵（逐条执行并记录 pass / fail / skipped，附文件数 + 测试数）

### 2.1 快路径

```powershell
pnpm verify   # lint && typecheck && test && test:e2e && build
```

记录各子阶段实际数字：`test`（unit `*.spec.ts` + web `*.spec.tsx`，含 platform web 人员管理 / 人页聚合 / 首登向导 / 近况 spec）、`test:e2e`（in-memory `*.e2e-spec.ts`，含 platform 档案读写 / 首登 / `profile.updated`→notification、以及 **`apps/gateway-api/src/people-aggregation.e2e-spec.ts`**——M8-5a 聚合链路 forms `profile.employee` 按 subject 读 / upsert + presence 按人读的跨模块同进程 e2e，是 M8 聚合最相关的链路证据，务必核对它真跑且绿）。

> **NODE_ENV / Node25 陷阱（强制）**：本机须 `NODE_ENV=test` 跑 web/e2e（否则 `React.act is not a function` / 生产态报错假挂），Node25 加 `NODE_OPTIONS=--localstorage-file=<ws>/.ls-test`。见 §4。

### 2.2 全路径（需本机 docker postgres）

按 runbook 起 postgres 后：

```powershell
$env:DATABASE_URL="postgresql://work:work@localhost:5432/work_platform"
$env:RUN_POSTGRES_INTEGRATION="true"; $env:RUN_POSTGRES_E2E="true"
$env:PLATFORM_REPOSITORY_DRIVER="postgres"   # platform / presence / files-upload postgres e2e 套件需要
$env:FILES_REPOSITORY_DRIVER="postgres"      # 补设（与 M7-5 一致；CI 必需 verify job 未设亦过，设了无害）
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="admin123"
pnpm db:setup       # 顺序须为 platform → presence → files → forms → notification → seed
pnpm verify:full    # verify + test:db + test:e2e:postgres
```

**M8 的 Postgres 覆盖面（重点，别误判）**：

- M8 的 schema 变更 = `platform.employees.registration_status` 增列（默认 `active` + check）+ `platform.status_logs` 新表，**并入既有 `db:migrate`（platform 迁移入口），不新开迁移入口、不动 `db:setup` 链顺序**（RFC §11）。判定迁移真跑了：确认 `db:setup` 打出 `> ... db:migrate` 平台迁移横幅且退出码 0；在已迁移过的库重跑无 `Applied ...` 行属正常（非跳过）。
- **M8 在 Postgres 下的核心覆盖 = `test:db` 里 `PostgresPlatformRepository` 集成 spec 对新表 / 新列的读写**（gate 仅 `RUN_POSTGRES_INTEGRATION=true`）。**确认这些 spec 实际执行而非 `skipped`**（核对文件数 / 测试数）——这是 §4 假绿核查第 1 项。
- forms `profile.employee` 的 subject 读 / upsert（M8-5a）在 Postgres 下是否有 e2e 覆盖，按实际 `test:e2e:postgres` 清单核对；**没有就如实记“live 链路 postgres 实证靠 §3 smoke”，不得默不作声当已覆盖**。
- 起不来 postgres：如实记录“依赖 CI verify job 兜底”，**不得默不作声跳过**。

### 2.3 Docker + compose

```powershell
pnpm docker:build
docker compose -f infra/docker-compose.prod.yml config   # 校验 compose 可解析、无悬空引用
docker compose -f infra/docker-compose.prod.yml up -d     # 起停校验（容器健康 / 退出码 0）
docker compose -f infra/docker-compose.prod.yml down
```

必须断言：

- **M8 不改部署形态**（不删 / 不增 app，不新增迁移入口）——`docker:build` 镜像清单与 M7-5 后一致，无新增 / 缺失服务。本片确认“M8 未引入部署回归”即可，**不重复 M7-5 的删 notification-api 断言**（那是 M7 历史项）。
- compose `config` 无悬空引用、`up`/`down` 干净。
- 若 `docker:build` 不便本机跑，如实记“依赖 CI docker-build job 兜底”（main 必需检查含 `docker-build`）。

## 3. 端到端 smoke（M8 全链路，核心）

目标：证明“以人为中心”的组织管理基座**端到端真跑通**，每屏接真数据、按 `profile` 范围真授权、无假数据 / 占位蒙混。优先走浏览器；写授权 / `profile.updated` 双向断言可辅以 API 级 smoke（仿 M6-4）。`pnpm db:setup` 后以 admin 登录（dev `admin/admin123`）。

> **UI 缺口说明（先读，避免误判 fail）**：M8-5b §0.3 已**显式延后**整组**管理写 UI** 到 M8-7 / 独立切片——即 **建账号、编辑他人固定档案字段、改员工状态 / 角色、重置密码**（`EmployeesPage` 行内动作当前只有「查看抽屉」「批量记录近况」「刷新」，无新建 / 编辑 / 改密入口），以及 **file/image/employee 自定义字段编辑**、**档案照片**。凡涉及这些的 smoke 步骤，**一律走后端 API 完成（`POST /employees`、`PUT /employees/:id/profile`、`PUT /employees/:id/status`、`PUT /employees/:id/roles`、`PUT /employees/:id/password` 等）并在 log 注明“UI 延后 M8-7、API 路径验证”**（仿 M5-4 第 4 步对未交付 UI 的处理），**不判 fail**；但须在 §5.5 对账登记为显式结转项。已交付 UI 的步骤（部门树 `OrganizationPage`、首登向导 M8-2b、人页「成员详情」抽屉 + HR 自定义字段填报）走浏览器。

步骤：

1. **部门管理（M8-1）**：admin 进 `/platform/organization`（或对应部门树页）→ 建两层部门树、设某部门 `managerUserId`、移动部门、删一个**被占用**的部门 → 期望 409 占用提示；解除占用后删除成功。审计落 actor/目标/前后值（有 DB 时抽查）。
2. **建账号 + 首登向导（M8-2a/2b）**：admin **经 API**（`POST /employees`，建账号 UI 延后 M8-7，见缺口说明）建一个普通员工账号（隶属步骤 1 的部门，`mustChangePassword=true`）→ 以该账号登录 → **走首登向导 UI**（M8-2b 已交付）强制改密 → 补全本人档案两步向导 → 进工作台。确认未改密 / 未补全不能跳过向导。
3. **档案读写 + `profile` 写授权（M8-2a）**：
   - 本人读 `me` = 窄 DTO；管理读他人 `:id` = 管理 DTO（按 `profile` 范围，越权读他人**不泄露存在性**）。
   - 本人改本人字段子集成功；**管理改他人 `:id/profile` 按 `profile` 写范围逐目标校验**（范围内成功、范围外拒）——**管理写 UI 延后，走 API**（见缺口说明）。
4. **`profile.updated` 通知本人（M8-3，双向断言防假绿）**：
   - **他人改 A 的档案 → A 收到站内通知**（铃铛角标 +1 / 列表出现 / 工作台卡片）；notification 表出现 `recipient=A` 记录。
   - **A 改 A 自己 → 不产生通知记录**（验证去自身逻辑）。
   - 通知 payload 仅 id + 变更字段名、**不带字段值**（最小披露，源码 / 接口核对）。
5. **近况批量（M8-4）**：以有 `profile` 范围的用户给**多个**员工批量记录一条近况（≤100 人 / ≤2000 字上限生效）→ 各 subject 人页脉络可见；越权 subject 被逐条拒（部分成功语义按实现核对）；`platform:status-log:create` 权限 gate 生效。
6. **人页聚合（M8-5b）**：在员工列表行单一入口打开「成员详情」抽屉 → 抽屉标题含员工姓名 → 聚合显示**固定字段 + 自定义字段(forms) + 在位(presence) + 近况脉络(status-logs) + 照片占位**。逐区降级断言：
   - forms 定义 / 记录 404（未配 `profile.employee` 或无记录）→ 自定义区**优雅降级为空 / 提示**，非整页崩。
   - presence 无当前在位记录 → 在位区显示“无 / 占位”，**error（500/403）与 null（无记录）区分**（不把异常当“无在位”）。
7. **HR 自定义字段填报闭环（M8-5a/5b，覆盖式写防数据丢失）**：
   - 配置 forms `profile.employee` 定义（含若干轻字段类型：text/number/single_select/multi_select 等）。
   - HR 经人页填报 → 保存 → 重载后保持。
   - **关键防回归**：upsert 是覆盖式写（后端 `replaceRecordValues` 未传字段会被丢弃）→ 编辑保存后，**未改动的既有字段值不丢**（全值回传只取 `{fieldKey,value}` 原始类型，含 read-only passthrough）。`displaySnapshot` 为对象的字段（single_select `{key,label}` / multi_select `[{key,label}]` / employee `[{name}]`）读态**不显示为 `[object Object]`**（`formatCustomFieldDisplay` 生效）。number 非法输入有 NaN 守卫；并发改 409 由 `ApiError.status===409` 识别。
8. **权限 / 范围隔离（安全）**：以**无关 / 低权用户**登录 → 看不到部门管理 / 近况录入 / HR 填报等受权菜单与入口；其人页 / 列表按 `profile` 范围只见授权范围内，越权目标不泄露存在性。

记录每步实际结果（截图或文字描述）。

## 4. “假绿”核查（强制，source-review 而非裸 grep）

逐条确认，并在 log 写明判定依据：

- [ ] **Postgres-gated 真跑过**：`test:db` 里 `postgres-platform.repository.integration.spec.ts` 对 `registration_status` / `status_logs` 的集成断言（gate `RUN_POSTGRES_INTEGRATION=true`）**实际执行**而非 `skipped`——核对文件数 / 测试数，确认未被静默跳过。
- [ ] **本机起不来 PG 时不得凭快路径判绿**：M8-4a 合并时本机 docker 不可用、PG-gated 仅 added 未本地执行，真执行靠 CI。故若本机无法跑 `verify:full`，**必须确认 M8-6 PR 的必需 `verify` CI job 绿**（CI 在真 PG 上跑 `test:db` + `test:e2e:postgres`），不得仅凭本地快路径判 M8 收尾绿（MEMORY：PG-gated CI 覆盖别判假绿）。
- [ ] **NODE_ENV 陷阱规避**：本机默认 `NODE_ENV=production` 会让 web 测试假挂（`React.act is not a function`）、e2e 报生产态缺 env。**所有 web/e2e 须在 `NODE_ENV=test` 下跑**；若曾见上述报错，先确认是环境而非真回归，记录排查过程。
- [ ] **Node25 localStorage 陷阱规避**：本机 Node25 全局 `localStorage` 让 web 测试 `beforeEach` 报 `clear is not a function`；本地加 `NODE_OPTIONS=--localstorage-file=<ws>/.ls-test` 绕过（CI Node22 不受影响）。
- [ ] **`profile.updated` 是真链路非 mock**：他人改 → 事件 → notification 落库 → 读出，且**本人改无记录**的双向断言以 source-review 判定（读断言与被测路径），不靠裸 grep `mock`。
- [ ] **HR 自定义字段覆盖式写无数据丢失 / 无 `[object Object]`**：以 source-review 核对全值回传 + `formatCustomFieldDisplay`（PR #29 已修，本片复证未回归），非靠固定 mock 返回值。

## 5. 退出确认（对齐 RFC §16 十条，逐条打勾；尾标 `(§16-n)` 便于审计映射）

- [ ] 部门 CRUD（增删改、设负责人、移动、占用删除 409）落地，OrgService 补满，双实现。`(§16-1)` — 注：部门表既存，M8-1 **无新 DDL**（`foundation-progress` M8-1 行“无 DDL”），本条“迁移”指 M8 整体的 `status_logs` / `registration_status`，**勿因找不到“部门迁移”判 fail**。
- [ ] 员工档案：详情 `:id`、本人 `me` 读写、管理改他人 `:id/profile` 落地，**全部经写收口 service**，按 `profile` 范围校验（写授权范围已在 M8-2a 同变更补 `security-baseline §5`）。`(§16-2)`
- [ ] 首登链路跑通：建账号 → `mustChangePassword` → 改密 + 补全 → 档案生效（e2e 绿 + §3 smoke 实证）。`(§16-3)`
- [ ] `profile.updated` 契约 + platform 生产（他人改才发）+ notification 订阅器 / handler，端到端落库通知本人跑通（e2e 绿 + 双向断言：他人改才有、本人改无；非 mock 蒙混）。`(§16-4)`
- [ ] `registration_status` 增列 + check，本期恒 `active`，写收口 service 为未来审核 / 注册预留单点（注释到位）。`(§16-5)`
- [ ] 近况记录（含批量）落地，可见 / 新增按 `profile` 范围。`(§16-6)`
- [ ] HR 自定义字段经 M6 forms `profile.employee` 槽位可配可填，前端人页聚合固定 + 自定义字段。`(§16-7)`
- [ ] 新权限点进 platform manifest + seed；审计覆盖档案 / 部门 / 近况写。`(§16-8)`
- [ ] 每个触及安全敏感面的切片（M8-1/2a/3/4a/5a）合并前已过 security-reviewer，历史结论无未决 High/Medium（本片未改安全面，不重审；若改则补审）。`(§16-9)`
- [ ] `pnpm verify` 全绿；涉 schema 变更确认迁移 + 双实现 + Postgres-gated 真跑；有 DB 时 `verify:full` 全绿；`docker:build` + compose 起停校验通过；CI 绿。`(§16-10)`

## 5.5 §15 本期做 / 预留对账 + follow-up 扫尾（强制，本片特有产出）

交付门禁不能默认“§15 本期做都做了”就置 Done。**逐项对账 RFC §15「本期做」与实交付，差异显式登记为结转项**：

- **照片 / 文件字段**：RFC §15 列「本期做（消费 M6）」，但 §17 M8-5 拆分脚注已把**档案照片下载延后独立切片**（涉 files 二进制流 + 跨模块授权链）；M8-5b 又延后 **file/image/employee 自定义字段编辑**。→ 在 §6 文档与 `verification-log` 显式记“§15 照片 / 重字段编辑本期未交付、延后命名切片”，并在 `foundation-progress` 新增 / 复用 follow-up 行。**这是有意延后、非遗漏**，须写清用途与触发条件。
- **管理员编辑他人固定档案字段写 UI**：后端（M8-2a `:id/profile`）已交付，写 UI 延后 M8-7（M8-5b §0.3）。→ 同上登记。
- **§7.1 安全 follow-up**（员工 `:id/status`、`:id/password` 租户校验 = High；建账号未受 `profile` 写范围 = Minor）：M8 收尾必须**显式复核**——单租户部署下无现实攻击面，**结论写进 log（“启用多租户前必修”），不得静默放过**。
- **§7.2 UI（共享 Modal 还原）/ §7.3（M8-4a 质量 4 项）/ §7.4（M8-4b 质量 4 项）/ §7.5（M8-5a 领域语义 2 项）**：逐节裁定“本片顺手折进”还是“显式结转”，结论记 log。**默认非阻塞、可结转**；若本片验证中发现其中某项已恶化为真 bug，则折进修复 + security/质量复核。

> 产出：`verification-log` M8-6 条目须含一节“§15 对账 + follow-up 处置表”，逐行写状态（已交付 / 结转 / 折进修复）。

## 6. 完成后更新文档

1. `docs/foundation-progress.md`：
   - §1 总览：M8 行状态 `In Progress → Done`，结论列写“部门管理 + 档案读写（写收口 + `profile` 写授权）+ 首登向导 + `profile.updated` 通知 + 近况记录 + 人页聚合（固定 + 自定义 + 在位 + 近况）已交付，门禁就绪；照片 / 重字段编辑 / 固定字段管理写 UI 结转后续切片”。
   - §6 M8 切片表：确认 M8-1 ~ M8-5b 各行均 `Done`，再把 M8-6 置 `Done` + 日期（2026-06-28 或实际执行日）+ verification-log 锚点。**顺手修既存悬空锚点**：M8-4b 行写“详见 verification-log `M8-4b Status Logs Frontend`”，但该标题不存在（M8-4b 内容并入 M8-5b 条目）——改指向真实锚点或补一条 M8-4b 小条目，勿盖章放过。
   - §6 当前下一步：改为指向 **M9（在位状态 v2）**，注明 M8 已退出、M9 在 M4 presence 基础上扩展，并记“§7.5 presence 看板快照过滤待 M9 统一”。
   - §7 follow-up 各节：按 §5.5 裁定结果更新状态 / 新增照片 / 重字段编辑 / 固定字段管理写 UI 的结转行。
   - SessionStart 注入快照取自本文件，确保措辞与上面一致。
2. `docs/architecture.md`：确认人员 / 组织 / 档案落位（platform 内核、`platform.status_logs`、人页前端聚合、forms `profile.employee` 槽位、未新建 `modules/profile`）已如实反映；如有滞后在此补。
3. `docs/security-baseline.md`：确认 `profile` 写授权规则（M8-2a 已补 §5）与 M8 新权限点已反映；§7.1 安全 follow-up 结论同步。
4. `docs/deployment.md`：确认 M8 迁移并入 platform `db:migrate` 入口、`db:setup` 顺序不变、`registration_status` / `status_logs` 的部署影响已写清（如未写则补）。
5. `docs/verification-log.md`：加 `### M8-6 People / Org / Profile Delivery Verification`，含 §2 命令矩阵实测（带数字）、§3 smoke 八步结果、§4 假绿核查结论、§5 退出清单勾选、**§5.5 §15 对账 + follow-up 处置表**、Follow-up=M9 + 命名结转切片。
6. `docs/doc-index.md`：§7 任务包目录补 M8-6 行。

## 7. 提交规范

Conventional Commits 单次提交（如有回归 bug 修复随附，显式 `git add`）。建议信息：

```
chore(platform): M8 people / org / profile delivery verification

Run pnpm verify(:full), docker:build + compose bring-up, and an end-to-end smoke
proving department management, account creation + first-login wizard, profile
read/write under profile write-scope, the profile.updated self-notification chain
(double-asserted), batch status logs, and the people-detail drawer aggregation
(fixed + custom forms + presence + status logs). Reconcile RFC §15 built/deferred
(photo, heavy-field editing, fixed-field management UI deferred) and sweep the
§7.1-7.5 follow-ups. Mark M8 done; next is M9 (presence v2).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
