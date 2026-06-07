# Task: M7-1 通知模块骨架（modules/notification）

## 状态

Ready for execution

## 0. 任务定位

M7 第一刀。**只做通知模块的骨架与站内通知读写最小闭环**：`modules/notification`（contract + api）、
`notification.*` schema + 迁移入口 + 双实现 repository、站内通知列表/未读数/已读 API、gateway 装配、
**删除并清理旧 `apps/notification-api` 骨架**、把 DTO 从 `packages/notification-center` 收编进模块 contract。

**本切片不做**（留后续切片，别越界）：

- 事件订阅 / RecipientResolver / platform 组织角色读端口 / `presence.status.changed`→部门负责人 live 链路 →**M7-2**
- 触发点接收人配置表 + seed + 写接口 + 权限挂载 →**M7-2**
- `@nestjs/schedule` 调度框架 + `schedule_config` 表 + 占位 job →**M7-3**
- SSE 推送端点 + 前端铃铛/工作台卡片接入 + 触发点配置管理 UI →**M7-4**

本切片**新增一个共享后端模块 + 删除一个 app**（部署形态变更）：按 `docs/doc-index.md` §5 走文档审查，
并在交付前跑 `pnpm docker:build` + compose 校验。不触及 auth/scope/audit 规则本身，故 security-reviewer
非强制（M7-2 platform 读端口才强制）；但通知读 API 的"仅本人"归属过滤要在 review 中点到。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、统一错误信封、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m7-notification-scheduler.md`（**本切片权威规格**）——重点 §3 现状、§4 模块边界、§4.2 删 app
   清理清单、§5 领域模型、§11 schema/迁移、§12 HTTP API、§19 切片（M7-1 行）、§22 已决定事项
4. `modules/presence/CLAUDE.md`（模块三包拆分、隔离、**显式 `@Inject` gotcha**）
5. `modules/forms/CLAUDE.md` 若存在；现状代码作为同构范本：
   - `modules/forms/contract/src/{manifest.ts,platform-manifest.ts,permissions.ts,events.ts,index.ts}`
   - `modules/forms/api/src/{forms.module.ts,db/migrate.ts,db/schema/*,...}`、`modules/files/api/src/files.module.ts`
   - `apps/gateway-api/src/gateway.module.ts`（模块装配 + 两个全局 Guard）
   - `apps/platform-api/src/seeds/seed-platform.ts` + `platform-module-manifest.ts`（模块 manifest/权限如何被 seed）
   - 旧骨架（迁移来源）：`apps/notification-api/src/notification/*`、`packages/notification-center/src/notification.ts`
   - `apps/gateway-api/CLAUDE.md`（全局双 Guard）
6. 删 app 引用面（§4.2 清理清单）：`infra/docker-compose.prod.yml`、
   `scripts/release/create-release-bundle.{sh,ps1}`、`.github/CODEOWNERS`、根 `package.json`、`tsconfig.base.json`

## 2. 设计要点（严格遵守）

1. **三包归一**：通知 DTO/类型的单一事实源是 `modules/notification/contract`，**不再依赖
   `@work/notification-center`**；把所需类型迁入 contract 后**删除 `packages/notification-center`**。
2. **模块包名复用 `@work/notification-api`**：删旧 app 后该名腾出，新模块 api 沿用 `@work/<module>-api`
   约定（对齐 files/forms/presence）。contract 包名 `@work/notification-contract`。
3. **schema-per-module**：模块只读写 `notification.*`，独立迁移入口 `db:migrate:notification`，**不**与
   platform 迁移合并。本切片只建 `notification.notification` 一张表（`trigger_config`/`schedule_config`
   留 M7-2/M7-3 各自迁移），但迁移入口与 `db:setup` 接线本切片建好。
4. **`channel` 是新增持久化列**：旧 DTO 丢弃了 `channels`；本期表里落 `channel`（本切片只产生/接受
   `in_app`）。`im/email/sms` 仅作类型取值位，本切片不实现投递。
5. **创建通知是内部能力**：提供 `NotificationService.create(...)`（供 M7-2 事件调用），**不开放对外
   "给任意人发通知" 的公开 POST**。HTTP 写接口仅限"已读/全部已读"。**e2e/集成测试注入数据的唯一正道**：
   从 Nest 容器取 service 直接调 `create()`（`app.get(NOTIFICATION_SERVICE)` 或 repository token），
   **禁止为了测试临时开公开写接口**（违反 §10）。
6. **读 API 严格按本人**：列表/未读数/已读只作用于 `recipient_user_id === request.user.id` 的记录；
   越权访问他人通知（如 `PUT /:id/read` 改别人的）→ 统一错误信封拒绝（404/403，与现有约定一致）。
7. **Nest 注入用显式 `@Inject`**（presence CLAUDE gotcha：esbuild 不 emit decorator metadata，裸类型注入会 500）。
8. **双 manifest**：`manifest.ts`（`WorkModuleManifest`，前端用，本切片 `menus/routes` 可为空——配置页
   route 在 M7-4 加）+ `platform-manifest.ts`（`ModuleManifestDto`，**固定 UUID** + `status`，供 platform seed）。
9. **权限点本切片不进 manifest**（关键，避免误授）：可在 contract `permissions.ts` 定义常量
   `notification:trigger-config:manage`（仅字符串，无副作用），但**绝不**把它放进 `platform-manifest.ts`
   的 `permissions` 数组——seed 会把 manifest 里所有权限**全量授予系统管理员**
   （`seed-data.ts:27-28` flatMap + `seed-platform.ts:244-247` 全量 INSERT role_permissions）。
   该权限**进 manifest + 自动授 admin** 留 **M7-2**（届时与 trigger-config 写接口一起，正好对齐 RFC §13
   "seed 挂系统管理员"）。本切片 platform-manifest 的 `permissions` 为空数组。

## 3. 模块结构（新建 `modules/notification`）

### 3.1 contract（`modules/notification/contract/src`）

- `notification.dto.ts`：`NotificationDto`（含 `channel`、`readAt?`、`sourceModule?`、`sourceId?`）、
  `NotificationChannel`（`in_app|im|email|sms`）、列表/未读数响应形、内部 `CreateNotificationInput`。
  （从 `packages/notification-center/src/notification.ts` 迁移并补 `channel`。）
- `permissions.ts`：定义常量 `notification:trigger-config:manage`（仅字符串，**本切片不进 platform-manifest**，
  见 §2.9）。
- `events.ts`：本期触发点 `triggerKey` 常量位（如 `presence.status.changed`）的占位 + **"近况记录新增不通知"
  决策注释**；`profile.updated`（④，M8 生产）**仅注释说明定在 `platform-contract`，本切片不在此定义**。
- `ports.ts`：`NotificationPort`（内部创建通知的端口接口 + Symbol token，供 M7-2 注入）。
- `manifest.ts` + `platform-manifest.ts`（见 §2.8）。
- `index.ts` 统一 re-export。

### 3.2 api（`modules/notification/api/src`）

- `notification.module.ts`：声明 controller/service/repository provider；经 gateway 装配。**模块 boot 时
  不跑迁移**（迁移只由独立 `db:migrate:notification` 脚本触发，仿 `modules/forms/api/src/db/migrate.ts`
  仅作主入口时执行）。
- `db/schema/notification.schema.ts` + `db/migrations/0000_init_notification.sql` + `db/migrate.ts`
  （类比 `modules/forms/api/src/db/*`）。
- `notification.repository.ts`（接口）+ postgres 实现 + memory 实现（沿用 `PLATFORM_REPOSITORY_DRIVER`
  同款驱动 gate；参照 forms/files 的双实现）。
- `notification.service.ts`（create 内部方法 + list/unreadCount/markRead/markAllRead，含本人归属过滤）。
- `notification.controller.ts`（§5 HTTP）。

## 4. 数据库（`notification.*`）

### 4.1 迁移 `0000_init_notification.sql`

`CREATE SCHEMA IF NOT EXISTS notification;` + `notification.notification`：

- `id`（uuid pk）、`recipient_user_id`（uuid，**无跨 schema FK 到 `platform.*`**，schema-per-module 隔离同规）、
  `title`、`content`、`source_module`(null)、`source_id`(null)、`channel`（默认 `in_app`）、`read_at`(null)、`created_at`。
- 索引：`(recipient_user_id, read_at)`、`(recipient_user_id, created_at desc)`。

### 4.2 迁移入口与 db:setup 接线

- `db/migrate.ts` 仿 `modules/forms/api/src/db/migrate.ts`。
- 根 `package.json`：加 `"db:migrate:notification": "tsx modules/notification/api/src/db/migrate.ts"`；
  `db:setup` 改为 `... && db:migrate:forms && db:migrate:notification && db:seed`。

## 5. HTTP API（`/api/notification`，经 gateway）

| 方法 | 路径                             | 说明                               | 鉴权/归属               |
| ---- | -------------------------------- | ---------------------------------- | ----------------------- |
| GET  | `/api/notification`              | 当前用户通知列表（分页、可筛未读） | 登录态；仅本人记录      |
| GET  | `/api/notification/unread-count` | 当前用户未读数                     | 登录态；仅本人          |
| PUT  | `/api/notification/:id/read`     | 单条已读                           | 登录态；非本人记录→拒绝 |
| PUT  | `/api/notification/read-all`     | 全部已读                           | 登录态；仅本人          |

- 走 gateway 全局 `PlatformAuthGuard`（introspection→`request.user`）；无 `@RequirePermissions`（登录态默认能力）。
- **不**标 `@Public`。SSE/配置写接口/内部创建 HTTP 不在本切片。

## 6. 删除旧 app 与清理（§4.2 清理清单，逐项执行）

1. 删除 `apps/notification-api/` 整个目录，**随即 `pnpm install` 刷新 workspace**。旧 app 包名就是
   `@work/notification-api`（`apps/notification-api/package.json`），新模块 api 复用同名——**必须先删旧、
   install 后再建新模块同名包**，否则两个 `@work/notification-api` 并存会让 pnpm 报重复包名。
2. 删除 `packages/notification-center/`（DTO 已迁入 contract，确认全仓无残留 `@work/notification-center` 引用）。
3. 根 `package.json`：删 `dev:notification`（模块随 `pnpm dev:gateway` 起）。
4. `infra/docker-compose.prod.yml`：删 `notification-api` 服务块；**改 gateway-api 服务**——移除
   `depends_on: notification-api` 与 `NOTIFICATION_API_URL` env。
5. `scripts/release/create-release-bundle.{sh,ps1}`：删 `work-platform-notification-api` 镜像项。
6. `.github/CODEOWNERS`：删 `/apps/notification-api/` 行；按需加 `/modules/notification/` 归属。
7. `tsconfig.base.json` / 工作区配置：删 `@work/notification-center` path，加 `@work/notification-*`（如沿用
   现有 modules 别名约定可自动覆盖，确认 `pnpm typecheck` 解析得到）。
8. **把 notification-api 当"运行中 app / 部署单元"的文档行必须改**（否则 §9.3 grep 校验失败）：
   - `README.md:40`（apps 目录树）、`CLAUDE.md:83`（apps 列表）、`docs/architecture.md:15`、
     `docs/security-baseline.md:15`（部署单元清单）、`docs/deployment.md:104`（服务清单）+ `:165`（release 镜像项）、
     `docs/runbooks/presence-mvp-smoke.md:60`（"8 个 service 镜像"→7，删 notification-api）。
   - **历史叙述保留不改**：`docs/foundation-blueprint.md:221`（老 M7 = notification-api+notification-center+
     realtime-gateway+IM 闭环，已被 ADR-0005 作废）与各 ADR 中的历史 M7 表述属历史记录，**不删**；如需可加一句
     "已由 ADR-0005 重规划"指引，但不作为本切片必改项。

## 7. 平台 seed（注册模块 manifest）

- `apps/platform-api/src/seeds/seed-platform.ts` / `seed-data.ts`：注册 notification 的
  `platform-manifest`（固定 UUID + `status: active`），**`permissions` 为空数组**（见 §2.9——本切片不放
  权限，否则会被 seed 自动授予 admin）。参照 forms/files 如何被 `seed-data.ts:14-21` 收纳。

## 8. gateway 装配

`apps/gateway-api/src/gateway.module.ts`：`imports` 加 `NotificationModule`（`@work/notification-api`）。
路由前缀来自 **controller 自带 `@Controller('notification/...')`**（与 files/forms 现状一致：
`files.controller.ts` = `@Controller('files')`、`forms.controller.ts` = `@Controller('forms/definitions')`），
**不**用 `RouterModule.register`（platform 是唯一的 RouterModule 例外，别照它）。

## 9. 验证

### 9.1 命令（全过）

```bash
pnpm install                    # 新增/删除包后刷新 workspace
pnpm lint && pnpm typecheck
pnpm test                       # 单元 + web
pnpm test:e2e                   # in-memory e2e
pnpm build
pnpm docker:build               # 删 app 改 compose → 必跑
# 有本地 Postgres 时：
pnpm verify:full                # 含 test:db / test:e2e:postgres（注意 env-gated 假绿）
```

### 9.2 断言（必须覆盖）

- **单元**：repository 双实现 list/unreadCount/markRead/markAllRead；service 本人归属过滤；
  `channel` 默认 `in_app`；markRead 写 `readAt`。
- **e2e（in-memory）**：落位 `apps/gateway-api/src/notification.e2e-spec.ts`，**以
  `apps/gateway-api/src/forms-definition.e2e-spec.ts` 为范本**（`PLATFORM_REPOSITORY_DRIVER=memory` + 整个
  `GatewayModule`；**不要抄 `presence.e2e-spec.ts`，那是 Postgres-gated**）。数据经 `app.get(service).create()`
  注入（见 §2.5）→ 列表只返回本人 → 未读数正确 → markRead 后未读减一 → **改他人通知被拒**（越权用例必须有）。
- **Postgres-gated**：notification repository 集成测试（env-gated；**确认 gate 真跑过**，别假绿）。
- **迁移**：`db:migrate:notification` 幂等（重复跑不报错）；`db:setup` 链含 notification 且顺序在 seed 前。

### 9.3 删 app 校验

- 全仓 grep 无 `@work/notification-center` 残留。
- grep `notification-api`：除 §6.8 明列的**历史叙述**（foundation-blueprint / 历史 ADR）外，
  无 app 目录/compose 服务/release 镜像/CODEOWNERS/部署单元清单残留。
- `docker compose -f infra/docker-compose.prod.yml config` 解析通过（gateway-api 不再 depends_on 已删服务）。

## 10. 必须保持不变（避免越界）

- 不动 auth/scope/audit 规则；不动 presence/forms/files 业务逻辑；不加事件订阅/调度/SSE/前端（后续切片）。
- 不开放"给任意人发通知"的公开写接口。
- 不在 platform schema 读写；org/people 数据本切片不需要（M7-2 才接）。

## 11. 完成后更新文档

- `docs/foundation-progress.md`：M7-1 完成结论 + 下一步 M7-2；§6.x 如有 M7 切片表则补行。
- `docs/architecture.md`：通知模块落位（modules/notification、删 notification-api、db:migrate:notification）。
- `docs/deployment.md`：db:setup 顺序、删 notification-api 的 compose/release 影响。
- **删 app 的部署单元文档行**：见 §6.8（README/CLAUDE.md/security-baseline/runbook 等，必改；历史叙述保留）。
- `docs/verification-log.md`：追加 `M7-1 Notification Module Skeleton` 锚点与结论。
- 如 doc-index 模块清单需收纳，补一行。

## 12. 提交规范

- Conventional Commits：`feat(notification): ...` / `chore(notification): remove legacy notification-api app`。
- 提交信息列出"删 app + 清理清单"与"新增模块"两部分。
- 交付前跑完 §9 命令，结论贴进 verification-log。
