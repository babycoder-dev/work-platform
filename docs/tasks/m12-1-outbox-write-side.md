# Task: M12-1 outbox 写入侧（`@work/event-bus` 契约扩展 publishInTx + SQL 表工厂 + EventBusModule.forRoot 两档路由 + 事件分级契约 + platform 表改造/presence·forms·files 建表迁移 + 四发布方同事务接线（含两处行为反转）；投递仍内存直投过渡态——relay/Redis/消费三件套/订阅器迁移均不在本切片）

## 状态

- 里程碑：M12（可靠事件与多进程基建，RFC `docs/rfc/m12-reliable-events-multiprocess.md` 已 Accepted）
- 切片：M12-1（RFC §16 首切片），依赖序 M12-1 → M12-2 → {M12-3,M12-4} → M12-5
- **安全敏感**：触 platform repository（`apps/platform-api/src/repositories` 属安全基线子树）+ platform
  迁移 + 审计次序行为反转（§5.4-2）。合并前**强制 security-reviewer**。
- 配套决策文档：**ADR-0007（`docs/adr/0007-event-transport-outbox-redis-streams.md`）已定稿、随本切片
  同批入库**——Codex 原样携带该文件进 PR，**不得改写其内容**；blueprint 两处措辞修正随 ADR 同批（§7）。
- 交付形态：`feat/m12-1-outbox-write-side` 分支 + PR。

## 0. 任务定位

把 critical 领域事件的**发布侧丢失面归零**：事件行与业务写**同事务**落进发布方模块自己 schema 的
`domain_events` 表（outbox）。本切片只做**写入侧**——投递仍是内存直投（`MemoryEventBus`），形成
「outbox 记账 + 内存投递并行」的过渡态；relay/Redis 传输归 M12-2。

具体七件事：

1. **`@work/event-bus` 契约扩展**：`EventReliability`/`EventDefinition`/`DomainEventDraft`/`OutboxTx`
   四类型 + `EventBus.publishInTx(tx, event)`（critical 唯一发布入口）+ 建表 SQL 模板
   `createDomainEventsTableSql(schemaName)` + 列名常量。
2. **`MemoryEventBus` 升级**：实现 `publishInTx`（经 tx 句柄参数化 INSERT 写 `<schema>.domain_events`
   - 同事务 `pg_notify` + **额外立即进程内投递**——过渡态语义）；`publish()` 对已注册 critical 类型
     缺省记 warn，`{ allowCriticalPublish: true }` 显式豁免；未注册 source/type 的 `publishInTx` 抛错
     （fail fast）。
3. **`EventBusModule.forRoot({ registrations, allowCriticalPublish? })`**：宿主装配注册两档路由
   （发布注册带 `schemaName`、消费注册不带）；**拆双宿主炸弹**（§2.3：模块级 plain import 全删，
   platform-api 新增 App 壳）。
4. **事件分级契约**：platform/presence/forms/files 四个 contract 各导出 `xxxEventDefinitions`
   （既有常量对象保留、类型不破；定级按 RFC §5.2 表）。
5. **四份迁移**：platform 升级现表（加 `source`/`trace_id` + 部分索引重建）；presence/forms/files
   各自迁移入口各建一张 `domain_events`（表工厂模板输出）。
6. **四发布方接线（七个发布点 = platform 1 + presence 2 + forms 3 + files 1）**：按 RFC §5.4 推荐
   姿态 (b)——repository 写方法携带 outbox 事件，业务写与事件行同事务；含**两类显式行为反转**
   （platform 吞错删除、审计与事件次序反转——后者四发布方通用，见下）。
7. **文档件**：ADR-0007 入库 + blueprint 两处措辞修正 + module-contract §4 增补（本切片份额）+
   进度/索引登记。

### 对 RFC 的显式偏差 / 任务包决策（评审按此口径）

- **D-1 发布路由按 `event.type` 查注册 definitions，不按 `source→module` 字面映射**（对 RFC §6.2
  「按 event.source → module 查发布注册」的实现收窄）：`source` 值形如 `'presence.api'`，与注册键
  `'presence'` 之间没有规范映射（去后缀是脆约定）；`type` 是 `EventDefinition` 的主键且注册时已随
  definitions 提交。fail fast 语义不变：未注册 type → 抛错。`source` 仍原样入列（`source` 列）。
- **D-2 outbox 事件参数 = 同步工厂回调** `outboxEvent?: (row) => DomainEventDraft`：presence/files 的
  聚合 id 由 DB 生成（`gen_random_uuid()` / RETURNING）；forms 的 record id 虽由服务层 `randomUUID()`
  预生成（`forms.service.ts:395`），但 `reserveRecord` 对 singleton 槽位可能 **upsert 复用既有行 id**
  （`postgres-forms.repository.ts:427-441`）——三家最终 id 都只有写后才可靠，draft 无法先于写构建。
  工厂**必须同步**（在事务内执行，不做 IO）——presence `cancelRecord` 的 label 解析改为**调用 repo
  前预取**字典 map（§2.5-2），不在工厂里 await。
- **D-3 forms 经新 repo 方法 `publishDomainEvent(uow, draft)` 走 UoW executor**：forms 的事务句柄藏在
  files-contract `UnitOfWork` 的 `UNIT_OF_WORK_CONTEXT` symbol 里（`postgres-forms.repository.ts:718-728`），
  服务层拿不到裸 client。`publishInTx` 仍只在 **postgres repository 层**被调用（RFC §6.2「唯一预期
  调用方」口径守住），服务层只是在自己的 UoW 回调内多调一个 repo 方法。
- **D-4 platform-api 新增 App 壳模块**：`PlatformModule` 既被 gateway import 又被 platform-api 直接
  bootstrap（`main.ts:6`）——forRoot 只能放**进程根**，否则双 provider（见 §2.3 炸弹说明）。新增
  `apps/platform-api/src/app.module.ts`（imports: PlatformModule + `EventBusModule.forRoot`(platform
  注册)），main.ts 与 platform e2e 改 bootstrap 它。
