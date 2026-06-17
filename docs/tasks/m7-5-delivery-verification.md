# Task: M7-5 通知 + 调度交付验证

## 状态

前置依赖：**M7-1 ~ M7-4b 全部合入 main 后方可执行**（截至起草：M7-1 模块骨架 / M7-2 事件订阅+RecipientResolver+platform 读端口 / M7-3 调度基建 / M7-4a SSE 后端 / M7-4b 前端铃铛+卡片+SSE 消费+触发点配置 UI 均已合入 `main`，commit `33e786e` 之后含 M7-4b）。执行前 `git log --oneline -8` 确认这些都在当前 `main` 上。

## 0. 任务定位

M7 收尾切片：跑全量交付门禁、做端到端 smoke（`presence.status.changed` → 部门负责人 live 通知链路 + 铃铛/卡片/SSE 消费 + 触发点配置 UI），把结果沉淀到 `verification-log.md`，把 M7 整段在进度板置 `Done`。

- **不写新功能代码**；只允许修“验证过程中暴露的回归 bug”（并在 log 记录修了什么、为什么）。
- **安全敏感判定**：本切片是纯验证刀，不改 `apps/platform-api/src/{auth,scope,audit,security,rbac,repositories}`、不改 guard/data-scope/token/session、不加迁移。M7-2 的 platform 读端口已在 M7-2 切片过 security-reviewer（结论无未决项）。**故 M7-5 不强制 security-reviewer**；若验证中临时改到上述安全面，则必须补 security-reviewer 二审。
- **本切片是验证门禁，非功能门禁**：核心产出是“证据 + 文档收口”，不是新能力。

## 1. 必读

1. `docs/rfc/m7-notification-scheduler.md` §17 测试要求、§18 后端退出标准（9 条）、§4.2 删 app 部署清理清单、§16 前端范围
2. `docs/runbooks/presence-mvp-smoke.md`（docker postgres 起停、`pnpm db:setup`、`verify:full`、28P01 故障树、浏览器 smoke 流程，本切片复用其 bring-up）
3. `docs/development-workflow.md`（交付门禁定义）
4. 根 `CLAUDE.md`（三套 Vitest config、env-gated 测试“假绿”gotcha、`NODE_ENV` 陷阱见本任务包 §4 假绿核查第 2 项）
5. 上一交付验证先例：`docs/tasks/m5-4-delivery-verification.md` 与 `verification-log.md` 的 `### M6-4 Forms & Files Backend Delivery Verification`（本切片结构与“命令矩阵/smoke/退出清单/follow-up”格式照搬）

## 2. 验证矩阵（逐条执行并记录 pass / fail / skipped，附文件数 + 测试数）

### 2.1 快路径

```powershell
pnpm verify   # lint && typecheck && test && test:e2e && build
```

记录各子阶段实际数字：`test`（unit `*.spec.ts` + web `*.spec.tsx`）、`test:e2e`（in-memory `*.e2e-spec.ts`，含 notification / notification-stream / scheduler 三个 gateway e2e）。

### 2.2 全路径（需本机 docker postgres）

按 runbook 起 postgres 后：

```powershell
$env:DATABASE_URL="postgresql://work:work@localhost:5432/work_platform"
$env:RUN_POSTGRES_INTEGRATION="true"; $env:RUN_POSTGRES_E2E="true"
$env:PLATFORM_REPOSITORY_DRIVER="postgres"   # test:e2e:postgres 的 platform/presence/files-upload 套件需要
$env:FILES_REPOSITORY_DRIVER="postgres"      # files-upload postgres e2e 需要
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="admin123"
pnpm db:setup       # 顺序须为 platform → presence → files → forms → notification → seed
pnpm verify:full    # verify + test:db + test:e2e:postgres
```

**notification 的 Postgres 覆盖面（重要，别误判）**：

- notification 在 Postgres 下的**唯一覆盖** = `test:db` 里的 `PostgresNotificationRepository` 集成 spec（gate 仅 `RUN_POSTGRES_INTEGRATION=true`，不读 driver env）。
- gateway 的三个 e2e（`notification` / `notification-stream` / `scheduler`）在 spec 内部**强制 `NOTIFICATION_REPOSITORY_DRIVER=memory`**，跑在内存 `test:e2e` 路径，**不随任何 env 切到 postgres**——这是设计而非缺陷，`test:e2e:postgres` 清单里本就没有 notification。**因此 `verify:full` 并不存在“notification live 链路的 postgres e2e”**，live 链路的 postgres 实证靠 §3 smoke。`db:setup` / `test:db` 都不依赖 `NOTIFICATION_REPOSITORY_DRIVER`，故上面 env 块**未设它**（设了也无被测套件消费）。
- `db:setup` 各 migrate 脚本读 `DATABASE_URL`（不读 `*_REPOSITORY_DRIVER`）；判定 notification 迁移真的跑了：**确认 pnpm 打出了 `> ... db:migrate:notification` 脚本横幅且退出码 0**。注意 `migrate.ts` 只对**新应用**的迁移打印 `Applied notification migration <name>`；在已迁移过的库上重跑该段**无 Applied 行属正常**（不是被跳过）。
- 起不来 postgres：如实记录“依赖 CI verify job 兜底”，**不得默不作声跳过**。

