# RFC: M7 通知基建 + 定时任务调度

## 状态

Accepted ｜ 起草 + 定稿 2026-06-07（两轮独立评审通过）｜ 依据 `docs/product-requirements.md` §4.3、`docs/adr/0005-product-replan-roadmap.md`

> 阅读约定沿用需求文档：每项能力标 **【本期做】/【预留】/【不做(vNext)】**。预留项必须留好
> 数据模型 / 接口 / 事件名并写清未来用途，不留无人知晓的空白字段。

## 1. 目标

把"自研轻量站内通知"与"定时任务调度"两块共用基建从骨架长成可用基线，供后续 M8/M9/M10/M11
业务模块直接消费——与 M6（动态表单 / 文件存储）一样属**共用基建先于业务模块**（ADR-0005 决策 1）。

本期具体交付：

1. **通知基建做满**：`notification.*` schema、持久化存储、已读/未读、事件驱动生成、接收人可配置解析、
   SSE 实时推送、外部 IM 投递**预留接口位**。
2. **接通 1 条 live 端到端链路**：`presence.status.changed` → 通知部门负责人（可配公司负责人/HR/助理），
   作为管道的可见验证。
3. **定时任务调度基建做满**：可配置截止时间 + 周期检查的 job 注册框架；日报相关的**具体检查逻辑**
   留预留接线点（生产数据要 M9 在岗 + M10 日报，本期不存在）。
4. **前端接通**：workbench-shell 顶栏铃铛 + 工作台"最新消息"卡片接真实数据 + 未读角标 + SSE。

## 2. 非目标

- **不做通用规则引擎**（when-this-then-that / 条件分支 / 公式）——少量内置触发点 + 接收人可配即可，
  通用自动化收敛到 vNext 多维表格自动化平台（ADR-0005 决策 2）。
- **不接入外部 IM**（OpenIM 等人对人聊天）——仅留 `channels` 投递位；真正接入属 vNext。
- **不引入重型实时网关**（socket.io / `realtime-gateway` / Kafka）——SSE 走通知模块单端点轻量直推。
  ADR-0005 明确**新 M7 不触发 gateway 拆分**（ADR-0003 的"M7 拆 gateway"指老 M7，归 vNext）。
- **不做** ①日报截止提醒、②日报交齐提醒 的**具体业务逻辑**（生产者要 M10）；不做 ④档案被改通知 的
  **生产者**（要 M8）——本期定义事件名 + 接线点预留，后续里程碑接上。
- 不做跨进程可靠事件投递（outbox / 分布式总线）——本期通知与 presence 同进程（gateway 内嵌），
  用现有内存 `MemoryEventBus`；持久化 outbox 留预留（服务真正拆分时做）。

## 3. 现有约束（现状盘点）