- **D-5 warn 豁免接线**：宿主 forRoot 传
  `allowCriticalPublish: process.env.PLATFORM_REPOSITORY_DRIVER === 'memory'`——内存 repository
  fixture 按 §5.4 把 outbox 事件转 `publish()`，此参数即 RFC §6.2 所述 fixture 豁免机制的装配落点
  （生产默认 postgres driver ⇒ 豁免关闭，warn 守护生效）。**隐含假设显式声明**：以
  `PLATFORM_REPOSITORY_DRIVER` 作为"全体模块 memory 形态"的代理——forms/files 各有独立 driver env
  （`FORMS_REPOSITORY_DRIVER`/`FILES_REPOSITORY_DRIVER`），当前全部 10 个 in-memory e2e 都统一设
  memory（代理成立）；若未来出现混合 driver 测试形态（forms=memory 而 platform=postgres），届时改为
  按模块豁免，本切片不做。
- **D-6 `pg_notify` 随 publishInTx 先行落地**：监听方（relay）M12-2 才有，先发无害（无人 LISTEN 即
  丢弃），避免 M12-2 再回改 publishInTx。
- **过渡态已知事实（RFC §16 M12-1 行原文，写进 PR 描述）**：无 relay ⇒ 未发布行按事件量线性堆积
  （量级无害；清理 job 归 M12-3 且只删已发布行）；堆积由 M12-2 cutover 水位一次性收编——**设计内
  行为不是 bug**。memory 驱动 handler 在业务事务**提交前**运行（§6.2 语义差异）——依赖"回滚则不
  投递"的断言只能落 PG 门。

### 行为反转（RFC §5.4，显式声明、审查重点）

1. **platform 吞错删除**：`employee.service.ts:120-136` 的 try/catch warn 吞发布失败——迁移后事件行
   随业务事务写入，**写失败 = 事务失败**，吞错逻辑删除。`employee.service.spec.ts:333` 的「bus down
   仍成功」断言随之**删除/反转**。
2. **审计与事件次序反转（四发布方通用，非仅 platform）**：现状**四家**都是审计在发事件之前且异常
   上抛——platform `recordAuditLog`（`employee.service.ts:103`→publish `:121`）、presence
   （`:203`→`:222`、cancel `:267`→`:285`）、forms（`:120`→`:136`、`:289`→`:309`）、files
   （`:259`→`:264`）——今天"审计失败 ⇒ 事件不发"。迁移后 outbox 行随业务事务先提交，审计写在
   事务后、失败不再阻断事件，**四发布方同此反转**。刻意为之（事件以已提交的业务事实为准），
   security-reviewer 按此口径核全部四家。（RFC §5.4 原文只点名 platform，此处按代码现实补齐——
   属对 RFC 的事实补充，非偏差。）

### 安全门禁判定（security-reviewer 重点）

1. **platform repository 子树变更**（`postgres-platform.repository.ts` updateEmployee 事务化 +
   `memory` 实现同步 + platform 迁移）：platform-api CLAUDE 安全面规则——引用 security-baseline
   条款、不凭记忆；`db:migrate` 入口不与 presence 合并。
2. **审计次序反转（四发布方全查，上文反转 2）**：审计失败不再阻断业务/事件——须逐发布方确认审计
   失败仍有日志面（各 audit 调用的异常语义如何着地：事务后调用、异常按现有 catch/上抛策略处理，
   **不得静默吞**；实现时如实记录四家的着地方式供审查）。
3. **outbox payload 最小化**（RFC §13）：**七个发布点** payload **原样保留、不扩**（id/字段名/最小
   业务键；`profile.updated` 仍是 id+changedFields 零字段值）。outbox 行不是审计（`audit_logs`
   另在），不得把审计信息塞进 payload。
4. **迁移安全**：`platform.domain_events` 零写入方（`0000_init_platform.sql:182-194`，全仓无 INSERT
   方）⇒ 加 NOT NULL 列零数据风险；但迁移仍须幂等（`IF NOT EXISTS`/`IF EXISTS` 风格与既有迁移一致）。
5. **无跨 schema**：每模块只写自己 schema 的 `domain_events`；`publishInTx` 的 schemaName 来自宿主
   注册，不来自事件内容（防经 payload/type 注入别家 schema——schemaName 白名单=注册表）。
6. **fail fast 不可静默降级**：未注册 type 的 `publishInTx` 抛错（不是 warn、不是回退 `publish`）。
7. **`OutboxTx` 句柄只在 repository 层流转**：服务层/控制器不得持有裸事务句柄调 publishInTx
   （forms 经 D-3 的 repo 方法）。

### 本切片不做（越界即打回）

- relay / LISTEN / advisory lock / drain（M12-2）；`RedisStreamEventBus` 与 `EVENT_BUS_DRIVER` env
  （M12-2——本切片 MemoryEventBus 仍是唯一驱动，无需驱动开关）。
- 消费三件套 / 幂等表 / 死信 / 订阅器迁移（`notification-event.subscriber.ts` **一行不动**，M12-2）。
- cutover 迁移 / 升级 runbook（M12-2）；SSE / `SseSignalBus` / realtime-gateway 处置（M12-3）；
  `@work/scheduling` 抽壳与清理 job（M12-3）；告警/metrics/observability（M12-4）；CI 矩阵/
  testing-strategy.md（M12-5）。
- notification 模块**不建 outbox 表**（只消费不发事件，RFC §6.1）；`notification.created` 不升格
  （RFC §19）。
- deployment.md 的 REDIS_URL 注入 / Redis 持久化配置（M12-2/M12-4）。
- module-contract §4 增补里属 M12-2/3 的部分：消费三件套规范、无 schema 宿主约定、advisory lock
  key 约定（本切片只写分级判据/定级表/命名沿用+豁免/payload 最小化/critical 必须 publishInTx）。
