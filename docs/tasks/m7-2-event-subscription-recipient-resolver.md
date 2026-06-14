# Task: M7-2 事件订阅 + RecipientResolver + platform 组织读端口 + 一条 live 链路

## 状态

Ready for execution

## 0. 任务定位

M7 第二刀。把通知从"骨架"接成"事件驱动、接收人可配、端到端跑通一条 live 链路"。本切片交付：

1. **共享单例事件总线**（命门）：把 `EVENT_BUS` 从"每模块各自 `new MemoryEventBus()`"改成**全进程单例**，
   否则跨模块事件根本不通（详见 §2.1）。
2. **事件订阅框架**：notification/api 启动时订阅本期触发点事件（本期仅 `presence.status.changed`），
   走"配置 → 解析接收人 → 生成通知"管道；失败不阻塞业务主流程。
3. **RecipientResolver**：按触发点配置 + 事件 payload 解析去重后的接收人，排除触发者本人。
4. **§7 platform-contract 进程内只读组织/角色端口** `PLATFORM_ORG_PORT`（`resolveDepartmentManager` /
   `listUserIdsByRole`），platform 侧实现 + `useExisting` 导出，notification 进程内 `@Inject` 调用。
   **[security-reviewer 强制二审]**
5. **`presence.status.changed` → 部门负责人** 的 live 端到端链路（e2e 绿，非 mock 蒙混）。
6. **触发点配置表 + seed + 读/写接口 + 权限 + 审计**：新建 `notification.trigger_config` 表（迁移 `0001`）、
   seed 默认值、`GET/PUT /api/notification/trigger-config`、`notification:trigger-config:manage` 权限
   （本切片进 manifest 自动授系统管理员）、配置变更入审计。

**本切片不做**（留后续切片，别越界）：

- `@nestjs/schedule` 调度框架 + `schedule_config` 表 + 占位 job + ①② job 接线点 →**M7-3**
- SSE 推送端点 + 前端铃铛/工作台卡片接入 + **触发点配置管理 UI（route/menu）** →**M7-4**
- ④ `profile.updated` 的**实际订阅**（其事件契约归 platform/M8，本切片尚不存在）→ 仅保留 triggerKey +
  注释占位（见 §2.6）；M8 定义事件后再接。
- 外部 IM/email/sms 投递器实现（仅类型位，沿用 M7-1 现状）。

