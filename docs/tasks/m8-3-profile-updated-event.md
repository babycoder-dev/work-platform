# Task: M8-3 `profile.updated` 事件（platform-contract 新建契约 + platform 生产「他人改才发」+ notification 新增订阅器消费「接收人=本人、恒发、不经 RecipientResolver」）

## 状态

Ready for execution

## 0. 任务定位

点亮 M7 ④ 预留链路的**唯一一条 live 事件**：员工档案被**他人**修改成功后，platform 发 `profile.updated` 领域事件，
notification 模块**本期新增订阅器**消费它，给**被改本人**落一条站内通知。M8-2a 已把写档案收口到单一方法并备好接缝
（[employee.service.ts:131](apps/platform-api/src/users/employee.service.ts:131) `// M8-3: profile.updated should be published from this single write seam.`），
本切片只在这一处发事件 + 接通消费端。

> **现状两个关键事实（决定本切片真正的活儿）**：
>
> 1. **platform-api 目前完全不碰事件总线**——[platform.module.ts](apps/platform-api/src/platform.module.ts) 只 `imports: [DbModule]`，
>    `EmployeeService` 构造器无 `EVENT_BUS` 依赖。本切片要**首次**给 platform 接上 `EventBusModule` 并注入 `EVENT_BUS`。
> 2. **notification 侧 `profile.updated` 一行消费没写**——[events.ts:11](modules/notification/contract/src/events.ts:11) 只有孤立字符串
>    `profileUpdated: 'profile.updated'`（注释明写 "M7-2 does not subscribe"）；platform-contract 里**无** payload 类型。

本切片交付：

1. **契约新建（生产者拥有，`packages/platform-contract`）**：新增 `profile.updated` 事件名常量 + payload 类型
   `{ enterpriseId, subjectUserId, changedBy, changedFields: string[] }`（字段**名**集，**绝不带字段值**——最小披露，RFC §13/§15）。
2. **platform 生产**：`EmployeeService.updateEmployeeProfile` 在 M8-2a 接缝处发 `profile.updated`，
   **仅当「他人改」且有实际变更**时发（`saved.id !== currentUser.id && changedFields.length > 0`）。本人改本人（含管理员经 `:id` 改自身）**不发**。
3. **EventBus 接线**：`PlatformModule` 引入 `EventBusModule`（`@work/nest-common`），`EmployeeService` 注入 `@Inject(EVENT_BUS)`。
   **关键**：`EventBusModule` 是静态模块，presence/notification 已共用其单例 `MemoryEventBus`；platform 作为第三个 importer **必须落到同一实例**，否则事件发出去没人收（§2.3 + §4.2 强制 e2e 双向断言验证）。
4. **notification 侧新增订阅器 + `handleProfileUpdated`**：订阅 `platformEvents.profileUpdated`，
   **接收人 = `payload.subjectUserId` 本人，直接取值，不经 `RecipientResolver`**（与 presence ③ 的角色/部门负责人解析路径不同，**勿套用**）；
   **恒发，不查 trigger_config**（§2.5 决策）。文案最小披露（不贴字段值、本期不解析修改人姓名）。
5. **测试**：生产端发/不发判定 + payload 无值；订阅器接收人=本人/不经 resolver/错误隔离；**e2e 跨「platform 生产 + notification 消费」双向断言**（他人改→本人有通知；本人改→无通知，防假绿）。

> **本切片是 M8 里少数「不碰 DB」的切片**：**无迁移、无 schema 变更、无新权限点、不改数据范围模型**。
> 纯事件契约 + 生产 + 消费接线。

**本切片不做**（划清边界）：

- 近况记录 / `platform.status_logs` / `platform:status-log:create` → **M8-4**；且 **status_logs 明确不发任何事件**
  （给某人加近况**不通知**本人，RFC §6/§15）——本切片**不为 status_logs 注册任何触发点**，并保留 notification-contract 的防误加注释。