- 不改事件 payload 形状、不改既有事件名、不动 `EventBus.publish/subscribe` 既有签名。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `docs/adr/0007-event-transport-outbox-redis-streams.md`（已定稿随本切片入库）——决策口径总纲。
2. `docs/rfc/m12-reliable-events-multiprocess.md` §3（现状盘点——**行号以本任务包 §1-5 重核清单为准**，
   RFC 写于 M9-2 合并前已漂移）、§4（D1–D8）、§5 全（分级/契约形状/聚合对照表/发布方语义变化）、
   §6 全（表工厂/路由注册/守护/语义差异）、§16 M12-1 行（含过渡态已知事实）、§17/§18。
3. `AGENTS.md`（模块边界/错误信封/提交）+ `packages/CLAUDE.md`（packages 单向依赖：event-bus 不得
   import apps/modules）+ `apps/platform-api/CLAUDE.md`（安全敏感子树规则，本切片触 repositories）。
4. `packages/event-bus/src/`（`domain-event.ts` 现契约、`memory-event-bus.ts`、`event-bus.token.ts`、
   `index.ts`）+ `packages/nest-common/src/event-bus.module.ts`（现 @Global 静态模块，:1-14）。
5. **发布点现状（已按 main@9bfc78e 重核）**：
   - `apps/platform-api/src/users/employee.service.ts:96-138`（updateEmployee 调用 :97、audit :103、
     条件 :119、publish+吞错 :120-136）；spec 影响点 `employee.service.spec.ts:259/:323/:333`。
   - `modules/presence/api/src/status/presence-status.service.ts:222`（createRecord 发布）/`:285`
     （cancelRecord 发布，含内联 await label 解析 `:293-295` 附近）。
   - `modules/forms/api/src/forms/forms.service.ts:136`（updateDefinition）/`:199`（createRecord）/
     `:309`（upsertRecordBySubject，仅 `!existing` 时发）。
   - `modules/files/api/src/files/files.service.ts:101`（uploadFile 调 recordUploadSuccess）/
     `:254-277`（audit + publish）。