| 现状                           | 结论                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/notification-api`        | 纯内存骨架：`Map` 存储、无 schema、不订阅事件、无真正持久化已读/未读。**本期吸收并废弃**，逻辑迁入 `modules/notification`。                                                                                                                                                               |
| `packages/notification-center` | 已有 `NotificationDto` / `CreateNotificationInput` / `NotificationChannel`（`in_app`/`im`/`email`/`sms`）。`im`/`email`/`sms` 即外部投递**预留取值位**。注：现 DTO/存储**未落地 channel 列**（`createNotification` 丢弃 `input.channels`），本期沿用类型但 `channel` 是**新增持久化列**。 |
| `packages/event-bus`           | 只有内存 `MemoryEventBus`（`publish`/`subscribe`）。presence 已 `publish('presence.status.changed')`。同进程订阅可直接用。                                                                                                                                                                |
| 调度                           | **完全缺位**：未引 `@nestjs/schedule`，无任何 cron / interval job。本期新建。                                                                                                                                                                                                             |
| 触发点生产者                   | 仅 **③ 状态变更**有 live 生产者（presence/M4，create+cancel 两处均 publish）；①要 M9 在岗+M10 日报、②要 M10、④要 M8。                                                                                                                                                                     |
| 组织数据                       | `DepartmentDto.managerUserId` 契约已有；但 `OrgService` 仅 `list/create`，**无"按 userId 解析部门负责人 / 按角色解析用户"** 的读端口。本期在 platform 扩出口（§7）。                                                                                                                      |
| 前端占位                       | shell 顶栏铃铛（`App.tsx` `🔔` + `Dot` 角标）与工作台"最新消息"卡片已显式标 `(M7)` 待接入。本期接真数据。                                                                                                                                                                                 |

约束沿用：单 PostgreSQL、schema-per-module 隔离、统一错误信封、`@RequirePermissions`、领域事件协作
（`AGENTS.md` / `docs/security-baseline.md`）。**鉴权（重要纠正）**：notification 本期与 platform/presence
同进程内嵌于 gateway，沿用 gateway 全局 `PlatformAuthGuard`（opaque 令牌 introspection → 进程内 `request.user`），
**不存在 phantom-token / 内部 JWT**——ADR-0004 §3 的"M7 引入内部 JWT"指**老 M7（业务模块拆独立进程）**，
按 ADR-0005 新 M7 不拆 gateway，故不触发；该 M 号语义碰撞在 §21 同步消解。

## 4. 模块边界

### 4.1 新建共享后端模块 `modules/notification`

与 M6 `modules/forms`、`modules/files` 同构（决策 3）：

- **contract**（`modules/notification/contract/src`）：单一事实源——`permissions.ts`、`events.ts`、
  DTO（`notification.dto.ts`）、对外 `ports.ts`、触发点配置类型、调度 job 类型。**两个 manifest 形态**
  （照搬 forms/files）：`manifest.ts`（`WorkModuleManifest`，前端用）+ `platform-manifest.ts`
  （`ModuleManifestDto`，带固定 UUID + `status`，供 platform seed）。
- **api**（`modules/notification/api/src`）：拥有 `notification.*` schema（**仅此 schema**），
  独立迁移入口 `pnpm db:migrate:notification`（类比 presence/files/forms）。订阅领域事件、生成通知、
  SSE 端点、调度 job 注册。
- **web**：**含一个最小挂载页**——触发点配置管理页（仿 `modules/platform/web` 的 `RolesPage`：
  模块 web 页 + manifest 声明一条 route/menu，`permissionCode: notification:trigger-config:manage` gate，
  经 `moduleRegistry` + `buildModuleRouteTable` 挂入 shell，权限不足不显示）。**铃铛 + 工作台"最新消息"
  卡片仍是 shell chrome**（不是模块路由页），shell 经 `@work/http-client` 直接消费通知 API。
  > 即：配置管理页走"模块 web 页"正规路径（与 M5 角色管理 UI 同范式，避免在 shell 里手写路由——
  > `workbench-shell/CLAUDE.md` 要求 menus/routes 来自 manifest）；通知展示区（铃铛/卡片）属外壳装饰。

模块只能依赖自己的 contract、`packages/*`、`platform-contract`、`platform-sdk`；org/people/role 数据
**经 `@work/platform-contract` 暴露的进程内只读端口**获取（详见 §7），绝不跨 schema join
（`modules/presence/CLAUDE.md` 同规）。

### 4.2 装配与废弃 notification-api

- `modules/notification/api` 经 gateway 装配（与 forms/files 一致）。
- `apps/notification-api` 的内存逻辑迁入新模块后**直接删除该 app**（已定，§22）。**完整清理清单**
  （已核对引用面）：
  - `pnpm dev:notification` + 根 `package.json` 相关脚本；
  - `infra/docker-compose.prod.yml`：删 `notification-api` 服务块，**并改 gateway-api 服务**——移除
    `depends_on: notification-api` 与 `NOTIFICATION_API_URL` env（否则 compose 起不来；`docker:build`
    不校验 `depends_on`，需额外 compose 校验）；
  - `scripts/release/create-release-bundle.{sh,ps1}` 的 `work-platform-notification-api` 镜像项；
  - `.github/CODEOWNERS` 的 `/apps/notification-api/` 行；CI 中对它的 build/test。
  - 属部署形态变更 → 走文档审查 + `pnpm docker:build` + compose 起停校验。

## 5. 通知领域模型

### 5.1 概念

- **通知（notification）**：一条发给**单个接收人**的站内消息（一次触发 fan-out 成 N 条，每接收人一条，
  沿用现有 `createNotification` 把 `recipientUserIds[]` 展开为多条的语义）。
- **已读/未读**：`readAt` 为空即未读（DTO 已有该字段）。提供单条已读、全部已读、未读计数。
- **来源**：`sourceModule` + `sourceId`（如 `presence` + 状态记录 id），用于前端跳转与去重。
- **渠道（channel）**：`in_app`【本期做】；`im`/`email`/`sms`【预留】——本期写入时只实际投递 `in_app`，
  其余渠道走**投递器接口**（§8.4）的 no-op 实现，留扩展位。

### 5.2 触发点（接收人解析）

| #   | 触发点             | 生产者事件                                             | 默认接收人         | 可配                          | 本期                                                   |
| --- | ------------------ | ------------------------------------------------------ | ------------------ | ----------------------------- | ------------------------------------------------------ |
| ③   | 在位状态变更       | `presence.status.changed`（已存在，登记+取消两处均发） | 变更人的部门负责人 | +公司负责人/HR/助理（按角色） | **本期接通 live**                                      |
| ④   | 个人信息被他人修改 | `profile.updated`（本期定义，M8 发）                   | 被修改的本人       | —                             | **预留接线**（事件名+处理器位本期定，M8 发事件即生效） |
| ①   | 日报截止前未交提醒 | 调度 job（见 §9）                                      | 未交的本人         | —                             | **预留**（依赖 M9 在岗 + M10 日报）                    |
| ②   | 日报交齐提醒       | 调度 job / `report.*` 事件                             | 部门负责人         | —                             | **预留**（依赖 M10）                                   |

**明确不通知**：给某人新增近况记录**不通知**本人（需求 §4.3）——本期不为近况记录注册任何触发点，
并在 `events.ts` 注释标注此决策，防止后人误加。

接收人解析交给 **RecipientResolver**（notification/api 内），输入触发点配置（§6）+ 事件 payload，
输出去重后的 `recipientUserIds[]`；解析"部门负责人""某角色的所有用户"经 §7 platform 读端口，
不读 platform schema。③ 的 `changedBy` 可能 = 被变更人本人（自助登记）或管理员代操作，登记/取消两种
发生源的**通知文案分别定义**（如"…登记了出差"/"…取消了出差状态"），并按规则去重/排除触发者本人。

## 6. 触发点接收人配置

归属 `notification.*` schema（需求 §8 待解决 #2 默认：通知自己的触发配置自己存）。

- 每个触发点一条配置：`triggerKey`（如 `presence.status.changed`）、`enabled`、
  `defaultRecipients`（结构化：`{ kind: 'department_manager' | 'role' | 'self' | 'subject', roleCode? }[]`）。
- 本期 ③ 默认 `[{kind:'department_manager'}]`，管理员可加 `{kind:'role', roleCode:'company_head'|'hr'|'assistant'}`。
- **本期做写接口 + 最小管理 UI（已定，§22）**：seed 写入默认值；另提供读 + 改接口
  （`GET /api/notification/trigger-config` 列表、`PUT /api/notification/trigger-config/:key` 按触发点改，详见 §12），
  由系统管理员经最小管理 UI 调整每个触发点的 `enabled` 与
  `defaultRecipients`。写接口受 `notification:trigger-config:manage` 功能权限保护（§13），变更入审计（§14）。
  UI 范围控制在"列出触发点 + 开关 + 接收人增删"的最小集，不做规则编排。

## 7. Platform Core 扩出口（接收人解析读端口）

notification 需要、但属 platform 的只读组织/角色查询。**落地形态（B1 纠正）**：照搬 presence 拿
scope/audit 的既有范式——在 `@work/platform-contract` 新增一个 **进程内只读端口接口 + Symbol token**
（如 `PLATFORM_ORG_PORT`），platform 侧实现并在 `apps/platform-api/src/platform.module.ts` 用
`useExisting` 提供 + `exports`，notification/api 经 `@Inject(PLATFORM_ORG_PORT)` **进程内注入**调用。
**不是** platform-sdk（那是前端浏览器侧 SDK），**也不开公开 HTTP 端点**（同进程内嵌无需跨网调用，
开端点反而扩大鉴权攻击面）——这同时回答 §23 待审项 #3。

端口方法（初拟）：

- `resolveDepartmentManager(enterpriseId, userId): { managerUserId?: string }` —— 解析某人所在部门的负责人。
- `listUserIdsByRole(enterpriseId, roleCode): string[]` —— 解析持某角色的所有用户（用于"可加公司负责人/HR/助理"）。

> 签名带 `enterpriseId`（从 `request.user.enterpriseId` 传入），对齐既有 `PlatformEmployeeLookupPort`
> 等按企业隔离的端口范式（`packages/platform-contract/src/users.ts`）。

实现落在 `apps/platform-api/src/org`（或 scope 邻域），只返回 id、不返回敏感档案字段。
**安全敏感**：暴露组织结构 + 角色成员关系；虽属只读 id 端口（见 §15 关于 security-baseline §16 的判定），
仍走 **security-reviewer 独立二审**。

## 8. 事件订阅、生成与投递

### 8.1 订阅框架

notification/api 启动时向 `EVENT_BUS` 订阅本期触发点事件（本期仅 `presence.status.changed`；
`profile.updated` 处理器**注册但生产者未发**，预留即可）。同进程内存总线足够（§2）。

### 8.2 生成流程

事件 → 查触发点配置 → RecipientResolver 解析接收人（去重、排除触发者本人按触发点规则）→
按 channel fan-out 写 `notification.*` → 实际投递 `in_app`（落库 + SSE 推送）→ 其余 channel 投递器 no-op。

### 8.3 可靠性边界（本期 best-effort）

- 事件处理失败**不**阻塞业务主流程（presence 写入已先于 publish 完成）；失败**记日志 + 审计**，
  本期不做重试/补偿。**持久化 outbox + 重试**【预留】，服务拆分或可靠性要求提升时做。

### 8.4 投递器接口（渠道扩展位）

定义 `NotificationDeliverer { channel; deliver(notification): Promise<void> }`；本期实现 `InAppDeliverer`
（落库已在生成阶段完成 + 触发 SSE）；`im`/`email`/`sms` 投递器**接口位预留**，不实现。

## 9. 定时任务调度基建

### 9.1 选型

**已定（§23-1）：引入 `@nestjs/schedule`**（Nest 官方轻量包，基于 cron/interval，无外部依赖）——满足"不引入重型"。

### 9.2 本期做

- **Job 注册框架**：统一的 job 定义（key、cron 表达式 / 周期、handler）、启停、可配置时间来源。
- **可配置截止时间**：`notification.*`（或调度配置表）存"日报截止时间"等参数，job 读配置而非硬编码。
- **一个可验证的占位 job**：如"心跳/清理过期通知"job 跑通，证明调度框架可用（不依赖未建业务）。

### 9.3 预留（不做具体业务逻辑）

- ①"在岗但未交日报 → 提醒本人"、②"交齐 → 提醒负责人"的 job handler **接线点预留**：定义 job key +
  空 handler + 注释指向 M10；真正实现要 M9 在岗名单 + M10 日报提交记录，本期都不存在。

## 10. SSE 实时推送

按你拍板的 **SSE 推送**，但严守"不引入重型实时网关"：

- **单端点**：`GET /api/notification/stream`（SSE，`text/event-stream`），由 notification/api 直接持有连接，
  **不**引入 socket.io / `realtime-gateway`。
- **鉴权（B2/B3 纠正，落地关键）**：沿用 gateway 全局 `PlatformAuthGuard`（introspection→`request.user`），
  **不是 phantom-token**（本期同进程内嵌，§3）。两个硬约束必须在实现期解决，本 RFC 先定方向：
  1. 浏览器原生 `EventSource` **不能设 Authorization 头**，而本仓对外是 opaque Bearer（非 cookie）。
     方案：前端**不用原生 EventSource**，改用 `fetch` + `ReadableStream`（可带 `Authorization` 头，复用
     `@work/http-client` 注入令牌）消费流（首选）；退路是 query 参数传令牌 + 专用 guard（次选，令牌易进
     日志/历史，需谨慎）。
  2. gateway 注册了**两个全局 `APP_GUARD`**（`PlatformAuthGuard` + `PermissionGuard`，见
     `apps/gateway-api/CLAUDE.md`）。`/stream` 走 fetch+Authorization 即能过 `PlatformAuthGuard`（与普通 REST
     一致），**不**标 `@Public`（避免裸开放）；`PermissionGuard` 对无 `@RequirePermissions` 的路由放行，
     与 §13"不单设功能权限"一致。
  - 连接绑定 `request.user`，**只推本人通知**，绝不接受客户端传入的 `recipientUserId`。
- **事实源是 REST**：未读计数 / 列表以 REST 为准；SSE 仅作"有新通知"的推送信号。**前端断线即回退重拉**
  REST（未读数 + 列表），不依赖 SSE 不丢消息。多标签页各自连接，各自重连。
- **单实例直推【本期做】**：连接注册表在进程内存。**多副本 fan-out（共享 pub/sub，如 Postgres LISTEN/NOTIFY
  或 Redis）【预留】**——本期内网单实例部署足够；RFC 标注扩展点，多副本时再补。
- **降级**：SSE 不可用（代理/网络）时，前端以轮询 REST 未读数兜底（如 60s），保证可用。

## 11. Schema 与迁移

`notification.*`（独立迁移入口 `db:migrate:notification`，并入 `db:setup` 链：
platform → presence → files → forms → **notification** → seed）。初拟表：

- `notification.notification`：`id`、`recipient_user_id`、`title`、`content`、`source_module`、`source_id`、
  `channel`、`read_at`、`created_at`（索引：`(recipient_user_id, read_at)`、`(recipient_user_id, created_at)`）。
- `notification.trigger_config`：`trigger_key`、`enabled`、`default_recipients`(jsonb)、`updated_at`。
- `notification.schedule_config`：`job_key`、`cron`/`params`(jsonb)、`enabled`、`updated_at`（存可配置截止时间等）。

Drizzle schema 同步 + Repository 双实现（memory + postgres，沿用 `PLATFORM_REPOSITORY_DRIVER` 同款 gate）。

## 12. HTTP API（契约）

| 方法 | 路径                                    | 说明                                          | 权限                                 |
| ---- | --------------------------------------- | --------------------------------------------- | ------------------------------------ |
| GET  | `/api/notification`                     | 当前用户通知列表（分页、可筛未读）            | 登录态（本人）                       |
| GET  | `/api/notification/unread-count`        | 当前用户未读数                                | 登录态                               |
| GET  | `/api/notification/stream`              | SSE 推送（本人）                              | 登录态                               |
| PUT  | `/api/notification/:id/read`            | 单条已读（仅本人）                            | 登录态 + 归属校验                    |
| PUT  | `/api/notification/read-all`            | 全部已读                                      | 登录态                               |
| GET  | `/api/notification/trigger-config`      | 列出触发点配置（管理用）                      | `notification:trigger-config:manage` |
| PUT  | `/api/notification/trigger-config/:key` | 改某触发点 `enabled`/`defaultRecipients`      | `notification:trigger-config:manage` |
| POST | `/api/notification`（内部）             | 由事件/job 内部生成；**不**对外暴露任意发通知 | 内部/服务                            |

归属校验：列表/已读只能操作 `recipient_user_id === 当前用户` 的通知，越权返回统一错误信封。

## 13. 权限点（`notification` 模块 permissions）

- 站内通知"看/标记本人通知"属登录态默认能力，**不单设功能权限**（类比"看本人档案"）。
- **本期做** `notification:trigger-config:manage`（管理触发点接收人配置）——§6 已定本期做写接口 + UI；
  seed **挂系统管理员**角色。

## 14. 审计

- 触发点接收人配置变更（本期做，§6）→ 审计（actor、trigger_key、前后值）。
- 调度配置（截止时间等）变更 → 审计。
- 通知生成/已读属高频低敏，**不逐条审计**（仅异常/失败记日志）。

## 15. 安全要求

- SSE 端点经全局 `PlatformAuthGuard` 鉴权（§10，非 phantom-token），连接只绑定 `request.user`，
  **不接受**客户端传入的 `recipientUserId`。
- §7 platform 读端口只返回 id，不泄露档案敏感字段；进程内端口仅供内嵌模块注入调用。
- 通知 `content` 由触发器生成、最小披露（如"你的状态已被 X 修改"而非贴全部数据），避免越权信息泄露。
- 任意"对他人发通知"的能力**不对外开放**；只能经内置触发点/job 生成。
- **security-baseline §16 门禁判定（M3）**：§7 仅新增只读 id 端口、不改密码/token 存储/权限模型/数据范围模型、
  不增敏感字段、不落在 `auth/scope/audit/rbac/repositories` 子树（落在 `org`），**严格按 §16 字面不属强制
  文档门禁项**；但因暴露组织/角色成员关系，**自愿**走 security-reviewer 二审，并**评估**是否需在 security-baseline
  补一句（而非"必须更新"）。SSE 鉴权沿用既有 guard，不改鉴权规则本身。

## 16. 前端范围（workbench-shell）

- 顶栏铃铛：接 `unread-count`（角标真数）+ 下拉接 `GET /api/notification`（列表）+ 点击标已读 + 跳转 `sourceModule/sourceId`。
- 工作台"最新消息"卡片：接最近若干条通知。
- SSE：建立 `/stream` 连接，收到信号即刷新未读数/列表；断线回退 REST 轮询。
- **触发点配置管理 UI（本期做，§6）**：系统管理员可见的最小页面——列出触发点 + `enabled` 开关 +
  接收人增删（部门负责人/角色），受 `notification:trigger-config:manage` 控制。**落位 `modules/notification/web`
  的一个模块路由页**（manifest 声明 route+menu，仿 M5 `RolesPage`），非 shell 自有页；权限不足不显示。
- 替换 `App.tsx` 中**通知相关**的 `(M7)` 占位：顶栏铃铛下拉、工作台"最新消息"卡片。**注意**：`App.tsx`
  另有全局搜索壳、未读消息卡、待处理事项等也标了 `(M7)/(M11)`——实现期需逐一核对，**只接通知相关的，
  别误删/漏删搜索等非本期壳**。前端测试走 `vitest.web.config.mts`（M6-W 已修 include 覆盖 apps/\*\*）。

## 17. 测试要求

- **单元**：RecipientResolver（部门负责人/角色解析/去重/排除本人）、生成流程、已读/未读、归属校验、
  trigger/schedule 配置读取。
- **e2e（in-memory）**：`presence.status.changed` → 落库通知 → 列表/未读数/已读 全链路；越权已读被拒。
- **web**：铃铛角标 + 下拉列表 + 已读交互（`*.spec.tsx`）。
- **SSE**：连接鉴权 + 只推本人 + 断线前端回退（至少覆盖鉴权与过滤逻辑）。
- **Postgres-gated**：notification repository 集成测试（env-gated，沿用现有 gate 套路；注意"假绿"——
  确认 gate 真跑过）。
- 验收禁止假数据/占位蒙混；source-review 判定而非裸 grep。

## 18. 后端退出标准

1. `modules/notification`（contract+api）建成，`notification.*` schema + 迁移 + 双实现 repository 落地，
   `db:migrate:notification` 接入 `db:setup`。
2. `presence.status.changed` → 部门负责人通知**端到端跑通**（e2e 绿，非 mock 蒙混）。
3. SSE 端点鉴权 + 只推本人 + 前端断线回退就绪。
4. 调度框架 + 可配置截止时间 + 一个可验证占位 job 跑通；①②④ 接线点预留并注释到位。
5. §7 platform 读端口落地并过 security-reviewer。
6. `apps/notification-api` **已删除**，dev/根脚本/docker/CI 引用清理干净。
7. 前端铃铛 + 工作台卡片接真数据 + 触发点配置管理 UI 可用，通知相关 `(M7)` 占位移除。
8. 触发点配置写接口 + 权限 + 审计落地。
9. `pnpm verify` 全绿；涉部署形态（删 app）→ `pnpm docker:build` 验证。

## 19. 切片计划（初拟）

| 切片 | 范围                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M7-1 | `modules/notification` 骨架：contract/api（双 manifest）、`notification.*` schema+迁移+双实现、CRUD/已读/未读 API、gateway 装配、**删除 apps/notification-api**                                 |
| M7-2 | 事件订阅框架 + RecipientResolver + §7 platform-contract 进程内读端口（security-reviewer）+ `presence.status.changed`→部门负责人 live 链路 + trigger 配置 seed + **配置读/写接口 + 权限 + 审计** |
| M7-3 | 调度基建（`@nestjs/schedule`）+ schedule 配置 + 占位 job + ①②④ 接线点预留                                                                                                                       |
| M7-4 | SSE 推送端点 + 前端铃铛/工作台卡片接入 + 断线回退 + **触发点配置最小管理 UI**                                                                                                                   |
| M7-5 | 交付验证门禁（类比 M6-4：verify/verify:full/docker:build + 假绿核查 + 文档同步）                                                                                                                |

> 切片顺序与边界可在 RFC 定稿后微调；每切片自包含、独立验收、追加 verification-log。

## 20. 本期做 / 预留 / 不做

| 能力                                  | 状态   | 说明                                                       |
| ------------------------------------- | ------ | ---------------------------------------------------------- |
| 站内通知（落库/已读未读/列表/未读数） | 本期做 | `in_app` channel                                           |
| 事件驱动生成 + 接收人可配解析         | 本期做 | 订阅框架 + RecipientResolver                               |
| ③ 状态变更→部门负责人（可配角色）     | 本期做 | 唯一 live 端到端链路                                       |
| SSE 实时推送（单实例）                | 本期做 | REST 为事实源 + 断线回退                                   |
| 调度框架 + 可配置截止时间 + 占位 job  | 本期做 | `@nestjs/schedule`                                         |
| platform 组织/角色解析读端口          | 本期做 | §7，security-reviewer                                      |
| ④ 档案被改通知本人                    | 预留   | 事件名 `profile.updated` + 处理器位本期定，M8 发事件即生效 |
| ①② 日报提醒 job 逻辑                  | 预留   | job key + 空 handler，依赖 M9/M10                          |
| 触发点配置写接口 + 最小管理 UI        | 本期做 | §6/§22 已定；系统管理员可改 enabled/接收人，入审计         |
| 外部 IM/email/sms 投递                | 预留   | 投递器接口位，no-op                                        |
| 持久化 outbox / 跨进程可靠投递        | 预留   | 同进程内存总线足够；服务拆分时做                           |
| SSE 多副本共享 pub/sub                | 预留   | 单实例足够；多副本时补 LISTEN/NOTIFY 或 Redis              |
| 给近况记录新增→通知本人               | 不做   | 需求明确不通知                                             |
| 通用规则引擎 / 条件分支               | vNext  | 多维表格自动化平台                                         |
| 实时网关 / OpenIM / 人对人聊天        | vNext  | 本期不引入                                                 |

## 21. 文档影响

- **新增本 RFC** + `docs/doc-index.md` §7 收纳。
- `docs/foundation-progress.md`：M7 行 / 下一步。
- `docs/architecture.md`：通知模块落位（modules/notification、SSE 端点、notification-api 废弃）。
- `docs/security-baseline.md`：§7 读端口**评估**是否补一句（按 §15 判定非强制门禁项）；SSE 鉴权沿用既有 guard，不改规则。
- `docs/deployment.md`：notification 迁移入口、db:setup 顺序、删 notification-api 的部署影响。
- `docs/verification-log.md`：各切片追加。
- **ADR-0004 M 号消解（B2）**：ADR 不可变，**不改旧 ADR**；在本 RFC（及必要时 security-baseline）注明
  "ADR-0004 §3 所述'M7 引入内部 JWT'指**老 M7（业务模块拆独立进程）**；按 ADR-0005，新 M7（通知+调度）
  不拆 gateway、同进程内嵌，故沿用 introspection→request.user，不触发内部 JWT"。若评审认为需正式 ADR
  记录此消解，再新增 ADR（不改 0004）。
- **独立 ADR：本期不单独立**（§23-2 已定）——"通知共享模块 + SSE 形态 + ADR-0004 M 号消解"由本 RFC 承载；
  若后续被认定为原则性决策再补新 ADR（不改 0004/0005）。

## 22. 已决定事项（本 RFC 起草前与产品负责人确认）

1. **范围** = 通知 + 调度基建做满 + 只接通 ③`presence.status.changed`→部门负责人 一条 live 链路；
   ①②④ 留预留接线点（与 M6 共用基建先行一致）。
2. **实时性** = **SSE 推送**（单实例直推 + REST 为事实源 + 断线回退；多副本 pub/sub 预留；不引入重型实时网关）。
3. **代码落位** = `modules/notification` 共享模块（contract/api，schema `notification.*`，走 gateway 装配）。
4. **现有 `apps/notification-api`** = 逻辑迁入后**直接删除**（非降级薄壳）。
5. **触发点配置** = 本期做**写接口 + 最小管理 UI**（系统管理员），非只读。
6. **平台数据获取（B1）** = `@work/platform-contract` 进程内只读端口（Symbol + `useExisting`），非公开 HTTP、非 platform-sdk。
7. **鉴权（B2）** = 同进程内嵌沿用全局 `PlatformAuthGuard`（introspection），**无 phantom-token**；ADR-0004 的"M7"指老 M7。

## 23. 待审查项（评审/二审决断）

> §22 已定：范围 / 实时性 / 落位 / 删 app / 配置写接口+UI / 平台数据进程内端口(B1) / 鉴权(B2)。
> 下列原开放项已于 2026-06-07 定稿时按推荐敲定：

1. **§9.1 调度选型** → **已定：`@nestjs/schedule`**。
2. **独立 ADR？** → **已定：不单独立 ADR**，由本 RFC 承载"通知共享模块 + SSE + B1/B2 消解"；
   若后续被认定为原则性决策再补（不改 0004/0005）。
3. **④ `profile.updated` 事件契约定在哪** → **已定：`packages/platform-contract`**（生产者是 platform/M8，
   "生产者拥有事件契约"，与 presence 事件定在自己 contract 同理）。M7 只注册订阅处理器。
4. **§10 SSE 令牌传递** → **已定：前端 `fetch`+`ReadableStream`** 带 `Authorization`（复用 `@work/http-client`
   令牌注入）；不用原生 EventSource，不走 query 参数。