> 本切片**改动 platform 安全相关只读面（新增组织/角色读端口）**，按 `docs/doc-index.md` §5 + `apps/platform-api/CLAUDE.md`，
> **必须跑 security-reviewer 子代理独立二审**（见 §10）。同时**改动 presence（生产者事件契约）**与
> **files/forms（移除本地 EVENT_BUS provider）**，属跨"已完成模块"的最小必要改动，须保证这些模块测试全绿。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、统一错误信封、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m7-notification-scheduler.md`（**本切片权威规格**）——重点 §5 领域模型 + 触发点、§6 触发点配置、
   §7 platform 读端口、§8 事件订阅/生成/投递、§11 schema、§12 HTTP API、§13 权限、§14 审计、§15 安全、
   §19 切片（M7-2 行）、§22 已决定事项（特别 6=进程内端口 / 7=鉴权无 phantom-token）
4. `apps/platform-api/CLAUDE.md`（**安全敏感面**：改 platform 必读 `docs/security-baseline.md` 相关节并引用条款；
   security-reviewer 二审；§16 变更门禁判定见本任务 §10）
5. `modules/presence/CLAUDE.md`（模块隔离、**显式 `@Inject` gotcha**、跨模块只走事件/公共 API）
6. 既有范式代码（照搬，不要另起炉灶）：
   - **进程内端口范式**：`packages/platform-contract/src/{users.ts,scope.ts,audit.ts}`（端口接口 + `Symbol.for(...)` token）
     - `apps/platform-api/src/users/employee-lookup.service.ts`（端口实现）
     - `apps/platform-api/src/platform.module.ts:63-86`（`useExisting` provide + `exports`）
     - `modules/presence/api/src/status/presence-status.service.ts:31`（消费方 `@Inject(PLATFORM_SCOPE_SERVICE)`）
   - **事件总线**：`packages/event-bus/src/{domain-event.ts,memory-event-bus.ts,event-bus.token.ts}`
     - 现状每模块各自 provider（`modules/{presence,files,forms}/api/src/*.module.ts` 的 `EVENT_BUS` useFactory）
   - **生命周期订阅范式**：`modules/files/api/src/files/files-cleanup.service.ts`（`OnModuleInit`/`OnModuleDestroy`）
   - **审计范式**：`modules/presence/api/src/status/presence-status.service.ts:88-104`（`auditService.record(...)`）
   - **权限/守卫**：`@work/nest-common` 的 `RequirePermissions` + `apps/gateway-api/CLAUDE.md`（两个全局 Guard）
   - **manifest 权限结构**：`modules/presence/contract/src/platform-manifest.ts`（`permissions: [{code,name,moduleName}]`）
   - **seed 自动授权**：`apps/platform-api/src/seeds/seed-data.ts:25-31`（active manifest 的 permissions 全量 flat）
     - `seed-platform.ts`（全量授系统管理员角色）
   - **双实现 repository + migration**：`modules/notification/api/src/db/*`（M7-1 已建 `notification` 表，照此扩 `trigger_config`）

## 2. 设计要点（严格遵守）

### 2.1 共享单例事件总线（命门，先做）

**问题**：当前 `modules/{presence,files,forms}/api` 各自 `provide: EVENT_BUS, useFactory: () => new MemoryEventBus()`
——**每模块一个独立实例**。files/forms 至今只发不订（同模块内自洽）所以没暴露问题；**notification 是第一个
跨模块订阅者**：presence 往自己的总线 publish，notification 订阅的是另一个实例 → **事件永远到不了 notification，
live 链路静默失败**。

**改法**：

- 在 `@work/nest-common` 新增 **`@Global()` `EventBusModule`**（`packages/nest-common/src/event-bus.module.ts`）：
  `providers: [{ provide: EVENT_BUS, useFactory: () => new MemoryEventBus() }]` + `exports: [EVENT_BUS]`，
  从 index 导出。`@work/nest-common` 已带 `@nestjs/common`/`@nestjs/core` peer 依赖；新增对
  `@work/event-bus` 的依赖（package.json）。
- `apps/gateway-api/src/gateway.module.ts` `imports` 加 `EventBusModule`（装一次，`@Global` 后全进程可见）。
- **删除** `modules/{presence,files,forms}/api/src/*.module.ts` 里本地的 `EVENT_BUS` useFactory provider；
  这些模块若需自洽（标准做法）`imports: [EventBusModule]`（`@Global` 下重复 import 仍是同一实例，无副作用）。
  notification/api 同样 `imports: [EventBusModule]` 后即可 `@Inject(EVENT_BUS)`。
- **爆炸半径可控**：全部 e2e（`apps/gateway-api/src/*.e2e-spec.ts`，含 presence/files/forms/notification）都经
  `GatewayModule` 构建，无"单建某模块"的 e2e；单元测试用 mock bus 手工注入，不受影响。
- **退出条件**：presence/files/forms 既有单元 + e2e **全绿**；新增一条断言证明"presence publish → notification
  订阅器收到"（见 §6 e2e）。

### 2.2 事件订阅框架（notification/api）

- 新增订阅器（如 `NotificationEventSubscriber`，`implements OnModuleInit, OnModuleDestroy`，仿
  `files-cleanup.service.ts` 生命周期），`onModuleInit` 里 `eventBus.subscribe(notificationTriggerKeys.presenceStatusChanged, handler)`，
  `onModuleDestroy` 调用 `subscribe` 返回的退订函数。
- handler 流程：查触发点配置（§2.5）→ 若 `enabled=false` 直接返回 → RecipientResolver 解析接收人（§2.4）→
  `NotificationService.create(...)` 落库（in_app）。
- **F3 硬约束：handler 绝不能抛错**。`MemoryEventBus.publish` 用 `Promise.all(handlers)` **await** 处理器，
  订阅器一旦抛错会反灌进 presence 的 `await eventBus.publish(...)`，**破坏 presence 写入主流程**。handler 必须
  **整体 try/catch**，失败仅 `Logger.error` 记日志（RFC §8.3 best-effort，本期不重试/补偿；持久化 outbox 预留）。
- 本切片**只订阅** `presence.status.changed`。`profile.updated` 不订阅（§2.6）。

### 2.3 §7 platform 进程内组织/角色读端口（[security-reviewer]）

- **契约**：在**已存在的** `packages/platform-contract/src/org.ts` **末尾追加** `PlatformOrgPort` 接口 +
  `Symbol.for('PLATFORM_ORG_PORT')` token（**保留现有 `EnterpriseDto`/`DepartmentDto`/`CreateDepartmentInput` 不动**——
  整文件覆盖会打挂 `platform.repository.ts` 等所有引用方）。`index.ts` 已 `export * from './org'`，自动导出。
  对齐 `PlatformEmployeeLookupPort`/`PLATFORM_EMPLOYEE_LOOKUP_SERVICE` 范式：

  ```ts
  export interface PlatformOrgPort {
    // 解析某人所在部门的负责人；找不到/跨企业不匹配返回 {}
    resolveDepartmentManager(
      enterpriseId: string,
      userId: string,
    ): Promise<{ managerUserId?: string }>;
    // 解析持某角色 code 的全部在职用户 id（去重）
    listUserIdsByRole(enterpriseId: string, roleCode: string): Promise<string[]>;
  }
  export const PLATFORM_ORG_PORT = Symbol.for('PLATFORM_ORG_PORT');
  ```

  > 两方法都带 `enterpriseId`（来源 = 事件 payload 的 `enterpriseId`，见 §2.7），对齐既有按企业隔离端口范式。

- **实现**：`apps/platform-api/src/org/platform-org-lookup.service.ts`（`implements PlatformOrgPort`，
  `@Inject(PLATFORM_REPOSITORY)`），**仅用现有 repository 方法、不新增 repo 方法、不跨 schema、只返回 id**：
  - `resolveDepartmentManager`：`findEmployeeById(userId)` → 校验 `employee.enterpriseId === enterpriseId`
    且 `status==='active'` → **`employee.departmentId === undefined`（员工无部门，该字段可选）直接返回 `{}`** →
    `findDepartmentById(employee.departmentId)` → 校验部门同企业且 `status==='active'`
    → 返回 `{ managerUserId: department.managerUserId }`；任一不满足返回 `{}`。
  - `listUserIdsByRole`：`listRoles(enterpriseId)` 找 `role.code === roleCode` → roleId；
    `listEmployees()` 过滤 `enterpriseId` 匹配 + `status==='active'` + `roleIds.includes(roleId)` → 映射 `id` 去重。
- **装配**：`apps/platform-api/src/platform.module.ts` `providers` 加 `PlatformOrgLookupService` +
  `{ provide: PLATFORM_ORG_PORT, useExisting: PlatformOrgLookupService }`，并 `exports` 追加 `PLATFORM_ORG_PORT`。
- **安全约束**：只返回 id，**绝不**返回姓名/手机号/邮箱等敏感档案字段；进程内端口仅供内嵌模块注入，**不开公开 HTTP 端点**。

### 2.4 RecipientResolver（notification/api）

- 新增 `RecipientResolver`，`@Inject(PLATFORM_ORG_PORT)`。输入：触发点配置的 `defaultRecipients` + 事件归一化
  上下文（`enterpriseId`、`subjectUserId`、`actorUserId`）。输出：去重后的 `recipientUserIds: string[]`。
- `defaultRecipients` 元素 `{ kind, roleCode? }` 解析规则：
  - `department_manager` → `resolveDepartmentManager(enterpriseId, subjectUserId).managerUserId`（无则跳过）
  - `role` → `listUserIdsByRole(enterpriseId, roleCode)`（缺 `roleCode` 跳过）
  - `subject` → `subjectUserId` 本人
  - `self` → **本切片不实现，类型保留**（语义留待需要时定，注释标注）
- **去重 + 排除触发者本人**：合并后 `Set` 去重，并**移除 `actorUserId`（= 事件 `changedBy`）**
  （RFC §5.2：排除触发者本人；如部门负责人给自己登记，解析出的负责人=自己=actor→被排除→不自我通知）。
- 解析"部门负责人/某角色用户"**只经 §2.3 端口**，绝不读 platform schema。

### 2.5 触发点配置（`notification.trigger_config`）

- **表**（迁移 `0001_init_trigger_config.sql`，由 `runNotificationMigrations` 自动发现，无需改 migrate.ts）：
  `trigger_key text PRIMARY KEY`、`enabled boolean NOT NULL DEFAULT true`、
  `default_recipients jsonb NOT NULL DEFAULT '[]'::jsonb`、`updated_at timestamptz NOT NULL DEFAULT now()`。
  本切片**全局配置（不按 enterprise 分）**；多租户分级配置【预留】（注释标注）。
- **Drizzle schema** + **repository 双实现**（memory + postgres，沿用 `NOTIFICATION_REPOSITORY_DRIVER`/
  `PLATFORM_REPOSITORY_DRIVER` 同款 gate）。方法：`listTriggerConfigs()`、`findTriggerConfig(key)`、
  `upsertTriggerConfig(key, { enabled, defaultRecipients })`。
- **seed 默认值**：`presence.status.changed` → `{ enabled: true, defaultRecipients: [{ kind: 'department_manager' }] }`。
  **落地方式**：在 `0001` 迁移 SQL 末尾用幂等 `INSERT ... ON CONFLICT (trigger_key) DO NOTHING` 写入默认行
  （schema-per-module：notification 自己的种子放自己的迁移里，**不**塞进 platform seed，**不**在模块 boot 时跑）。
  > 默认接收人结构 `{ kind, roleCode? }[]` 的类型定义放 contract（`trigger-config.dto.ts`），SQL 里写 JSON 字面量。
- 读取触发点配置时若该 key 无行：视为"未配置"——本切片对 `presence.status.changed` 由 seed 保证有行；
  其余 key 缺行按 disabled 处理（防止 NPE）。

### 2.6 events.ts 决策注释（折叠 M7-1 遗留 Minor）

`modules/notification/contract/src/events.ts` 补两条决策注释（M7-1 审查遗留的 Minor）：

- 在 `notificationTriggerKeys` 处注明：**给某人新增近况记录不通知本人**（需求 §4.3），本期不为近况记录注册触发点，禁止后人误加。
- 注明 ④ `profile.updated` 的事件契约**定在 `@work/platform-contract`（生产者 platform/M8）**，本切片只预留 triggerKey 占位 +
  注释，不在 notification contract 定义该事件、不订阅；M8 定义事件后再接订阅处理器。
- 如需，`notificationTriggerKeys` 可加 `profileUpdated: 'profile.updated'` 常量位（仅字符串占位，本切片不订阅它）。

### 2.7 presence 事件 payload 扩展（生产者侧改，F2）

§2.3 端口签名要 `enterpriseId`，§5.2/RFC 要登记/取消文案分写——但现 `PresenceStatusChangedEvent` payload
（`modules/presence/contract/src/events.ts`）**只有** `{ userId, status, startAt, endAt, changedBy }`，**缺 enterpriseId、
无法区分登记/取消**。按"生产者拥有事件契约"，在 **presence** 侧最小扩展：

- `modules/presence/contract/src/events.ts` 的 `PresenceStatusChangedEvent` 增 `enterpriseId: string` +
  `changeKind: 'created' | 'cancelled'`。
- `modules/presence/api/src/status/presence-status.service.ts` 两处 publish：`createRecord` 传
  `enterpriseId: currentUser.enterpriseId, changeKind: 'created'`；`cancelRecord` 传
  `enterpriseId: currentUser.enterpriseId, changeKind: 'cancelled'`。
- 更新 presence 既有测试（`presence-status.service.spec.ts` 断言 publish payload 处）保持绿。
- notification handler 据 `changeKind` 出不同文案（如"{name}登记了{status}"/"{name}取消了{status}状态"）。
  > 文案里的人名：通知 `content` 走**最小披露**（RFC §15）。本切片为避免 notification 反查 platform 拿姓名，
  > 文案可用中性措辞（如"有团队成员登记了出差/取消了出差状态，请查看在位看板"）+ `sourceModule='presence'`
  >
  > - `sourceId=<状态记录 id>` 供前端跳转；**不要**为拿姓名再开 platform 读端口（超范围）。

### 2.8 权限点进 manifest（F5）

- `modules/notification/contract/src/platform-manifest.ts` 的 `permissions` 数组**本切片加入**
  `{ code: notificationPermissions.triggerConfigManage, name: '管理通知触发点配置', moduleName: 'notification' }`
  （M7-1 时为空数组、刻意不放；本切片随写接口一起放，seed 自动授系统管理员——对齐 RFC §13）。
- **`menus` 仍保持空**：配置管理页的 route/menu 属 **M7-4**，本切片只交付权限 + 写接口 + 审计，不加菜单/前端页。

### 2.9 配置读/写接口（notification.controller 扩展）

`modules/notification/api/src/notification/notification.controller.ts`（`@Controller('notification')`）新增：

| 方法 | 路径                                    | 说明                                     | 鉴权                                                        |
| ---- | --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| GET  | `/api/notification/trigger-config`      | 列出触发点配置                           | `@RequirePermissions('notification:trigger-config:manage')` |
| PUT  | `/api/notification/trigger-config/:key` | 改某触发点 `enabled`/`defaultRecipients` | `@RequirePermissions('notification:trigger-config:manage')` |

- 用 `RequirePermissions`（`@work/nest-common`）；PUT body 走 DTO 校验（`class-validator`，仿现有 DTO）。
- PUT 写成功后 → **审计**：`@Inject(PLATFORM_AUDIT_SERVICE)` 调 `auditService.record({ action:'notification.trigger-config.update',
resourceType:'notification.trigger_config', resourceId: key, metadata: { before, after }, ... })`（actor 取
  `request.currentUser`，仿 presence 审计写法 + `buildAuthAuditContext`）。
- **不**新增任何"对他人发通知"的公开写接口（沿用 M7-1 §10 约束；通知只能由事件/job 内部生成）。

### 2.10 显式 `@Inject`（presence CLAUDE gotcha）

所有新增 provider/controller 的注入一律**显式 `@Inject(token)`**（esbuild/tsx 不 emit decorator metadata，
裸类型注入会 500）。涉及 `EVENT_BUS`、`PLATFORM_ORG_PORT`、`PLATFORM_AUDIT_SERVICE`、`NOTIFICATION_REPOSITORY`、
trigger-config repository token 等。

## 3. 模块结构增量

### 3.1 `@work/nest-common`

- `src/event-bus.module.ts`（`@Global() EventBusModule`）+ index 导出；package.json 加 `@work/event-bus` 依赖。

### 3.2 `@work/platform-contract`

- `src/org.ts`：**末尾追加** `PlatformOrgPort` + `PLATFORM_ORG_PORT`（**勿覆盖现有 DTO**，§2.3；index 已 `export *`，自动导出）。

### 3.3 `apps/platform-api`

- `src/org/platform-org-lookup.service.ts`（实现）+ `platform.module.ts` 装配/导出（§2.3）。

### 3.4 `modules/notification/contract`

- `events.ts`（§2.6 注释 + 可选 profileUpdated 常量）。
- `trigger-config.dto.ts`：`TriggerRecipientKind`（`'department_manager'|'role'|'subject'|'self'`）、
  `TriggerRecipient`（`{ kind; roleCode? }`）、`TriggerConfigDto`（`{ triggerKey; enabled; defaultRecipients; updatedAt }`）、
  `UpdateTriggerConfigInput`（`{ enabled?; defaultRecipients? }`）。index 导出。
- `platform-manifest.ts`：permissions 加 trigger-config:manage（§2.8）。

### 3.5 `modules/notification/api`

- `events/notification-event.subscriber.ts`（订阅器，§2.2/§2.7）。
- `recipient/recipient-resolver.ts`（§2.4）。
- `db/schema/trigger-config.schema.ts` + `db/migrations/0001_init_trigger_config.sql`（§2.5）。
- `db/trigger-config.repository.ts`（接口）+ memory/postgres 实现 + token。
- `trigger-config/trigger-config.service.ts`（list/upsert + 审计调用入口）+ controller 端点（§2.9，可并入现有 controller）。
- `notification.module.ts`：`imports` 加 `EventBusModule`；注册订阅器/resolver/trigger-config service+repo provider。

### 3.6 `modules/presence`（生产者侧最小改，§2.7）

- `contract/src/events.ts`（加 2 字段）+ `api/src/status/presence-status.service.ts`（2 处 publish）+ 同步 spec。

### 3.7 `modules/{files,forms}/api`

- 删本地 `EVENT_BUS` provider，`imports: [EventBusModule]`（§2.1）。

## 4. 数据库

- `0001_init_trigger_config.sql`：`CREATE TABLE IF NOT EXISTS notification.trigger_config (...)` + 默认行幂等 INSERT（§2.5）。
- `db:setup` / `db:migrate:notification` **无需改**（migrate.ts 自动发现 `migrations/*.sql`）。
- 迁移幂等：重复 `db:migrate:notification` 不报错（schema_migrations 去重 + IF NOT EXISTS + ON CONFLICT）。

## 5. live 链路（端到端语义，必须真跑通）

`presence` 登记/取消 → `eventBus.publish('presence.status.changed', { ..., enterpriseId, changeKind, changedBy })`
→ （**共享单例总线**）notification 订阅器收到 → 查 `trigger_config['presence.status.changed']`（seed 默认 enabled +
`[{kind:'department_manager'}]`）→ RecipientResolver：`resolveDepartmentManager(enterpriseId, subjectUserId)` 得部门负责人，
排除 actor 本人 → `NotificationService.create` 落库（in_app）→ 部门负责人 `GET /api/notification` 能查到、未读数 +1。

## 6. 验证

### 6.1 命令（全过）

```bash
pnpm install
pnpm lint && pnpm typecheck
pnpm test                       # 单元 + web
pnpm test:e2e                   # in-memory e2e
pnpm build
# 有本地 Postgres 时：
pnpm verify:full                # 含 test:db / test:e2e:postgres（注意 env-gated 假绿）
```

> 本切片不改部署形态（不删/加 app、不改 compose），`pnpm docker:build` 非必跑；如改了 Dockerfile/compose 才跑。

### 6.2 断言（必须覆盖）

- **单元**：
  - `PlatformOrgLookupService`：`resolveDepartmentManager`（命中/跨企业不匹配返回 {}/员工无部门返回 {}/部门无 manager）；
    `listUserIdsByRole`（命中去重/角色 code 不存在返回 []/排除非在职/排除他企业）。
  - `RecipientResolver`：department_manager / role / subject 解析；去重；**排除 actor 本人**；缺 roleCode/无 manager 跳过。
  - 订阅器 handler：enabled=false 不生成；生成走 service.create；**handler 内部吞异常不抛**（注入抛错的依赖，断言 publish 不被波及）。
  - trigger-config repository 双实现 list/find/upsert；service upsert 触发审计。
- **e2e（in-memory，`apps/gateway-api/src/*.e2e-spec.ts`，经 GatewayModule，仿 `forms-definition.e2e-spec.ts`）**：
  - **live 链路**：**以 `apps/gateway-api/src/notification.e2e-spec.ts` 为 in-memory 模板（`PLATFORM_REPOSITORY_DRIVER=memory`），
    切勿照搬 `presence.e2e-spec.ts`（那是 Postgres-gated，靠 `db:setup`+真 Pool 建数据，不是 in-memory）**。
    subject + manager 经 `app.get(平台服务/memory store)` 在内存里现造（memory store 支持
    `createDepartment(managerUserId)`/`createEmployee`/`setUserRoles`）：构造一名 subject（其部门有 manager）+ 触发 presence
    登记（经 presence service/controller）→ manager 的 `GET /api/notification` 出现 1 条、未读数 +1、`sourceModule='presence'`；
    **取消**再触发一条且文案随 `changeKind` 变。（数据注入仍走 `app.get(service)`，不开公开发通知接口——沿用 M7-1 §2.5。）
  - **共享总线证明**：上面的链路本身即证明 presence→notification 跨模块事件连通（§2.1 退出条件）。
  - **配置写接口**：无 `notification:trigger-config:manage` 权限的用户 PUT trigger-config → 403/统一错误信封；
    系统管理员 PUT 改 enabled=false 后再触发 presence → **不生成通知**（验证开关生效）。
- **Postgres-gated**：trigger-config（及 notification）repository postgres 集成测试（env-gated；**确认 gate 真跑过**，别假绿）。
- 既有 presence/files/forms 单元 + e2e **全绿**（共享总线改造 + presence payload 改造的回归）。
- 验收禁止假数据/占位蒙混；source-review 判定而非裸 grep。

## 7. 退出标准

1. `EVENT_BUS` 全进程单例（§2.1），presence/files/forms/notification 共用一实例，旧的每模块 provider 已删，相关测试全绿。
2. notification 订阅 `presence.status.changed`，handler best-effort 不阻塞主流程（§2.2/F3）。
3. `PLATFORM_ORG_PORT` 落地（contract + 实现 + 装配导出），**过 security-reviewer**（§10）。
4. RecipientResolver 解析 + 去重 + 排除 actor 正确。
5. `presence.status.changed` → 部门负责人通知 **e2e 端到端跑通**（非 mock 蒙混），登记/取消文案区分。
6. `notification.trigger_config` 表 + seed 默认值 + 双实现 repository；`db:migrate:notification` 幂等。
7. `GET/PUT /api/notification/trigger-config` + `notification:trigger-config:manage` 权限（进 manifest 自动授 admin）+ 配置变更入审计。
8. presence 事件 payload 扩 `enterpriseId`/`changeKind`，presence 测试全绿。
9. events.ts 两条决策注释补齐（折叠 M7-1 Minor）。
10. `pnpm verify` 全绿。

## 8. 必须保持不变（避免越界）

- 不动 auth/scope/audit **规则本身**（只新增只读 org 端口；不改密码/token/权限模型/数据范围模型）。
- 不动 presence/files/forms 业务逻辑（presence 仅扩事件 payload；files/forms 仅换 EVENT_BUS provider 来源）。
- 不做 `@nestjs/schedule`/`schedule_config`/占位 job（M7-3）、SSE/前端/配置 UI route/menu（M7-4）。
- 不开放"给任意人发通知"的公开写接口；通知只能由事件/job 内部生成。
- notification 不读写 platform schema；org/role 只经 `PLATFORM_ORG_PORT`。通知 `content` 最小披露。

## 9. 完成后更新文档

- `docs/foundation-progress.md`：M7-2 完成结论 + 下一步 M7-3；M7 切片表（若有）补行。
- `docs/architecture.md`：通知事件订阅 + RecipientResolver + platform `PLATFORM_ORG_PORT` 只读端口落位；
  **共享单例 `EVENT_BUS`（`@work/nest-common` `EventBusModule`）**这一处架构变化点要写清（之前是每模块各自实例）。
- `docs/security-baseline.md`：按 §10 判定，**评估**是否补一句"platform 新增只读组织/角色 id 端口（进程内、不返回敏感字段）"
  （RFC §15 判定非强制门禁项，但因暴露组织/角色成员关系，建议补一句并经 security-reviewer 认可）。
- `docs/deployment.md`：若 trigger_config 迁移影响 db:setup 描述则同步（迁移入口未变，按需）。
- `docs/verification-log.md`：追加 `M7-2 Event Subscription + Recipient Resolver + Platform Org Port` 锚点与结论。

## 10. 安全审查门禁（强制）

- 本切片新增 platform **只读组织/角色端口**（暴露部门负责人关系 + 角色成员关系）。按 `docs/security-baseline.md` §16
  字面：仅只读 id、不改密码/token/权限模型/数据范围模型、不增敏感字段、落在 `src/org` 而非 `auth/scope/audit/rbac/repositories`
  子树——**非强制文档门禁项**；但 RFC §15 已定**自愿走 security-reviewer 独立二审**，本任务**升格为强制**：
  - 交付前对 `git diff`（重点 `packages/platform-contract/src/org.ts`、`apps/platform-api/src/org/platform-org-lookup.service.ts`、
    `apps/platform-api/src/platform.module.ts`、notification 订阅器/resolver）跑 **security-reviewer 子代理**。
  - 审查关注点：端口是否只返回 id（无姓名/手机号/邮箱）、`enterpriseId` 隔离是否在每个查询都生效、
    是否绝不开公开 HTTP 端点、RecipientResolver 是否绝不接受客户端传入接收人、订阅器是否绝不读 platform schema、
    trigger-config 写接口权限 + 审计是否到位。
  - security-reviewer 出的 Blocking/Major 必须修复或书面豁免后方可合入。
- 引用条款而非凭记忆（`docs/security-baseline.md` §5 authz/data-scope、§8 DB/schema、§16 变更门禁；`AGENTS.md` 边界）。

## 11. 提交规范

- Conventional Commits：`feat(notification): event subscription + recipient resolver + live presence link`；
  伴随改动可拆 `feat(platform): add read-only org lookup port`、`refactor(event-bus): share single EVENT_BUS instance`、
  `feat(presence): add enterpriseId/changeKind to status-changed event`。
- 提交信息说明三块：①共享总线改造（含 presence/files/forms 回归）②platform 读端口（security-reviewer 结论）③通知 live 链路 + 配置接口。
- 交付前跑完 §6 命令，结论贴进 `docs/verification-log.md`。security-reviewer 结论一并记录。