6. **事务姿态现状（接线依据）**：
   - `apps/platform-api/src/repositories/postgres-platform.repository.ts:621`（updateEmployee =
     裸 `pool.query` 单条 UPDATE，无事务）。
   - `modules/presence/api/src/db/postgres-presence.repository.ts:129-173`（createRecord = 裸单条
     INSERT，id DB 生成）/`:175-190`（cancelRecord = 裸单条 UPDATE）/**`:321-340`（setDefaultStatusType
     的 client BEGIN/COMMIT + ROLLBACK + mapPresencePostgresError——presence repo 内事务先例，照抄
     姿态）**。
   - `modules/forms/api/src/db/postgres-forms.repository.ts:132-137`（withUnitOfWork）/`:718-728`
     （`requireExecutor`/`resolveExecutor` 从 `UNIT_OF_WORK_CONTEXT` symbol 取 QueryExecutor）。
   - `modules/files/api/src/db/postgres-files.repository.ts:93-103+`（createStagedFileObjectWithQuota
     = 既有 client 事务 + `pg_advisory_xact_lock` + 配额检查——outbox 写并入该事务）。
7. `apps/platform-api/src/db/migrations/0000_init_platform.sql:182-194`（domain_events 现表 +
   `:194` 普通索引待改部分索引）；platform 迁移目录看现有编号取下一号；presence/forms/files 迁移
   入口分别为 `db:migrate:presence|forms|files`。
8. **装配现状**：`apps/gateway-api/src/gateway.module.ts:14`、`apps/platform-api/src/platform.module.ts:36`、
   `apps/platform-api/src/main.ts:6`（bootstrap PlatformModule——双宿主问题根源）、
   `modules/files/api/src/files.module.ts:21`、`modules/forms/api/src/forms.module.ts:18`、
   `modules/presence/api/src/presence.module.ts:16`、`modules/notification/api/src/notification.module.ts:34`。
9. 四个 contract 的事件文件（`packages/platform-contract` 的 events、`modules/{presence,forms,files}/
contract/src/events.ts`）——加 definitions 的落点；contract 依赖 `@work/event-bus`（workspace 依赖，
   缺则补——modules 依赖 packages/\* 合法）。
10. `docs/module-contract.md` §4（事件规范现文——增补落点）；`docs/foundation-blueprint.md` M12 节
    （两处措辞修正落点，ADR-0007 决策 6 给了精确口径）。

## 2. 设计要点（严格遵守）

### 2.1 `@work/event-bus` 契约与表工厂

`domain-event.ts` 增（RFC §5.3 原文形状）：

```ts
export type EventReliability = 'critical' | 'notify-only';
export interface EventDefinition {
  type: string;
  module: string;
  reliability: EventReliability;
}
export interface DomainEventDraft<TPayload = unknown> {
  type: string;
  source: string;
  payload: TPayload;
  traceId?: string;
  aggregateType: string;
  aggregateId: string;
}
export type OutboxTx = { query(sql: string, params?: unknown[]): Promise<unknown> };
export interface EventBus {
  publish<TPayload>(
    event: Omit<DomainEvent<TPayload>, 'id' | 'occurredAt'>,
  ): Promise<DomainEvent<TPayload>>;
  publishInTx<TPayload>(
    tx: OutboxTx,
    event: DomainEventDraft<TPayload>,
  ): Promise<DomainEvent<TPayload>>;
  subscribe<TPayload>(type: string, handler: DomainEventHandler<TPayload>): () => void;
}
```

新文件 `outbox-table.ts`：

```ts
export const DOMAIN_EVENTS_TABLE = 'domain_events';
export const DOMAIN_EVENT_COLUMNS = [...] // id,event_name,aggregate_type,aggregate_id,source,trace_id,payload,occurred_at,published_at
export function createDomainEventsTableSql(schemaName: string): string { ... }
```

模板输出（RFC §6.1 列形状，与 platform 现表对齐 + 补列）：建表（`id uuid PRIMARY KEY DEFAULT
gen_random_uuid()`、`event_name varchar(128) NOT NULL`、`aggregate_type/aggregate_id varchar(128)
NOT NULL`、`source varchar(64) NOT NULL`、`trace_id varchar(64)`、`payload jsonb NOT NULL`、
`occurred_at timestamptz NOT NULL DEFAULT now()`、`published_at timestamptz`）+ 三索引
（`(aggregate_type, aggregate_id)`、`(event_name)`、**部分索引 `(occurred_at) WHERE published_at IS
NULL`**）。全部 `IF NOT EXISTS` 幂等。`schemaName` 仅接受正则 `[a-z_][a-z0-9_]*` 锚定全串（即
`^`…`$`；模板函数内校验，防注入——虽然调用方只有自家迁移。⚠️ 别照抄本段渲染文本里的转义，以
「小写字母或下划线开头、仅含小写字母/数字/下划线」的语义为准）。

### 2.2 `MemoryEventBus` 升级（过渡态核心）

构造签名 `new MemoryEventBus(options?: { registrations?: EventBusRegistration[]; allowCriticalPublish?:
boolean })`；`EventBusRegistration = { module: string; schemaName?: string; definitions:
EventDefinition[] }`（发布注册带 schemaName，消费注册不带——两档，RFC §6.2）。内部建
`type → { reliability, schemaName?, module }` 索引。

- `publishInTx(tx, draft)`：查 type 索引——未注册或**注册但无 schemaName**（消费注册）→ 抛错
  （fail fast，错误信息含 type）；命中 → 经 `tx.query` 参数化
  `INSERT INTO <schema>.domain_events (event_name, aggregate_type, aggregate_id, source, trace_id,
payload) VALUES (...) RETURNING id, occurred_at`（`occurred_at` 不入列清单、靠 DEFAULT now()，
  RETURNING 取回）+ 同一 tx
  `SELECT pg_notify('outbox_wake_<module>', '')` → 用 RETURNING 的 id/occurred_at 组装 `DomainEvent`
  → **立即进程内投递给 subscribers**（过渡态"记账+直投并行"）→ 返回该 event。`occurred_at` 以 DB
  返回值为准（事件 id 与 outbox 行 id 必须同源——M12-2 幂等键）。
- `publish(event)`：行为不变 + 新守护——若 type 在索引中且 `reliability==='critical'` 且未
  `allowCriticalPublish` → `console.warn`（一条、含 type 与指引"critical 须走 publishInTx"）后照常
  投递（memory 档记 warn 不抛，RFC §6.2；抛错档归 M12-2 Redis 驱动）。未注册 type 的 publish 不
  warn（订阅器单测裸 bus 不受噪音）。
- `pg_notify` 的 channel 名 `outbox_wake_<module>`（RFC §7），module 取注册项的 module 字段。

### 2.3 `EventBusModule.forRoot`（⚠️ 双 provider 炸弹，本切片最大装配坑）

`packages/nest-common/src/event-bus.module.ts` 改造：

```ts
@Global()
@Module({})
export class EventBusModule {
  static forRoot(options: {
    registrations: EventBusRegistration[];
    allowCriticalPublish?: boolean;
  }): DynamicModule {
    return {
      module: EventBusModule,
      global: true,
      providers: [{ provide: EVENT_BUS, useFactory: () => new MemoryEventBus(options) }],
      exports: [EVENT_BUS],
    };
  }
}
```

**为什么必须删干净 plain import**：现在 6 处 import 静态 `EventBusModule`（§1-8 清单）。若宿主用
forRoot 而模块仍 plain import，Nest 会把「无注册的静态模块」与「有注册的动态模块」当两个模块实例，
**各自注册一个 EVENT_BUS provider**——模块内注入解析到就近的无注册 bus，`publishInTx` 全部 fail
fast 抛错（或更糟：test 装配下静默用错 bus）。因此：

1. **删** `files.module.ts:21` / `forms.module.ts:18` / `presence.module.ts:16` /
   `notification.module.ts:34` / `platform.module.ts:36` 的 EventBusModule import（@Global token
   由进程根提供）。静态无参用法**彻底移除**（类上不留无参 @Module providers，防呆）。
2. **gateway 宿主**：`gateway.module.ts` 改 `EventBusModule.forRoot({ registrations: [platform,
presence, forms, files 四条发布注册], allowCriticalPublish: process.env.PLATFORM_REPOSITORY_DRIVER
=== 'memory' })`。registrations 从各 contract import definitions 聚合（**宿主 app 层允许 import
   各模块 contract**，RFC §6.2；模块之间仍不得跨 contract import）。
3. **platform-api 宿主（D-4）**：新增 `apps/platform-api/src/app.module.ts`
   （imports: [PlatformModule, EventBusModule.forRoot({ registrations: [platform 一条], ... })]），
   `main.ts:6` 改 bootstrap `PlatformApiAppModule`。
4. **测试装配清点（必做）**：`grep -rn "Test.createTestingModule" --include=*.ts` 全仓，逐个确认
   imports 里的根模块——boot `GatewayModule` 的（gateway e2e 全家）经 2 已覆盖；boot
   `PlatformModule` 的（`platform-api.e2e-spec.ts` / `platform-api.postgres.e2e-spec.ts` 等）改 boot
   新 App 壳；若有直接装配 Files/Forms/Presence/NotificationModule 的测试，imports 补
   `EventBusModule.forRoot(...)`。漏一处 = 该测试 DI 解析失败，**编译/启动期即红，不会假绿**。

### 2.4 事件分级契约（四个 contract）

各 contract 事件文件加（常量对象保留、类型不破，RFC §5.2 定级表）：

```ts
// 例：modules/presence/contract/src/events.ts
import type { EventDefinition } from '@work/event-bus';
export const presenceEventDefinitions: EventDefinition[] = [
  { type: presenceEvents.statusChanged, module: 'presence', reliability: 'critical' },
];
```

- platform（`packages/platform-contract`）：`profile.updated` → critical，`module: 'platform'`
  （**不重命名**，module-contract §4 登记历史豁免——事件名不带 platform 前缀）。
- presence：`presence.status.changed` → critical。
- forms：`forms.definition.updated` / `forms.record.created` → critical（defensive 默认级）。
- files：`files.object.uploaded` → critical。
- notification 不发事件，**不加 definitions**（`notification.created` 常量不动，RFC §19）。
- contract 的 `package.json` 若缺 `@work/event-bus` workspace 依赖则补（type-only import 也要显式
  依赖，Nx 边界按声明走）。

### 2.5 四发布方接线（七发布点 = platform 1 + presence 2 + forms 3 + files 1，全部姿态 (b) + 同步工厂 D-2）

**通用形态**：postgres repository 写方法追加可选
`options?: { outboxEvent?: (row: <ReturnDto>) => DomainEventDraft }`；有 outboxEvent 时业务写与
`publishInTx` 同事务；无则行为与现状完全一致。repository 构造注入 `EVENT_BUS`（postgres 与
in-memory 都要）。**⚠️ providers 现状与注入纪律（T-m3）**：四个 in-memory repo（presence.module.ts:24 /
forms.module.ts:26 / files.module.ts:33 / platform.module.ts:50 的 PlatformMemoryStore）现在都是
**裸 class provider**（只有三个 postgres repo 是 useFactory）——本仓 esbuild 不产 decorator
metadata，给裸 class provider 加**无显式 `@Inject` 的构造参数**会被 Nest 静默注入 undefined，叠加
"bus 可选→跳过投递"设计 = forms/files 事件**无声消失**（二者无订阅者、无 e2e 兜底）。因此一律
二选一：改为 `useFactory` + `inject: [EVENT_BUS]`，或构造器显式 `@Optional() @Inject(EVENT_BUS)`；
**禁止裸类型构造参数**。in-memory repository 同签名，实现 = 调工厂后 `eventBus.publish(draft 转
publish 入参)`（§5.4 豁免语义；无 bus 实例的裸构造 fixture 跳过投递——bus 参数可选）。服务层
**删除全部七处 `eventBus.publish` 调用点**，事件构造挪进工厂闭包；payload 形状逐字段保持不变
（§0 门禁 3）。**四个 service 构造器随之移除 `EVENT_BUS` 注入**（发布职责整体下沉 repo，服务层
不再持有 bus；notification 订阅器不在此列、一行不动）——各 service spec 与
`apps/platform-api/src/audit/platform-write-audit.spec.ts:80/:198-201`（直接 `new EmployeeService(...,
makeEventBus())`，`:263-267` 的 `makeEventBus` 工厂）的构造调用随之更新/删参；`forms.service.spec.ts:888`
与 `files.service.spec.ts:313` 的无 cast `eventBus(): EventBus` 对象字面量工厂在 `EventBus` 加必选
`publishInTx` 后本就 typecheck 红，随服务层删参一并清理。

**1) platform `profile.updated`（employee.service.ts:96-138 + postgres-platform.repository.ts:621）**

- 发布条件 `saved.id !== currentUser.id && changedFields.length > 0` 中 `saved.id === next.id` 调用
  前已知 ⇒ **条件前移**：service 判定后才传 `outboxEvent`。draft：type `platformEvents.profileUpdated`、
  source `'platform.api'`、aggregateType `'platform.employee'`、aggregateId `saved.id`、payload
  原样四字段、traceId。
- postgres `updateEmployee(employee, enterpriseId, options?)`：有 outboxEvent 时升级为 client 事务
  （connect → BEGIN → UPDATE...RETURNING → 有行则 `publishInTx(client, factory(saved))` → COMMIT；
  无行 ROLLBACK 返回 undefined——**无行不发事件**；catch → ROLLBACK 后按现有错误语义上抛；finally
  release）。无 options 保持现单条路径。
- 吞错删除 + 审计次序反转按 §0「行为反转」执行；audit 调用位置**不动**（仍在 :103 位置的语句序），
  只是其相对事件的语义因事件前移进事务而反转——不重排代码顺序，只删 try/catch。
- spec：`employee.service.spec.ts:259-260`（publish 断言→改断 repo 收到 outboxEvent 且工厂产物
  形状正确）、`:323`（不发事件→改断 options 未含 outboxEvent）、`:333`（bus down 吞错→**删除**，
  替换为"repo 抛错则上抛、无成功审计"断言）。
- memory platform repository（grep `implements PlatformRepository` 找齐）同步签名。

**2) presence ×2（presence-status.service.ts:222/:285 + postgres-presence.repository.ts:129/:175）**

- `createRecord`：service 侧 statusType/label 已在作用域——工厂
  `(record) => draft`（type statusChanged、source `'presence.api'`、aggregateType
  `'presence.status_record'`、aggregateId `record.id`、payload 原样含 statusLabel、changeKind
  `'created'`）。postgres `createRecord(input, actor, options?: { formRecordId?, outboxEvent? })`：
  升级为 client 事务，**照抄 `:321-340` setDefaultStatusType 姿态**（BEGIN → INSERT...RETURNING →
  publishInTx → COMMIT；catch → ROLLBACK + `mapPresencePostgresError`）。
- `cancelRecord`：现发布点 `:285` 的 payload 里有**内联 `await findStatusTypeByKey(...)` 解析
  label**——工厂必须同步（D-2），故 service 在调 repo **之前**
  `listStatusTypes(enterpriseId, { includeArchived: true })` 建 `labelByKey` map（含 archived——
  被取消记录的状态可能已归档），工厂内 `labelByKey.get(cancelled.status) ?? cancelled.status`。
  postgres `cancelRecord(input, options?)` 同姿态事务化；UPDATE 无行（已取消/不存在）→ 不发事件、
  返回 undefined（现语义保持）。
- spec：`presence-status.service.spec.ts:110/:183/:329` 的 eventBus.publish 断言改为「repo 收到
  outboxEvent 工厂 + 以 fake row 调工厂断言 draft 形状」；`:183`（校验失败不发事件）改断 repo 未被
  调用（既有断言已如此，核对即可）。in-memory presence repo 同步；`presence.module.ts` providers：
  postgres repo 的既有 useFactory 补 inject EVENT_BUS，in-memory repo 从裸 class provider **改为
  useFactory**（通用形态注入纪律）。

**3) forms ×3（forms.service.ts:136/:199/:309，D-3 姿态）**

- `FormsRepository` 接口 + 双实现新增
  `publishDomainEvent(uow: UnitOfWork, draft: DomainEventDraft): Promise<void>`：postgres =
  `requireExecutor(uow)` → `eventBus.publishInTx(executor, draft)`；in-memory = `eventBus.publish`
  转投。
- `updateDefinition`：把 `:136-148` 的 post-UoW publish **挪进** `:105-119` 的 withUnitOfWork 回调内
  （`replaceDefinitionFields` 返回后、同 UoW）：`await this.repository.publishDomainEvent(uow,
draft(updated))`。draft：aggregateType `'forms.definition'`、aggregateId `updated.id`、payload
  原样（含 payload 内 occurredAt 字段——保持，别与列 occurred_at 混淆）。audit 仍在 UoW 后。
- `saveRecord`（`:388-438` 区域）：追加可选参数 `outboxEvent?: (record: FormRecordDto) =>
DomainEventDraft`，在其 UoW 回调内 `replaceRecordValues` 返回后调 `publishDomainEvent`。
  `createRecord`（:199 删）恒传工厂；`upsertRecordBySubject`（:309 删）**仅 `!existing` 时**传
  （条件调用前已知）。draft：aggregateType `'forms.record'`、aggregateId `record.id`。
- spec：`forms.service.spec.ts` 的事件 mock 变量名是 **`events`**（grep `events.publish`——断言现于
  `:257-258` 仅覆盖 recordCreated 一处，另有 `:215` mockClear）；改断
  `repository.publishDomainEvent`（mock repo 已有——加新方法 mock），并给 updateDefinition 与
  upsert-新建 两个发布点**补新断言**（现 spec 未覆盖）。
- `forms.module.ts` providers：postgres repo 既有 useFactory 补 inject EVENT_BUS；in-memory repo 从
  裸 class provider 改为 useFactory（通用形态注入纪律）。

**4) files（files.service.ts:101/:254-277 + postgres-files.repository.ts:93）**

- `createStagedFileObjectWithQuota(input, quota, options?: { outboxEvent? })`：outbox 写**并入既有
  client 事务**（配额检查/INSERT 之后、COMMIT 之前 `publishInTx(client, factory(object))`）。
- service：`uploadFile` 调用处传工厂（payload 原样六字段，`occurredAt: this.clock.now()...` 在工厂
  内取值——同步、无 IO）；`recordUploadSuccess` 删掉 publish、只留 audit（audit 在事务后，次序
  反转口径同 platform）。
- in-memory files repo 同步；`files.module.ts` providers：postgres repo 既有 useFactory 补 inject
  EVENT_BUS，in-memory repo 从裸 class provider 改为 useFactory（通用形态注入纪律）。

### 2.6 迁移（四份，全部幂等）

1. **platform（`db:migrate` 目录取下一序号，如 `000X_m12_outbox_upgrade.sql`）**：
   `ALTER TABLE platform.domain_events ADD COLUMN IF NOT EXISTS source varchar(64) NOT NULL;`（表
   确证零行——全仓无写入方；若担保失效 PG 会拒绝，改 `DEFAULT ''` 兜底并在 PR 说明）+
   `ADD COLUMN IF NOT EXISTS trace_id varchar(64);` + `DROP INDEX IF EXISTS
platform.domain_events_unpublished_idx;` + 重建为部分索引
   `(occurred_at) WHERE published_at IS NULL`（命名保持 `domain_events_unpublished_idx`）。
   platform drizzle schema **已建模** domain_events（`apps/platform-api/src/db/schema/platform.schema.ts:227-238`，
   其中 `:238` 把 `domain_events_unpublished_idx` 建模为**普通索引**）——同步补 `source`/`trace_id`
   两列，并把 unpublishedIdx 改为部分索引（`.where(sql\`published_at IS NULL\`)`）；否则迁移改完后
   drizzle 模型漂移，后续 `db:generate` 会吐伪 diff（schema spec 只断言表名，拦不住）。
2. **presence `0003_m12_outbox.sql`**（`0002` 已被 status 列宽 hotfix 占用）/ **forms、files 各取下一序号**：内容 =
   `createDomainEventsTableSql('<schema>')` 的输出**字面粘贴**（模板是结构权威；加一条 event-bus
   单测断言模板输出含九列与部分索引，防模板与迁移漂移后无人发现）。
3. 不动 `db:setup` 链顺序；`db:generate` 仅当 drizzle schema 被改时才有 diff。

### 2.7 文档件（本切片份额）

- **ADR-0007**：已定稿（见「状态」），原样入 PR。
- **`docs/foundation-blueprint.md` M12 节两处措辞修正**（ADR-0007 决策 6 精确口径；源串按原文逐字）：
  「聚合分区键」（`:502`）→「顺序尽力而为（分片预留）」；「在途**事件**丢失依 outbox 重发补齐」
  （`:508`，注意原文含"事件"二字）→「残余窗口显式接受 + 分层兜底」。只改这两处措辞，不重写章节。
- **`docs/module-contract.md` §4 增补（本切片份额）**：可靠性分级判据（RFC §5.1 原文）+ 既有事件
  定级表（§5.2）+ 「critical 必须 `publishInTx`、`publish()` 仅 notify-only 与测试」+ 命名规则沿用
  `<module>.<aggregate>.<verb>` 并登记 `profile.updated` 历史豁免 + payload 最小化纪律（§13：最小
  业务键，不携带敏感值/整实体）。**不写**消费三件套/无 schema 宿主/lock key（M12-2/3，留"由 M12-2
  增补"占位一句）。

## 3. 模块结构增量

### `packages/event-bus`

```
src/domain-event.ts        # +EventReliability/EventDefinition/DomainEventDraft/OutboxTx；EventBus +publishInTx
src/outbox-table.ts        # 新：createDomainEventsTableSql + 列名常量（schemaName 校验）
src/memory-event-bus.ts    # +options(registrations/allowCriticalPublish)、publishInTx、critical warn 守护
src/memory-event-bus.spec.ts  # 扩展（见 §4.2）
src/outbox-table.spec.ts   # 新：模板输出断言（九列 + 部分索引 + 幂等 IF NOT EXISTS）
src/index.ts               # 导出新面
```

### `packages/nest-common`

```
src/event-bus.module.ts    # 改 forRoot 动态模块（§2.3），静态无参用法移除
```

### 四个 contract

```
packages/platform-contract/src/(events 文件)      # +platformEventDefinitions
modules/presence/contract/src/events.ts           # +presenceEventDefinitions
modules/forms/contract/src/events.ts              # +formsEventDefinitions
modules/files/contract/src/events.ts              # +filesEventDefinitions
（各 package.json 缺 @work/event-bus 依赖则补）
```

### `apps/platform-api`

```
src/app.module.ts                                # 新：App 壳（D-4）
src/main.ts                                      # bootstrap 改 App 壳
src/platform.module.ts                           # 删 EventBusModule import
src/users/employee.service.ts                    # 吞错删除 + outboxEvent 条件前移 + 移除 EVENT_BUS 注入（§2.5-1/通用形态）
src/users/employee.service.spec.ts               # :259/:323/:333 重写（§2.5-1）
src/audit/platform-write-audit.spec.ts           # :80/:198-201 EmployeeService 构造调用删 bus 参、:263-267 makeEventBus 清理；审计断言语义保留
src/repositories/postgres-platform.repository.ts # updateEmployee 事务化 + publishInTx
src/repositories/(memory 实现)                    # 同步签名（grep implements PlatformRepository）
src/db/migrations/000X_m12_outbox_upgrade.sql    # 新（§2.6-1）
src/repositories/postgres-platform.repository.integration.spec.ts  # +outbox 断言（§4.2）
```

### `modules/presence/api`、`modules/forms/api`、`modules/files/api`

```
（各自）module.ts            # 删 EventBusModule import；postgres repo useFactory 补 inject EVENT_BUS；in-memory repo 裸 class→useFactory（通用形态注入纪律）
（各自）postgres repo        # 写方法 outboxEvent 事务化（presence 照 :321-340 姿态；files 并入既有 tx；forms +publishDomainEvent）
（各自）in-memory repo       # 同步签名，publish 转投（bus 可选）
（各自）service.ts           # 删 eventBus.publish 发布点 + 移除 EVENT_BUS 注入，工厂化（forms 三处/presence 两处/files 一处；连同 platform 共七处）
（各自）service.spec.ts      # 事件断言重写
（各自）db/migrations/…      # 新建 domain_events（§2.6-2）
（各自）postgres *.integration.spec.ts  # +outbox 断言（§4.2）——**扩展既有文件，不建新 PG spec 文件**
                              #（test:db 是显式枚举，扩展既有文件免踩枚举假绿坑）
```

### `apps/gateway-api`

```
src/gateway.module.ts        # EventBusModule.forRoot(四发布注册 + allowCriticalPublish 接线)
```

### `docs`

```
docs/adr/0007-event-transport-outbox-redis-streams.md   # 已定稿，原样入 PR
docs/foundation-blueprint.md                            # 两处措辞修正
docs/module-contract.md                                 # §4 增补（本切片份额）
（foundation-progress / doc-index / verification-log 见 §7）
```

## 4. 验证

### 4.1 命令（全过）

```bash
pnpm verify        # lint + typecheck + test + test:e2e + build —— 既有 e2e 全绿是本切片回归护栏
pnpm verify:full   # 必跑：回滚不落行/同事务断言只在 PG 门真跑（memory 提交前投递语义差异，§0）
```

PG 门确认：四个 integration spec 均为**扩展既有已枚举文件**，`test:db` 输出断言数须较基线
（platform/presence/forms/files 四文件）净增；确认非 skip。

### 4.2 断言（必须覆盖）

**`packages/event-bus` 单测**

- `createDomainEventsTableSql('presence')`：含九列、三索引（部分索引 `WHERE published_at IS NULL`）、
  全 `IF NOT EXISTS`；非法 schemaName（`'a; DROP'`）抛错。
- `MemoryEventBus.publishInTx`：fake tx（记录 SQL/params）——未注册 type 抛错；消费注册（无
  schemaName）抛错；命中发布注册 → INSERT 进 `<schema>.domain_events` + 同 tx `pg_notify('outbox_wake_
<module>')` + 返回 DomainEvent 的 id 与 RETURNING id 一致 + **subscribers 收到投递**（过渡态直投）。
- `publish` critical warn：注册 critical type + 未豁免 → `console.warn` 一次仍投递；
  `allowCriticalPublish: true` → 无 warn；未注册 type → 无 warn。

**PG 集成（四个既有 integration spec 各自扩展）**

- **同事务**：调用写方法（带 outboxEvent 工厂）成功 → 业务行与 `<schema>.domain_events` 行同时存在；
  行的 `event_name/aggregate_type/aggregate_id/source/trace_id/payload` 与工厂 draft 一致、
  `published_at IS NULL`。
- **回滚不落行**：制造业务写失败（presence：`endAt<=startAt` 撞 time-range CHECK 或重复约束；
  platform：不存在的 id → 无行路径不发事件 + 可注入 publishInTx 抛错场景验证 ROLLBACK；forms：
  revision 冲突/UoW 内抛错；files：配额超限）→ 断言 `domain_events` 零新增行。
- **无行不发**：platform updateEmployee 目标不存在 → 返回 undefined 且零事件行；presence
  cancelRecord 已取消 → 同。

**服务层单测（重写清单）**

- platform：`:259/:323/:333` 按 §2.5-1；吞错逻辑不存在（repo 抛错上抛）。
- presence：`:110/:329` 工厂产物断言（含 statusLabel/changeKind）；cancel 的 label 预取（含
  archived 类型的 label 仍解析）。
- forms：三发布点改断 `publishDomainEvent`（updateDefinition 在 UoW 内、upsert 仅 `!existing`）。
- files：上传成功工厂断言；失败路径不传工厂/不触发。

**e2e（零新文件——既有链路即回归护栏）**

- `pnpm test:e2e` 10 文件全绿：通知链路（presence.status.changed → 通知）在 memory 直投过渡态下
  行为不变；`presence-registration-forms` / `people-aggregation` / `notification` 全家不改断言。
- 任何 e2e 断言被迫修改 = 过渡态语义破坏，回头查实现（唯一例外：若某 e2e 直接断言了服务层
  `eventBus.publish` 调用形状——按 grep 实况处理并在 PR 列明）。

## 5. 退出标准

1. `publishInTx` + 表工厂 + `EventDefinition` 契约落地；`EventBus.publish/subscribe` 既有签名与
   全部事件名/payload 形状不变。
2. 四份迁移落地且幂等；`platform.domain_events` 部分索引重建；presence/forms/files 各一张新表；
   模板单测防漂移。
3. `EventBusModule.forRoot` 两档路由；六处 plain import 清零；gateway 与 platform-api 两宿主注册
   正确（D-4 App 壳）；全仓 `Test.createTestingModule` 清点无 DI 解析失败。
4. **七个发布点**（platform 1 + presence 2 + forms 3 + files 1）全部经 repository 同事务写入
   （(b) 姿态）；服务层零 `eventBus.publish` 残留 + 四个 service 已移除 EVENT_BUS 注入（grep
   自证，notification 订阅器与其 spec 除外——本切片不动）；两类行为反转（吞错删除、审计次序反转
   ×四发布方）按 §0 落地并写进 PR 描述。
5. PG 门真跑：同事务/回滚不落行/无行不发 三类断言四模块全覆盖；memory critical warn 断言在。
6. 过渡态语义自证：`pnpm test:e2e` 既有 10 文件零断言修改全绿（通知链路不变）。
7. in-memory repository 与 postgres repository 签名同步（含可选 bus），模块 providers 注入接线完成。
8. ADR-0007 原样入库；blueprint 两处措辞修正；module-contract §4 本切片份额增补（M12-2/3 份额留
   占位）。
9. `pnpm verify` 全绿；`verify:full` 全绿并在 PR 描述给出计数（test:db 断言净增数体现）。
10. security-reviewer 独立二审通过（§0 安全门禁 7 条逐条核，重点：platform repo 子树、审计次序
    反转口径、payload 最小化、schemaName 白名单、fail fast 不降级）。

## 6. 必须保持不变（避免越界）

- `notification-event.subscriber.ts` 及其 spec 一行不动（M12-2 迁移对象）。
- `EventBus.publish/subscribe` 签名、六个事件名、全部 payload 字段形状。
- 业务行为：七个发布点的**发布条件**（platform 他人改+有变更、forms upsert 仅新建、presence 校验
  链、files 成功路径）逐一保持。
- `apps/realtime-gateway` 不动（M12-3 拍板执行）；`db:setup` 链顺序不动。
- 无新 env（`EVENT_BUS_DRIVER` 归 M12-2）、无 Redis 面、无新 HTTP 端点、无权限/scope 变化。
- M9-3a 并行在途：本切片**不触** presence `getBoard`/`listEmployeesByScope` 相关**函数面**（getBoard
  逻辑一行不改；但文件级冲突客观存在——`presence-status.service.ts` 双方都改，且 M9-3a 改 `:51-57`
  构造器注入块、本切片删同一块里的 eventBus 注入，**必然文本冲突**。协议：**开工前先确认 M9-3a PR
  是否已合并**：已合并则基于其后 main；未合并则本切片照当前 main 做、由后合并方 rebase 解冲突，
  PR 描述声明该并行面）。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：§1 总览 vNext 行或新 M12 行（In Progress，M12-1 Done 要点）；新增/
  扩展 §6.x M12 切片表（M12-1 Done + M12-2..5 Pending 骨架，按 RFC §16）。
- `docs/doc-index.md`：§7 收录 ADR-0007 与本任务包。
- `docs/verification-log.md`：新增「M12-1 Outbox Write Side」小节（命令计数 + §4.2 矩阵 + 两类行为
  反转声明（吞错删除、审计次序×四发布方）+ 过渡态已知事实 + security-reviewer 结论）。
- `docs/module-contract.md` / `docs/foundation-blueprint.md` / ADR-0007：见 §2.7。

## 8. 提交规范

- 分支 `feat/m12-1-outbox-write-side`；Conventional Commits（如
  `feat(event-bus): add publishInTx contract, outbox table factory and reliability definitions`、
  `feat(platform,presence,forms,files): write outbox rows in the business transaction`、
  `docs(adr): land ADR-0007 event transport decision record`）。
- 零新 npm 依赖（lockfile 仅在 contract 补 workspace 依赖时有 importers 段 diff——PR 描述说明）。
- 不提交 node_modules/.env/构建产物；PR 描述含 §4.1 计数、§4.2 矩阵勾选、两类行为反转、过渡态
  已知事实、M9-3a 并行面声明。