### 2.3 Docker + compose（**本切片重点 —— 删 app 属部署形态变更**）

```powershell
pnpm docker:build
docker compose -f infra/docker-compose.prod.yml config   # 校验 compose 可解析、无悬空引用
docker compose -f infra/docker-compose.prod.yml up -d     # 起停校验（最少起到容器健康/退出码 0）
docker compose -f infra/docker-compose.prod.yml down
```

必须断言（对照 RFC §4.2 清理清单）：

- `docker:build` 产出镜像列表**不再包含 `work-platform-notification-api`**（M6-4 当时还构建过它，M7-1 已删 app；此处确认确实没了）。镜像名由 compose 项目名前缀派生（此处目录名 `work-platform` → `work-platform-<service>`）；`verification-log` M6-4 条目里写的裸名 `notification-api` 是人类简写，核对 `docker images` 时认 `work-platform-notification-api` 不存在即可。
- `docker compose config` 不报 `depends_on: notification-api` 未定义 / `NOTIFICATION_API_URL` 等悬空引用；gateway-api 服务块已无对 notification-api 的依赖与 env。
- compose `up` 能起来（不因缺 notification-api 服务而失败），`down` 干净。

> 注：`apps/notification-api/` 在 git 里已不被跟踪（M7-1 `git rm`），但工作树可能残留一个**空文件夹**。属无害残留；本切片可顺手删掉本地空目录（不影响 git），如有则在 log 记一句。

## 3. 端到端 smoke（M7 live 链路 + 前端，核心）

目标：证明 `presence.status.changed` → 部门负责人通知 **真正落库并可见**，且铃铛/卡片/SSE/触发点配置 UI 接的是真数据。优先走浏览器；live 链路也可辅以 API 级 smoke（仿 M6-4）。`pnpm db:setup` 后以 admin 登录（dev `admin/admin123`）。

**前置编排**：需要“一个有部门负责人的部门 + 一个属于该部门的非负责人员工”，这样状态变更才有接收人。**若 seed 已含带 `managerUserId` 的部门则直接复用，避免重复造数**；否则用 admin 经 UI/API 建：部门 + 设 `managerUserId` + 一个普通员工。

步骤：

1. **触发链路**：以普通员工（或 admin 代操作）在 `/presence/board` 登记一个状态（如“出差”），产生 `presence.status.changed`。
2. **接收人正确**：以**部门负责人**登录 →
   - 顶栏铃铛角标未读数 +1（角标只在 >0 显示，99+ 截断）。
   - 下拉列表能看到该条通知，文案区分“登记/取消”（RFC §5.2：登记 vs 取消文案不同）。
   - 工作台“最新消息”卡片出现该条。
3. **SSE 实时**：负责人页面**保持打开**时再触发一次状态变更 → 不手动刷新，铃铛/卡片应经 SSE 信号自动重拉刷新（收到 `notification.created` 才刷新，keepalive 不触发刷新）。断开网络/SSE 时，验证回退轮询仍能在 ~60s 内拿到新通知（可只描述行为，不强求精确计时）。
4. **已读语义**：点一条通知 → 标记已读（角标 -1）+ 按 `sourceModule/sourceId` 跳转（presence → `/presence/board`）；“全部已读”清零。
5. **归属隔离（安全）**：以**另一个无关用户**登录，其铃铛/列表/SSE **看不到**上面发给负责人的通知（只推/只列本人；SSE 不接受客户端传 `recipientUserId`）。
6. **触发点配置 UI**：以系统管理员进 `/notification/trigger-config`（菜单“通知设置”，受 `notification:trigger-config:manage` 控制）→
   - 列出触发点（含 `presence.status.changed`），切 `enabled` 开关、增删接收人（部门负责人/角色），保存成功并重载后保持。
   - 关掉某触发点 → 再触发对应事件，**不再生成通知**（证明配置真生效，非装饰）。
   - 配置变更入审计（RFC §14：actor + trigger_key + 前后值）—— 有 DB 时抽查审计表/接口。
   - 非管理员用户**看不到**该菜单/页面（权限 gate）。
7. **调度占位 job**：确认调度框架启动无报错、占位 job（心跳/清理）注册并按周期执行（看日志即可）；①②④ 接线点为预留空 handler（源码核对注释指向 M8/M10，不要求运行）。

记录每步实际结果（截图或文字描述）。

## 4. “假绿”核查（强制，source-review 而非裸 grep）

逐条确认，并在 log 写明判定依据：