- HR 自定义字段 / 消费 M6 forms `profile.employee` / 人页聚合 → **M8-5**。
- 首登向导前端（M8-2b 已交付）；档案读写后端（M8-2a 已交付）；部门 CRUD（M8-1 已交付）。
- 交付验证门禁（verify:full / docker:build 全量 + 文档总同步 + 浏览器 smoke）→ **M8-6**。
- **前端不新增**：M7-4b 已交付铃铛 / 通知卡片 / SSE 消费，`profile.updated` 通知作为普通 `in_app` 通知**自动出现**，本切片**不写任何 `*.spec.tsx` / 前端代码**。
- **trigger_config enabled 开关 = 不做**（§2.5 已决策恒发）；其它 channel（email 等）= 不做。
- **修改人姓名进文案 = 预留不做**（§2.5）：本期文案不解析 `changedBy` → 姓名（需新增 platform 读端口，越界）；payload 仍带 `changedBy` 供未来解析。

> **安全门禁判定（写进任务包供二审 + security-reviewer 复核）**：
>
> - **§16 变更门禁：不触发**。本切片**不改数据范围模型 / 不改鉴权规则 / 不新增敏感字段定义**；`profile.updated` payload
>   **只带字段名不带字段值**（最小披露），不把档案值跨进程外泄。故**不需要同变更补 `security-baseline.md`、不需要新增 ADR**。
>   （此判定请 security-reviewer 复核确认；若 reviewer 认为「新增跨进程事件携带变更字段名」需在 baseline 留痕，则补一句，但非预判强制。）
> - **security-reviewer：仍走**（RFC §13 blanket：M8 触及档案读写面的切片合并前过 reviewer）。reviewer 关注点：
>   ① payload **确实**无字段值（仅 `changedFields` 名集）；② 接收人**唯一** = `subjectUserId`，无广播 / 无越权扩散；
>   ③ **本人改不发**（无自通知、无信息泄露给本人以外）；④ 事件跨进程不携带越权可利用信息；⑤ 发布失败**不**回滚 / 不污染已提交的档案写。
> - **任务包二审**：独立 general sub-agent（带本节决策真值清单），见记忆 `feedback_independent_subagent_review`。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、**统一错误信封**、领域事件协作、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m8-people-org-profile.md`（**本切片权威规格**）——重点 **§6 事件契约**（契约在 platform-contract 新建 + 生产时机
   「他人改才发，`changedBy===subjectUserId` 跳过」+ notification 侧新增订阅器、接收人=本人**不经 RecipientResolver**、
   文案最小披露 + **status_logs 明确不发事件**）、**§3 现状盘点**「M7 `profile.updated`」行（两侧均无消费/payload）、
   **§8 写档案收口**（发事件在收口 service 内、按「是否他人改」决定发）、**§13 安全要求**（payload 只带 id+字段名不带值）、
   **§12 测试要求**（e2e 跨生产+消费**双向断言**：他人改才有、本人改无，非 mock 蒙混）、**§16 退出标准** 第 4 条、
   **§17 切片计划** M8-3 行、**§19** 第 4 条、**§20** 第 4 条（④ 开关→本切片定）
4. `apps/platform-api/CLAUDE.md`（§16 变更门禁判定依据；**显式 `@Inject`** 纪律——新增 `EVENT_BUS` 注入须显式；
   两个迁移入口/repository driver/env-gated 假绿——本切片无迁移，但回归须确认既有 gate 真跑）
5. `packages/CLAUDE.md`（**单向依赖**：`packages/*` 不可依赖 `apps/*`/`modules/*`；`modules/notification/api → @work/platform-contract`
   属 **module→package 合法**，反向非法。本切片新增的就是这个合法方向）
6. `modules/presence/CLAUDE.md`（**领域事件是跨模块协作的合法手段**；**显式 `@Inject` gotcha**——esbuild/tsx 不 emit 装饰器元数据，
   裸类型注入 500，新增注入一律显式 `@Inject`）
7. `apps/gateway-api/CLAUDE.md`（platform + notification 经 gateway **同进程装配**——这是 `MemoryEventBus` 单例能跨模块传递事件的前提）
8. 既有范式代码（**照搬，不要另起炉灶**）：
   - **事件生产范式**：[presence-status.service.ts:106](modules/presence/api/src/status/presence-status.service.ts:106)
     （`@Inject(EVENT_BUS) eventBus`；`eventBus.publish<T>({ type, source:'presence.api', traceId, payload:{...} })`——
     **id/occurredAt 由 bus 自动补**，见 [domain-event.ts](packages/event-bus/src/domain-event.ts)；发布在审计/落库**之后**）
   - **EventBus 模块接线**：[presence.module.ts:14](modules/presence/api/src/presence.module.ts) `imports:[EventBusModule, ...]`；
     [event-bus.module.ts](packages/nest-common/src/event-bus.module.ts)（`EventBusModule` 静态模块，provide `EVENT_BUS`=`MemoryEventBus`，单例）
   - **订阅器范式**：[notification-event.subscriber.ts](modules/notification/api/src/events/notification-event.subscriber.ts)
     （`OnModuleInit`/`OnModuleDestroy` 里 `subscribe`/`unsubscribe`；handler `try/catch` + `logger.error` 错误隔离；
     ⚠️ **profile.updated 的 handler 不要照抄 presence 那段** `triggerConfigRepository.findTriggerConfig` + `recipientResolver.resolve`——
     profile.updated **恒发 + 接收人直取 subjectUserId**，见 §2.4）
   - **NotificationService.create 签名**：[notification.service.ts:22](modules/notification/api/src/notification/notification.service.ts:22)
     （`create({ recipientUserIds, title, content, sourceModule, sourceId?, channel? })`；内部去重 + fan-out SSE；`channel` 默认 `in_app`）
   - **收口 service 现状**：[employee.service.ts](apps/platform-api/src/users/employee.service.ts)
     （`updateEmployeeProfile` 已算出 `changedFields`（L108 `buildProfileUpdate`），接缝在 L131；本切片在此发事件）
   - **platform-contract 导出范式**：[index.ts](packages/platform-contract/src/index.ts)（`export * from './<file>'`；新增 `events.ts` 后加一行）
   - **e2e 范式**：`apps/gateway-api/src/*.e2e-spec.ts`（memory driver、登录拿 token、`afterAll` close；
     notification 落库可经 `GET /api/notification`（list）或注入 repository 断言）

## 2. 设计要点（严格遵守）

### 2.1 契约：新建 `packages/platform-contract/src/events.ts`

```ts
// platform 拥有 profile.updated 事件契约（生产者拥有，RFC §6 / M7 §23-3 方向）。
export const platformEvents = {
  profileUpdated: 'profile.updated',
} as const;

// 最小披露：只带 id + 变更「字段名」集，绝不带字段值（RFC §13/§15）。
export interface ProfileUpdatedPayload {
  enterpriseId: string;
  subjectUserId: string; // 被改的人（= employee.id；platform 内 user==employee）
  changedBy: string; // 改动发起人（= 操作者 user.id）
  changedFields: string[]; // 仅字段名，如 ['title','mobile']；不含旧值/新值
}
```

- [index.ts](packages/platform-contract/src/index.ts) 增 `export * from './events';`。
- **命名约定**（RFC §5.2 分层约定）：事件 payload 用 `subjectUserId`/`changedBy`（面向 notification 消费、与 M7 既有事件字段语义对齐），
  **不**用 DB/API 层的 `*_employee_id` 命名——这是刻意的分层差异，勿"统一"。

### 2.2 notification-contract：收敛事件名到 platform-contract（去重）

[modules/notification/contract/src/events.ts](modules/notification/contract/src/events.ts) 现有孤立字符串 `notificationTriggerKeys.profileUpdated`。
本切片让 notification **引用 platform-contract 的同一常量**，故：

- **先 grep 确认 `notificationTriggerKeys.profileUpdated` / `'profile.updated'` 在 notification 侧零引用**（现状是的）。
- **移除** `notificationTriggerKeys` 里的 `profileUpdated` 行，把注释改为指针（保留防误加意图）：
  ```ts
  // profile.updated is owned by @work/platform-contract (platformEvents.profileUpdated);
  // notification subscribes via that constant. It is NOT a configurable trigger —
  // it always notifies the subject directly (no RecipientResolver, no trigger_config).
  ```
- **保留** `presenceStatusChanged` 与 status/activity-note 那条防误加注释不动。
- 订阅器从 `@work/platform-contract` 导入 `platformEvents` + `ProfileUpdatedPayload`。
  **依赖已就位**：`modules/notification/api/package.json` 已含 `@work/platform-contract`（`workspace:*`），`scope:notification → scope:shared` 边界本就放行；
  **无需补依赖 / 无需 install**，本切片只是首次 import 该包的 events 符号（不会"新报"边界错）。

### 2.3 platform 生产：接 EventBus + 在接缝发事件

**(a) 接线**（[platform.module.ts](apps/platform-api/src/platform.module.ts)）：`imports: [DbModule, EventBusModule]`（`EventBusModule` from `@work/nest-common`）。
**依赖已就位，无需改 package.json / 无需 install**：`@work/event-bus` + `@work/nest-common` 已是 `apps/platform-api/package.json` 依赖
（二者 tag `scope:shared`，`scope:platform` 依赖它合法，eslint flat config 已放行）；本切片只在 `imports` 加 `EventBusModule` + 注入。

> ⚠️ **单例正确性（本切片成败命门）**：`EventBusModule`（[event-bus.module.ts](packages/nest-common/src/event-bus.module.ts)）标了 **`@Global()`**，
> 且 `EVENT_BUS` 用 `useFactory: () => new MemoryEventBus()` 提供——`@Global()` 模块的 export provider 在整个 injector tree **全局唯一可见**，
> 故 presence 发、notification 收共用**同一个有状态** `MemoryEventBus`（其 `handlers` Map 持订阅表）。platform import 同一 `@Global()` 模块即落同一实例。
> **现存铁证**：`apps/gateway-api/src/notification.e2e-spec.ts` 里 "presence status changes → manager notifications through the shared event bus" 用例已在跑。
> （勿把成因写成"静态模块只实例化一次"——非 `@Global()` 的普通静态模块被多处 import 时实例数取决于 export 链路，并非天然单例。）
> 仍**必须用 e2e 实证**（§4.2 双向断言）兜底：若没收到，排查是否有人误用非 global 变体 / 多实例。

**(b) 注入**（[employee.service.ts](apps/platform-api/src/users/employee.service.ts)）：构造器加 `@Inject(EVENT_BUS) private readonly eventBus: EventBus`（`from '@work/event-bus'`，**显式 `@Inject`**）。

**(c) 发事件**（替换 L131 接缝注释）：在成功审计之后、`return saved` 之前：

```ts
// profile.updated：仅「他人改」且有实际变更才发——本人改本人（含管理员经 :id 改自身）不自通知。
if (saved.id !== currentUser.id && changedFields.length > 0) {
  try {
    await this.eventBus.publish<ProfileUpdatedPayload>({
      type: platformEvents.profileUpdated,
      source: 'platform.api',
      traceId: auditContext.traceId,
      payload: {
        enterpriseId: currentUser.enterpriseId,
        subjectUserId: saved.id,
        changedBy: currentUser.id,
        changedFields, // ProfileField[] 协变赋给 string[]，直接传，勿做无谓 cast；绝不带值
      },
    });
  } catch (error) {
    // 通知是 best-effort：档案写已提交+审计，事件发布失败不得回滚写、不得 500 用户请求。
    this.logger.warn(
      `profile.updated publish failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
return saved;
```

- **发/不发判定唯一真值 = `saved.id !== currentUser.id`**（不要用 `mode`）：`mode==='self'` 时 id 必相等故不发；
  `mode==='management'` 但管理员经 `:id` 改自身时 id 也相等、同样不发（RFC §6「`changedBy===subjectUserId` 跳过」的精确实现）。
- **空改不发**：`changedFields.length===0`（无任何字段实际变化）不发——无变更不打扰。
- **best-effort 的真实语义（别夸大覆盖）**：`MemoryEventBus.publish` 是 `await Promise.all(handlers...)`（[memory-event-bus.ts](packages/event-bus/src/memory-event-bus.ts)），
  即**同步 await 到所有 handler 跑完**；而 `handleProfileUpdated` 自带 `try/catch`（§2.4）永不向 publish 抛错。故 in-memory 单进程下生产侧的 `try/catch`
  **实际不会触发**，是为**未来跨进程 / 异步 bus / 或 publish 本身抛错**留的**冗余但无害防御**——**不得据此宣称"已验证发布失败不回滚写的真实路径"**。
  仍要加：`EmployeeService` 加 `private readonly logger = new Logger(EmployeeService.name)`，publish 包 `try/catch` 失败仅 warn（写已落库+审计、是事实源，通知链路不可影响写结果）。
- **不引入** trigger_config / RecipientResolver 到 platform 侧（那是 notification 的事）；platform 只管"发生了什么"，不管"通知谁/要不要通知"。

### 2.4 notification 消费：新增订阅器分支 + handleProfileUpdated

在 [notification-event.subscriber.ts](modules/notification/api/src/events/notification-event.subscriber.ts) **同一个 subscriber 类**内追加第二条订阅（不新建类）：

- `onModuleInit`：在既有 presence 订阅之后追加
  `this.unsubscribeProfile = this.eventBus.subscribe<ProfileUpdatedPayload>(platformEvents.profileUpdated, (e) => this.handleProfileUpdated(e));`
- `onModuleDestroy`：`this.unsubscribeProfile?.(); this.unsubscribeProfile = undefined;`（与 presence 那条并列）。
- **`handleProfileUpdated`**（**不要照抄 presence handler**）：

```ts
private async handleProfileUpdated(event: DomainEvent<ProfileUpdatedPayload>): Promise<void> {
  try {
    // 恒发：不查 trigger_config（§2.5 决策）。接收人 = 被改本人，直接取，不经 RecipientResolver。
    await this.notificationService.create({
      recipientUserIds: [event.payload.subjectUserId],
      title: '个人信息变更',
      content: '你的个人信息已被更新，请查看个人档案。', // 最小披露：不贴字段值、不解析修改人姓名/角色（management 未必是"管理员"角色）
      sourceModule: 'platform',
      sourceId: event.payload.subjectUserId,
      channel: 'in_app',
    });
  } catch (error) {
    this.logger.error(
      `Failed to handle ${event.type}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
```

- **接收人唯一 = `subjectUserId`**：不调 `recipientResolver.resolve`、不读 `defaultRecipients`、不解析角色/部门负责人。
  （`RecipientResolver` 仍是其它触发点用，本 handler 不依赖它——构造器已有该注入可不动，但本 handler 不调它。）
- **恒发**：不调 `triggerConfigRepository.findTriggerConfig` / 不查 `enabled`（§2.5）。
- **文案最小披露**：不含 `changedFields` 的值、不含字段名明细（"个人信息"足矣）、本期不把 `changedBy` 解析成姓名（避免新增 platform 读端口=越界）。
- **错误隔离**：`try/catch` + `logger.error`（照 presence handler）；订阅器异常不得冒泡毁事件总线。
- `sourceModule: 'platform'`（被改的是 platform 档案）；`sourceId` 取 `subjectUserId`（无更细资源 id；前端卡片仅展示，不强依赖）。

### 2.5 已决策（写进任务包，二审勿再开放）

- **④ trigger_config enabled 开关 = 不做（恒发）**（RFC §20-4 留给 M8-3，**本切片拍板**）：接收人固定=本人、不经 RecipientResolver，
  trigger_config 对它只剩一个 on/off 没有可配项；"被改本人通知"语义上不需要关。故**不 seed trigger config、订阅器不查 enabled、不进 M7-4b 触发点配置页**。
  （未来若产品要"被改不想被打扰"开关，再补——届时复用 M7 trigger_config 机制即可，本切片不预埋。）
- **修改人姓名进文案 = 预留不做**：本期文案泛化（"已被更新"，不写"管理员"——management 仅表"非本人改"，未必是管理员角色），不解析 `changedBy`→姓名（需新增 platform 读端口/lookup，超出本切片）。
  payload **保留** `changedBy` 字段供未来文案/审计解析（写清用途，非空白预留）。
- **status_logs 不发任何事件**：M8-4 的近况记录**明确不通知**本人（RFC §6/§15），本切片**不为其注册触发点**，并保留 notification-contract 防误加注释。

### 2.6 跨进程 / 边界纪律

- platform **不**直接 import notification 任何内部；只发领域事件（合法跨模块协作手段，`modules/presence/CLAUDE.md`）。
- notification **不**反向 import platform 内部、**不**跨 schema 读 `platform.*`；只经 `@work/platform-contract`（契约）+ 事件 payload 拿数据。
- payload **零字段值**：跨进程只传 id + 变更字段**名**，杜绝档案值外泄（RFC §13）。

## 3. 模块结构增量

### `packages/platform-contract`

- **新增** `src/events.ts`：`platformEvents.profileUpdated` + `ProfileUpdatedPayload`（§2.1）。
- `src/index.ts`：加 `export * from './events';`。

### `apps/platform-api`

- `src/platform.module.ts`：`imports` 加 `EventBusModule`（`@work/nest-common`）（§2.3a）。
- `src/users/employee.service.ts`：构造器注入 `@Inject(EVENT_BUS) eventBus` + `Logger`；接缝 L131 替换为「他人改且有变更才发」的 publish（§2.3b/c）。
- `src/users/employee.service.spec.ts`：补发/不发判定 + payload 断言（§4.2）。

### `modules/notification`

- `contract/src/events.ts`：移除 `notificationTriggerKeys.profileUpdated`，注释改指针（§2.2）。
- `api/src/events/notification-event.subscriber.ts`：追加 `profile.updated` 订阅 + `handleProfileUpdated`（§2.4）。
- `api/src/events/notification-event.subscriber.spec.ts`：补 profile.updated handler 断言（§4.2）。
- `api/package.json`：**无需改**——`@work/platform-contract` 依赖已在（§2.2）。

### `apps/gateway-api`（或既有 e2e 落点）

- 既有 `*.e2e-spec.ts` 增「他人改档案 → 本人收到通知 / 本人改 → 无通知」双向链路（§4.2）。

> 不动迁移 / schema / 权限点 / 数据范围模型；不动 auth/scope/audit/rbac/repositories 规则；不动 presence 既有发布、不动 notification 既有 presence 订阅与 RecipientResolver/trigger_config 既有路径；不动前端。

## 4. 验证

### 4.1 命令（全过）

```bash
# 无新增依赖（platform-contract 已在 notification/api，event-bus/nest-common 已在 platform-api）——无需 pnpm install
NODE_ENV=test pnpm lint && NODE_ENV=test pnpm typecheck   # 含 Nx 边界 tag 校验（module→package 合法）
NODE_ENV=test pnpm test         # 单元 + web（务必 NODE_ENV=test，见记忆）
NODE_ENV=test pnpm test:e2e     # in-memory e2e（跨 platform 生产 + notification 消费）
NODE_ENV=test pnpm build
```

> 本切片**无迁移、不改部署形态、无 schema 变更**：`pnpm db:generate` 应**零 diff**（跑一次确认没误改 schema）；
> `pnpm verify:full` 的 Postgres-gated 部分**无新断言**（无新表/列），但回归须确认既有 gate 真跑未假绿；`pnpm docker:build` 非必跑（留 M8-6）。

### 4.2 断言（必须覆盖）

- **EmployeeService 单元（`employee.service.spec.ts`，memory driver，spy `eventBus.publish`）**：
  - **他人改 → 发**：`mode:'management'` 改范围内他人的 `name/title/...` 成功 → `publish` 被调用 1 次，`type==='profile.updated'`，
    `payload.subjectUserId===目标id`、`changedBy===操作者id`、`changedFields` 为实际变更字段名数组、`enterpriseId` 正确。
  - **payload 零值**：用 `expect(Object.keys(payload).sort())` **精确**断言键集 = `['changedBy','changedFields','enterpriseId','subjectUserId']`
    （**勿用 `toMatchObject`**——松断言放不过"不小心多带了 newValue/字段值"）；`changedFields` 元素是字段**名**字符串（如 `'title'`），不含任何字段值（无 `title:'...'`、无 old/new）。
  - **本人改 → 不发**：`mode:'self'` 改自身 → `publish` **0 次**。
  - **管理员经 `:id` 改自身 → 不发**：`mode:'management'` 但 `targetId===currentUser.id` → `publish` **0 次**（验证判定按 `saved.id!==currentUser.id` 非按 mode）。
  - **空改 → 不发**：传与原值相同的字段（`changedFields` 空）→ `publish` **0 次**。
  - **发布失败不影响写（mock-only 契约测试，标注清楚）**：**mock `eventBus.publish` 强制 reject** → `updateEmployeeProfile` 仍正常返回 `saved`、不抛、审计已记。
    （注：真实 in-memory 链路下 publish 不会因 handler 失败而 reject——handler 自带 try/catch；这条**只**验证"假设 publish 抛错时不回滚写"的契约，**不**代表真实失败路径被覆盖，见 §2.3c。）
  - **审计/payload 同源**：断言 `profile.updated` payload 的 `changedFields` 与同一次写的 audit `metadata.changedFields` 一致（同源，防两处算法漂移）。
  - **回归**：写成功路径审计（`platform.employee.profile.update`）不变；M8-2a 既有断言全绿。
- **notification 订阅器单元（`notification-event.subscriber.spec.ts`）**：
  - `handleProfileUpdated` → `notificationService.create` 被调用，`recipientUserIds===[subjectUserId]`、`sourceModule==='platform'`、`channel==='in_app'`、
    `content` **不含**字段值/字段名明细。
  - **不经 RecipientResolver / 不查 trigger_config**：断言 `recipientResolver.resolve` **0 次**、`triggerConfigRepository.findTriggerConfig` **0 次**（spy）。
  - **错误隔离**：令 `create` reject → handler 不抛（`logger.error` 被调）。
  - **回归**：presence 订阅与 handler 行为不变（`onModuleInit` 仍订阅 presence；`onModuleDestroy` 两条都退订）。
- **e2e（in-memory，经 gateway，memory driver——`MemoryEventBus` 单例跨模块传递的实证）**：
  > **fixture 提示**：memory seed 仅 admin（company scope + 全权限）。"被改的普通员工"须 admin 经 `POST /employees` 现建并拿 id；
  > "普通员工登录改自身"须该员工登录拿 token（`mustChangePassword:true` 不阻塞登录）。**复用 `apps/gateway-api/src/notification.e2e-spec.ts` 既有
  > `createEmployee` / `login` helper 与 initialPassword 约定 `'Passw0rd'`**（别自起炉灶，省得踩密码格式/mustChangePassword）。
  > **时序**：`MemoryEventBus.publish` 同步 await handler（§2.3c），故写请求**返回后即可立即**断言通知已落库，无需轮询/sleep——但此时序依赖 bus 实现，注释标明勿假定异步。
  - **他人改 → 本人有通知**：admin `PUT /employees/:otherId/profile` 改某员工 `title` → 该员工（用自己的 token，list 按 recipient=当前用户过滤）
    `GET /api/notification`（或 unreadCount）出现一条 `recipientUserId===otherId`、`sourceModule==='platform'` 的通知。
    **这是「platform 发→notification 收」单例链路的实证**（若 0 条 = EventBus 没共用单例，立即排查 §2.3 接线）。
  - **本人改 → 无通知（防假绿核心）**：该员工 `PUT /employees/me/profile` 改自身 → **不产生**新通知记录（去自身逻辑）。
  - **空改 → 无通知**：**先 `GET /employees/:id` 拿现值，再用完全相同的值回传**（如回传完全相同的 `name`），使 `changedFields` 为空。
    ⚠️ 新建员工的 `title/mobile/email` 多为 `undefined`，**别**给这些字段传 `null`/`''`——那是 `'' !== undefined` 的**一次真实变更**（会发通知），会让本断言假失败。
- **回归**：platform / presence / files / forms / notification 既有单元 + e2e 全绿；presence.status.changed → 部门负责人通知链路不变；
  `listEmployees`/`updateEmployeeProfile` 既有读写/审计语义不变；铃铛/SSE（M7-4b）对新 `in_app` 通知自动生效（无需改前端）。
- **web**：本切片**无前端**，不新增 `*.spec.tsx`。
- 验收禁止假数据/占位蒙混；source-review 判定（e2e 须真跑出双向断言，非 mock 蒙混——RFC §12）。

## 5. 退出标准

1. `packages/platform-contract` 新建 `profile.updated` 事件名常量 + `ProfileUpdatedPayload`（payload 仅 id + 变更字段**名**，零字段值），`index.ts` 导出。
2. notification-contract 收敛：移除孤立 `profileUpdated` 字符串、改为指向 platform-contract 的指针注释；notification 订阅器引用 platform-contract 常量。
3. platform 接上 `EventBusModule`、`EmployeeService` 注入 `EVENT_BUS`，在 M8-2a 接缝处发 `profile.updated`，
   **仅「他人改（`saved.id!==currentUser.id`）且 `changedFields` 非空」时发**，本人改/空改不发；发布 best-effort（失败不回滚写、不 500）。
4. notification 新增 `profile.updated` 订阅器 + `handleProfileUpdated`：**接收人=`subjectUserId` 本人直取、恒发、不经 RecipientResolver、不查 trigger_config**；文案最小披露；错误隔离。
5. **e2e 双向断言通过**：他人改 → 本人落库一条通知（实证 EventBus 单例跨 platform/notification）；本人改 / 空改 → 无通知。
6. ④ 开关决策落地 = **恒发不加 trigger_config**（§2.5）；status_logs 不发事件的边界保留（防误加注释在）。
7. **§16 不触发**判定写入 verification-log（payload 零值、不改数据范围/鉴权/敏感字段），security-reviewer 复核确认无需补 baseline/ADR。
8. `security-reviewer` 独立二审通过（§0 五关注点）；本切片**无迁移/无 schema/无新权限点/不改数据范围模型**。
9. 单元 + e2e 全绿，`NODE_ENV=test`；`pnpm db:generate` 零 diff；`pnpm verify` 全绿；既有 Postgres-gated 回归确认真跑未假绿。

## 6. 必须保持不变（避免越界）

- 不发字段值（payload 仅 id + 字段名）；不广播（接收人唯一=subjectUserId）；不通知本人以外。
- 不引入 trigger_config / RecipientResolver 到 profile.updated 路径；不改 presence 订阅、RecipientResolver、trigger_config 既有逻辑。
- 不碰 status_logs / `platform:status-log:create`（M8-4）；不为 status_logs 发任何事件。
- 不碰 forms / 人页聚合 / 照片（M8-5）；不改 M8-2a 档案读写/审计/范围语义；不改 auth/scope/audit/rbac/repositories 规则。
- **无迁移、无 schema、无新权限点、不改数据范围模型**；不解析 `changedBy`→姓名（预留）；不新增前端。
- platform 不被其它模块跨 schema 读写；跨模块只走领域事件 + 契约。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：M8 切片表标 M8-3 done + 下一步 M8-4（近况记录）；M8 行仍 In Progress。
- `docs/platform-core.md`：新增 `profile.updated` 事件契约（生产者 platform、payload 字段、「他人改才发」时机、notification 消费=本人恒发不经 resolver）。
- `docs/architecture.md`：若需，一句话补"档案被他人改 → platform 发 `profile.updated` → notification 通知本人（点亮 M7 ④）"。
- `docs/domain-glossary.md`：补"`profile.updated`（被他人改档案事件，payload 仅 id+变更字段名）"术语。
- `docs/doc-index.md` §7：catalog 增 M8-3 任务包行。
- `docs/verification-log.md`：追加 `M8-3 profile.updated Event` 锚点（含 **§16 不触发判定 + 理由**——写明"新增 platform→notification 跨进程事件，载荷={id 集 + 字段名集}，
  经评估不携带可越权利用信息，故不补 baseline/不加 ADR"给 reviewer 明确数据流锚点 + reviewer 结论 + e2e 双向断言结果 + ④恒发决策 + EventBus 单例实证 + 假绿核查）。
- **不更新 `docs/security-baseline.md`**（§16 未触发，§0 已判定；与 M8-2a「同变更补 §5.3」相反，本切片刻意不动 baseline，理由留痕在 verification-log）。

## 8. 提交规范

- 代码分支由 Codex 负责（`feat/...`），走 PR；本任务包属纯文档，由规划方提交 main。
- 代码提交 Conventional Commits：`feat(platform): publish profile.updated on third-party profile writes + notification subscriber`。
- 提交信息说明：① platform-contract 新建事件契约（payload 零字段值）；② platform 接 EventBus 在写收口发事件（他人改且有变更才发）；
  ③ notification 新增订阅器消费（接收人=本人、恒发、不经 RecipientResolver）；④ §16 不触发判定（不补 baseline）+ 是否过 security-reviewer；
  ⑤ e2e 双向断言（他人改有/本人改无）+ EventBus 单例实证。
- 合并前过 §0 的 security-reviewer；交付前跑完 §4 命令，结论贴进 `docs/verification-log.md`。