- [ ] **Postgres-gated 真跑过**：`test:db` 里 `PostgresNotificationRepository` 集成 spec（gate `RUN_POSTGRES_INTEGRATION=true`）**实际执行**而非 `skipped`——核对输出文件数/测试数，确认未被静默跳过。
- [ ] **NODE_ENV 陷阱规避**：本机 shell 默认 `NODE_ENV=production` 会让 web 测试假挂（`React.act is not a function`）、gateway e2e 报 `FILE_STORAGE_LOCAL_ROOT is required in production`。**所有 web/e2e 测试须在 `NODE_ENV=test` 下跑**；若曾见到上述报错，先确认是环境而非真回归，记录排查过程。
- [ ] **无假数据/占位蒙混**：notification live 链路、SSE、触发点配置的“通过”是**真链路**（事件→落库→读出→推送），非 mock 返回固定值；以 source-review 判定（读断言与被测路径），不靠裸 grep `mock`。
- [ ] **docker:build 真无 notification-api 镜像**：核对构建输出镜像清单，确认 §2.3 断言成立。

## 5. 退出确认（对齐 RFC §18 九条，逐条打勾；尾标 `(§18-n)` 便于审计映射）

- [ ] `modules/notification`（contract+api）建成，`notification.*` schema + 迁移 + 双实现 repository，`db:migrate:notification` 已接入 `db:setup`。`(§18-1)`
- [ ] `presence.status.changed` → 部门负责人通知**端到端跑通**（in-memory e2e 绿 + §3 smoke 实证，非 mock 蒙混）。`(§18-2)`
- [ ] SSE 端点鉴权（沿用全局 `PlatformAuthGuard`）+ 只推本人 + 前端断线回退就绪并验证。`(§18-3)`
- [ ] 调度框架 + 可配置截止时间 + 占位 job 跑通；①②④ 接线点预留并注释到位。`(§18-4)`
- [ ] §7 platform 读端口已落地并过 security-reviewer（M7-2 历史结论无未决 High/Medium；本切片未改安全面，不重审）。`(§18-5)`
- [ ] `apps/notification-api` **已删除**（git 不跟踪），dev/根脚本/docker/release/CODEOWNERS/CI 引用清理干净。`(§18-6)`
- [ ] 前端铃铛 + 工作台“最新消息”卡片接真数据 + 触发点配置管理 UI 可用，通知相关 `(M7)` 占位移除（搜索壳/待处理事项等**非通知**占位不动）。`(§18-7)`
- [ ] 触发点配置写接口 + `notification:trigger-config:manage` 权限 + 审计落地并验证。`(§18-8)`
- [ ] `pnpm verify` 全绿；有 DB 时 `verify:full` 全绿；`docker:build` + compose 起停校验通过；CI 绿。`(§18-9)`

## 6. 完成后更新文档

1. `docs/foundation-progress.md`：
   - §1 总览：M7 行状态 `In Progress → Done`，结论列写“通知（落库/已读未读/事件驱动生成/接收人可配）+ 调度基建 + SSE + 前端铃铛/卡片/触发点配置 UI 已交付，门禁就绪”。
   - §6.2（或 M7 切片表）：确认 M7-1 ~ M7-4b 各行均 `Done`（避免“M7 整段 Done 但子切片仍 In Progress”的不一致），再把 M7-5 置 `Done` + 日期 + 锚点。
   - §6 当前下一步：改为指向 **M8（人员 / 组织 / 档案）**，注明 M7 已退出、M8 依赖 M5/M6/M7 已就位。
   - SessionStart 注入快照取自本文件，确保措辞与上面一致。
2. `docs/architecture.md`：确认通知模块落位（`modules/notification`、SSE 单端点、`apps/notification-api` 已废弃）已如实反映；如有滞后在此补。
3. `docs/deployment.md`：确认 notification 迁移入口、`db:setup` 顺序（含 notification）、删 notification-api 的部署影响已写清。
4. `docs/security-baseline.md`：按 RFC §15/§21 判定——§7 读端口非强制门禁项；**评估**是否补一句说明（而非“必须更新”），结论写进 log。
5. `docs/verification-log.md`：加 `### M7-5 Notification & Scheduler Delivery Verification`，含 §2 命令矩阵实测（带数字）、§3 smoke 七步结果、§4 假绿核查结论、§5 退出清单勾选、Follow-up=M8。

## 7. 提交规范

Conventional Commits 单次提交（如有回归 bug 修复随附，显式 `git add`）。建议信息：

```
chore(notification): M7 notification & scheduler delivery verification

Run pnpm verify(:full), docker:build + compose bring-up, and an end-to-end smoke
proving the presence.status.changed -> department-manager live notification chain,
SSE push/fallback, ownership isolation, and the trigger-config admin UI. Confirm
apps/notification-api removal left no deployment references. Mark M7 done; next is
M8 (people / org / profile).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
