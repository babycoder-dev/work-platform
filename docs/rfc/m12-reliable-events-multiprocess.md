# RFC: M12 可靠事件与多进程基建

## 状态

Draft（待两轮独立评审 + 拍板）｜ 起草 2026-07-06 ｜ 依据 `docs/adr/0006-vnext-roadmap.md`、
设计推演 `docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md` §6，承接 M7 通知 + 调度、
M8 `profile.updated` 链路；是 M13 IM、M15 Agent、SSE 多副本与 gateway 拆分（vNext）的共同前置。

> 阅读约定沿用需求文档：每项能力标 **【本期做】/【预留】/【不做(vNext)】**。预留项必须留好
> 数据模型 / 接口 / 事件名并写清未来用途，不留无人知晓的空白字段。

> 本 RFC 含 **三个拍板项**（§15）：① `apps/realtime-gateway` 处置（建议退役）、② Redis 作为
> critical broker 的持久化语义（建议 AOF everysec + 域级对账兜底）、③ 日志聚合栈深度（建议
> 本期"更轻"档，Loki 推迟到 M13 前评估）。①② 为 ADR-0006 钦定的收口决策位。

> 配套 ADR：**ADR-0007 事件传输选型（事务性 outbox + Redis Streams）** 在本 RFC Accepted 后
> 与 M12-1 同批入库，内容 = §4 D1–D3 的决策记录化 **+ §15①② 两个收口拍板结果**（ADR-0006
> 钦定该子 ADR 含此两决策位），编号顺排 ADR-0006 之后。

> 一审（独立 sub-agent，2026-07-06）发现并已修订：**C1** advisory lock 是 session 级、按原文走
> 连接池互斥会静默失效（relay 锁改钉在 LISTEN 专线、调度改 `pg_try_advisory_xact_lock`，§7/§10）、
> **C2** 无 schema 幂等协议自相矛盾（重写为单一"检查→可重入执行→落键"协议，§8.6）、**C3**
> outbox 聚合列在契约上无来源（定义 `DomainEventDraft` + 发布方聚合对照表，§5.3）；及 **M1**
> stream 修剪是第二条丢失路径（§8.1/§15②）、**M2** 驱动切换的历史行全量重放（M12-2 cutover
> 水位）、**M3** 顺序承诺降级为尽力而为（§8.4）、**M4** 死信判定序列定死（§8.4/§8.5）、**M5**
> 消费注册与发布注册分档（§6.2/§8.2）、**M6** critical 误用 `publish()` 抛错守护（§6.2）、**M7**
> ADR-0007 范围补拍板结果、**M8** 对账兜底分层不偷换（§15②）。minor（葡语残留、审计次序表述、
> `notification.created` 现役事实、命名规则沿用既有 §4 等）一并落修。

> 二审（换视角独立 sub-agent：实施负责人 + 修订验证者，2026-07-06）发现并已修订两个"一审
> 修复引入/未触达"的 Critical：**C-A** 内存驱动 `publishInTx`"忽略 tx"与 M12-1 过渡态
> "outbox 记账"、M12-2 cutover 水位三处互斥——重定义为 **outbox 写与驱动无关、驱动只决定
> 投递面**（§6.2），并写透过渡态"未发布行堆积→水位收编"闭环（§16）；**C-B** `OutboxTx`
> 未定义 + "Drizzle 表工厂"与代码现实不符（运行时数据访问是裸 `pg`，drizzle 仅 platform
> schema 定义）——定形为 `OutboxTx = pg.PoolClient` 最小面 + 建表 SQL 模板进手写迁移
> （§5.3/§6.1，对 spec §6.1 的有意修正记录于 ADR-0007）。及 **M-A** publish() 守护断言按
> 驱动归位 M12-1/M12-2、**M-B** MAXLEN 统一 ~100000 + 告警阈值措辞精确化、**M-C** 顺序与
> 持久化两处对 spec/blueprint 的有意修正显式登记 + blueprint 进 §17 落点、**M-D** 升级序
> 钦定 stop-the-world（滚动切换有水位后重放竞态）、**M-E** 调度锁形态说准确（独立短连接
> 空转事务 + `idle_in_transaction_session_timeout` 禁设约束）。minor（e2e 双链路断言、
> M9 冲突面清单、退役全扫、连接预算、跨 app 双 relay 属设计内）一并落修。

## 1. 目标

把领域事件从**进程内尽力而为**升级为**跨进程 at-least-once**，发布/订阅契约（`@work/event-bus`
的 `EventBus` 接口与既有事件名）不破，同时收口三件长期预留：SSE 多副本 fan-out、调度基建
抽壳、realtime-gateway 处置。交付九件事：

1. **事务性 outbox，按 schema 分治**【本期做】：事件行与业务写同事务，`@work/event-bus`
   提供建表 SQL 模板；`platform.domain_events` 升级启用（改部分索引 + 从零接线发布方）。
2. **按模块实例化的中继（relay）**【本期做】：宿主进程内运行，PG NOTIFY 唤醒 + 轮询兜底，
   advisory lock 多副本互斥，把未发布行搬进 Redis Streams 后标记 `published_at`。
3. **事件可靠性两级**【本期做】：`critical`（outbox + at-least-once，默认级）/ `notify-only`
   （直发容忍丢失），在契约上声明，既有事件全部定级（§5.2）。
4. **Redis Streams 传输**【本期做】：`RedisStreamEventBus` + consumer group；`MemoryEventBus`
   降级为测试/单进程 fallback——与 repository 双实现模式同构。
5. **消费三件套**【本期做】：幂等（按 event id 去重，幂等行与业务写同事务）、重试
   （XAUTOCLAIM 重认领）、死信 stream + 带外告警；无自有 schema 消费宿主的存储约定
   （Redis 幂等键，M13 im-adapter 首用）。规范进 `docs/module-contract.md`。
6. **SSE 多副本 fan-out**【本期做】：通知信号经 Redis pub/sub 跨副本转发到各进程的连接
   注册表（notify-only 语义，客户端已有断线回退轮询兜底）。
7. **调度基建抽壳 `@work/scheduling`**【本期做】：把 notification 内的调度引导模式抽为共享
   包，补 per-tick advisory lock 多副本互斥；notification 先迁移自证。
8. **最小可观测性基线**【本期做】：带外告警通道（SMTP + 独立 webhook）、`/metrics`
   Prometheus 指标、compose `observability` profile。
9. **CI 矩阵与测试策略扩展**【本期做】：CI 加 Redis service 与多进程 e2e 形态；补齐
   doc-index §7 欠账的 `docs/testing-strategy.md`，统一 env-gate 防假绿规约。

验收总纲：**发布方进程 ≠ 消费方进程**的 e2e 跑通（既有两个订阅链路迁移后仍工作），且
"broker 重启 / 消费者崩溃 / 重复投递"三种故障注入下不丢 critical 事件、不重复业务写。

## 2. 非目标

- **不拆 gateway**：gateway-api 继续作为 API 组合宿主装配业务模块（ADR-0003；拆分属 vNext）。
  M12 只保证"拆开之后事件还能流"，不真的拆开。
- **不做 exactly-once**：目标是 at-least-once + 消费幂等；顺序尽力而为、不作契约承诺（§8.4）。
- **不引入 schema registry / 事件版本协商**：事件契约仍是 `packages/*-contract` 与
  `modules/*/contract` 里的 TS 类型 + 常量；payload 演进沿用"只加可选字段"的兼容纪律
  （写进 module-contract §4 增补）。
- **不动 IM / agent 消息通道**：agent bot 消息回调是直连专线、显式不走本 RFC 的 outbox/总线
  （spec §7.5 拍板），M13 另行交付。
- **不做 Kafka / 消息队列选型重议**：规模与 infra 清单已定 Redis Streams（ADR-0007 记录）。
- **不做通知偏好 / 通知渠道扩展**：本 RFC 只动传输层，notification 业务面不变。
- **不做日志聚合重栈**（Loki/ELK）【预留，拍板项③】：本期日志保持结构化 stdout + 容器日志
  轮转；聚合栈在 M13（OpenIM 全家桶落地、进程数量翻倍）前重评。

## 3. 现状盘点

| 现状 | 结论 |
| --- | --- |
| `@work/event-bus` 契约 | `DomainEvent{id,type,source,occurredAt,payload,traceId?}` + `EventBus{publish,subscribe}`（`domain-event.ts`）。`MemoryEventBus` 进程内 `Promise.all` 同步分发。**改点**：契约扩展 `publishInTx`；新增 Redis 驱动与 outbox 表工厂。 |
| 装配现实（承载性事实） | `apps/gateway-api/src/gateway.module.ts:12-18` 把 **Platform/Files/Forms/Notification/Presence 全部装进一个进程**，共享 `EventBusModule` 的单例 `MemoryEventBus`（`packages/nest-common/src/event-bus.module.ts`）——事件链路今天成立**只因这个装配巧合**。任何消费者搬出该进程（M13 im-adapter、SSE 多副本、gateway 拆分）事件即断流。 |
| 发布方（4 处服务、6 个事件） | `platform` `employee.service.ts:121`（`profile.updated`，**try/catch warn 吞发布失败**）；`presence-status.service.ts:174/237`（`presence.status.changed`）；`forms.service.ts:117/172/279`（`forms.definition.updated` / `forms.record.created`）；`files.service.ts:264`（`files.object.uploaded`）。`notification.created` 常量**未接入事件总线，但已是 SSE 信号的 wire 类型**（`notification-stream.events.ts:4` 映射 `created`，web 端按它匹配）。**共性**：事件发布均在业务写事务之外、发布失败与业务写不同生死。 |
| 订阅方（1 处、2 订阅） | `NotificationEventSubscriber`（`presence.status.changed` + `profile.updated`）。**无幂等、无重试**——handler 内 try/catch `logger.error` 吞掉即丢，无死信。是 M12 迁移验证对象。 |
| `platform.domain_events` | 已具 outbox 形状（`0000_init_platform.sql:182-194`）：`id/event_name/aggregate_type/aggregate_id/payload/occurred_at/published_at`。**但至今零写入方**，且 `domain_events_unpublished_idx` 是 `published_at` **普通索引非部分索引**（`:194`）。**改点**：加列（`source/trace_id`；可靠性分级住契约不落表）+ 改 `WHERE published_at IS NULL` 部分索引 + 从零接线发布方。零写入 ⇒ 迁移无数据风险。 |
| SSE | `NotificationStreamRegistry` 进程内连接表（注释已自述"multi-replica 需 Redis pub/sub，预留"）；`notification.service.ts:41` create 后 `emitToUser` 推信号；web 端已有断线回退轮询（M7-4b）。**改点**：信号发射抽 `SseSignalBus` 双驱动。 |
| 调度 | `modules/notification/api/src/scheduler/`：`ScheduleModule.forRoot()` + `SchedulerRegistry` 动态 CronJob + 只读 `notification.schedule_config` + `runSafely`；**多副本互斥在注释里【预留】**（`scheduler-bootstrap.service.ts:19`）。M13 对账 job、M19 定时触发器需要非 notification 宿主的调度 ⇒ 抽壳。 |
| `apps/realtime-gateway` | socket.io 骨架（ping / subscribe:user / publishUserEvent），**无任何生产消费方**；SSE 实际长在 gateway 进程内 notification 模块，IM 将走 OpenIM 自有 ws。⇒ 拍板项①。 |
| infra | compose 基线**已含 `redis:7`** 且已向部分服务注入 `REDIS_URL`（`infra/docker-compose.prod.yml:19-27,39,112`），但 **gateway-api（M12 所有 relay 的宿主）与 im-adapter 今日没有 `REDIS_URL`**（`:63-76`）；事件路径不经 Redis、无持久化配置。⇒ 拍板项② + §17 deployment 变更。 |
| CI | `verify` job 已有 postgres service、无 redis；PG 集成/e2e 测试 env-gate **静默跳过**教训在案（根 `CLAUDE.md`）。`docs/testing-strategy.md` 是 doc-index §7 登记的欠账。 |
| `apps/im-adapter-api` | 骨架已在（webhook/provider/controller），**无自有 schema**——M13 成为第一个跨进程消费者，本 RFC 的"无 schema 宿主幂等约定"（§8.6）为它定。 |

## 4. 关键决策

- **D1 传输选型 = 事务性 outbox + 按模块中继 + Redis Streams**（→ ADR-0007）。理由：
  ① at-least-once 的丢失面必须先在**发布侧**堵死（事件行与业务写同事务），broker 选型只解决
  传输与消费；② Redis 本在 infra 清单、运维面最小，Streams 的 consumer group 原生给
  ack/pending/重认领；③ 几百人规模不配 Kafka（运维成本 >> 收益）。`MemoryEventBus` 降级为
  测试/单进程 fallback，驱动切换走 env（`EVENT_BUS_DRIVER=memory|redis`），与
  `PLATFORM_REPOSITORY_DRIVER` 双实现模式同构。
- **D2 outbox 按 schema 分治，表工厂统一表结构**。模块只写自己 schema（AGENTS.md / 章程铁律），
  所以**没有中央 outbox 表**：每个发事件模块在自己 schema 建同构 `domain_events` 表，结构由
  `@work/event-bus` 的建表 SQL 模板 `createDomainEventsTableSql(schemaName)` 统一（列形状
  §6.1）。`platform.domain_events` 升级改造而非弃表（零写入方，改造 = 一次加列迁移）。
- **D3 契约扩展 = `publishInTx(tx, event)` + 发布路由注册表**。`critical` 事件**必须**经
  `publishInTx` 在业务事务内落 outbox 行；`publish()` 保留给 `notify-only` 与测试。路由：
  宿主装配时把"事件源模块 → outbox 表 / stream"注册进 bus（§6.2），`publishInTx` 收到未注册
  source 直接抛错（fail fast——critical 事件不允许静默降级为直发）。
- **D4 可靠性分级写在契约上**。`packages/*-contract` / `modules/*/contract` 的事件定义从
  裸常量升级为 `EventDefinition{type, module, reliability}`；判据与既有事件定级见 §5。
- **D5 中继按模块实例化、宿主内运行**。每个 relay 实例只触达本模块 outbox 表（不做跨
  schema 中央轮询，守 schema ownership）；PG `NOTIFY` 唤醒（`publishInTx` 同事务发
  `pg_notify`，提交才触发）+ 空闲轮询兜底；多副本互斥经**钉在 LISTEN 专用连接上的**
  `pg_try_advisory_lock`（session 级锁不得走连接池，§7）；先 XADD 后标记 `published_at`，
  崩溃窗口产生重复投递 ⇒ at-least-once，由消费幂等吸收（§7）。
- **D6 消费幂等 = 幂等行与业务写同事务**（有 schema 宿主），无 schema 宿主用 Redis
  `SET NX EX` 幂等键（弱一致，显式接受，§8.6）；重试用 XAUTOCLAIM 重认领（粗粒度退避），
  超限进死信 stream + 带外告警（§8.5）。
- **D7 SSE 信号 = notify-only，走 Redis pub/sub 不走 Streams**。信号丢失客户端有轮询兜底，
  用 pub/sub 免去 ack/清理负担；连接注册表不动，只把 `emitToUser` 的发射面抽成
  `SseSignalBus` 双驱动（§9）。
- **D8 调度抽壳保持"配置归宿主、机制归包"**。`@work/scheduling` 只抽机制（注册/运行包装/
  advisory lock 互斥/指标），`schedule_config` 表与其 repository 留在各宿主模块自己 schema
  （notification 不动表）；跨宿主复用的是机制不是配置存储（§10）。

## 5. 事件分级与契约扩展

### 5.1 分级判据（写进 module-contract §4 增补）

- **critical（默认级）**：事件驱动**任何下游业务动作**（写库、发通知、同步外部系统、触发
  流程）⇒ 必须 outbox + at-least-once。**拿不准就是 critical。**
- **notify-only**：纯 UI 信号，丢了用户下一次拉取即自愈（如 SSE 重拉提示）⇒ 允许直发。
  申报 notify-only 需在契约注释里写明"丢失后的自愈路径"。

### 5.2 既有事件定级（M12-1 落进各 contract）

| 事件 | 级别 | 理由 |
| --- | --- | --- |
| `presence.status.changed` | critical | 驱动通知创建（M7-2）；M13 起 im-adapter 消费 |
| `profile.updated` | critical | 驱动通知创建（M8-3）；M13 起驱动 OpenIM 资料同步 |
| `forms.definition.updated` | critical | 按默认级；当前无订阅者，defensive |
| `forms.record.created` | critical | 按默认级；M10 日报候选输入 |
| `files.object.uploaded` | critical | 按默认级；当前无订阅者 |
| `notification.created` | notify-only | 常量已是 SSE 信号 wire 类型（未接入总线）；若升格为领域事件，仅 notify-only（自愈=铃铛轮询） |
| SSE 重拉信号（非领域事件） | notify-only | 不进事件总线，走 §9 `SseSignalBus` |

### 5.3 契约形状

```ts
// @work/event-bus 新增
export type EventReliability = 'critical' | 'notify-only';
export interface EventDefinition {
  type: string;          // 'presence.status.changed'
  module: string;        // 'presence' —— 决定 outbox 表与 stream 归属
  reliability: EventReliability;
}
export interface DomainEventDraft<TPayload = unknown> {
  type: string;
  source: string;
  payload: TPayload;
  traceId?: string;
  aggregateType: string;  // outbox 聚合列的唯一来源（§6.1）
  aggregateId: string;    // 无聚合语义的事件按 <主体实体>/<主体 id> 填
}
// tx 句柄 = pg.PoolClient 的最小查询面，与既有 repository 事务姿态一致（§6.1）
export type OutboxTx = { query(sql: string, params?: unknown[]): Promise<unknown> };
export interface EventBus {
  publish(...): Promise<DomainEvent>;                    // 不变：notify-only + 测试
  publishInTx(tx: OutboxTx, event: DomainEventDraft): Promise<DomainEvent>; // 新增：critical 唯一入口
  subscribe(type, handler): () => void;                  // 不变
}
```

各 contract 导出 `xxxEventDefinitions: EventDefinition[]`（常量对象保留、类型不破）。
`event.type` **沿用 module-contract §4 既有命名规则** `<module>.<aggregate>.<verb>`；
`profile.updated` **不重命名**（重命名即破契约），在定义里显式 `module:'platform'` 并在
module-contract §4 登记为历史豁免。

既有发布方聚合取值对照（M12-1 接线依据）：

| 事件 | `aggregate_type` | `aggregate_id` |
| --- | --- | --- |
| `profile.updated` | `platform.employee` | `subjectUserId` |
| `presence.status.changed` | `presence.status_record` | `recordId` |
| `forms.definition.updated` | `forms.definition` | 定义 id |
| `forms.record.created` | `forms.record` | 记录 id |
| `files.object.uploaded` | `files.object` | 对象 id |

### 5.4 发布方语义变化（行为变化，显式列出）

- `employee.service.ts:120-137` 现在 **try/catch 吞发布失败**——迁移后 `publishInTx` 在业务
  事务内写 outbox 行，**写失败 = 事务失败**，吞错逻辑删除。事件与业务写同生死是 outbox 的
  本义，此为刻意的行为反转。
- presence/forms/files 的发布点当前在业务写**之后**、无共同事务。M12-1 逐发布方把"业务写 +
  outbox 写"纳入同一事务。实现姿态二选一，**推荐 (b)**：(a) 服务层开显式 tx 编排；
  (b) repository 写方法扩展可携带 `outboxEvents?: DomainEventDraft[]`（类型见 §5.3），在其
  内部事务一并写入——理由：当前事务边界封装在 repository 层，(b) 不重排服务层职责；内存
  repository 实现将 outboxEvents 直接转 `publish()`（单进程语义等价，测试 fixture 豁免 D3
  的"critical 唯一入口"约束）。逐发布方改造清单归 M12-1 切片包。
- **审计与事件的次序（行为变化之二）**：现状 `recordAuditLog`（`employee.service.ts:103`）
  在发事件**之前**且异常上抛——审计失败今天**会**阻断事件；迁移后 outbox 行随业务事务先
  提交，审计写在事务外、失败不再阻断事件。刻意为之：事件以业务事实（已提交）为准，审计
  失败走自己的告警面，不做跨事务耦合。

## 6. outbox 设计

### 6.1 表工厂 = 建表 SQL 模板（`@work/event-bus` 新增）

**对齐代码现实的定形（对 spec §6.1 "Drizzle 表工厂"表述的有意修正，记录于 ADR-0007）**：
本仓运行时数据访问是**裸 `pg`**（`db.provider.ts:12` 的 `Pool`、各模块 repository 的
`pool.query` + 手写 SQL 迁移），drizzle-orm 仅在 platform-api 做 schema 定义与迁移生成——
不存在可运行时消费 Drizzle 表对象的模块。故"表工厂"定形为 **SQL 模板 + 列名常量**：
`createDomainEventsTableSql(schemaName)` 产出建表 SQL 片段进各模块**手写迁移**，
`publishInTx` 内部用参数化 INSERT 写 `<schema>.domain_events`。若未来要把 drizzle 运行时化，
那是横切四模块的独立技术栈决策，另立 ADR，不由本 RFC 隐式带入。

表列形状（与 `platform.domain_events` 现形对齐 + 补列）：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK default gen_random_uuid() | 即 `DomainEvent.id`，消费幂等键 |
| `event_name` | varchar(128) NOT NULL | 即 `DomainEvent.type`（沿现名，不改列名） |
| `aggregate_type` / `aggregate_id` | varchar(128) NOT NULL | 顺序分区键（§8.4）；无聚合语义的事件按 `<主体实体>/<主体id>` 填 |
| `source` | varchar(64) NOT NULL | 新增，即 `DomainEvent.source` |
| `trace_id` | varchar(64) | 新增，链路贯穿 |
| `payload` | jsonb NOT NULL | 最小化纪律见 §13 |
| `occurred_at` | timestamptz NOT NULL default now() | |
| `published_at` | timestamptz | relay 标记 |

索引：`(aggregate_type, aggregate_id)`、`(event_name)`、**部分索引
`(occurred_at) WHERE published_at IS NULL`**（relay 扫描面 = 未发布行，普通 `published_at`
索引对该查询几乎无用——这是 `platform.domain_events` 现索引要改造的原因）。

**建表落点**：platform（升级现表：加 `source`/`trace_id` 列 + 重建部分索引，一次迁移，零数据
风险）、presence、forms、files 各自迁移入口各建一张。notification 本期只消费不发事件，
**不建 outbox**；启用 `notification.created` 时按 notify-only 直发，不需要表。

### 6.2 发布路由注册

`EventBusModule.forRoot({ registrations })`（nest-common）在宿主装配时注册，**分两档**：

```ts
// 发布注册（发事件模块，宿主进程有该模块 DB 面；schemaName 定位 <schema>.domain_events）
{ module: 'presence', schemaName: 'presence', definitions: presenceEventDefinitions }
// 消费注册（纯消费宿主，如 im-adapter——无 DB 也可注册，只供订阅路由解析 stream）
{ module: 'platform', definitions: platformEventDefinitions }
```

注册由**宿主（app 层）聚合**：app 允许 import 各模块 contract 取 definitions（模块代码之间
仍不得跨 contract import——现 notification 订阅 presence 事件靠自己契约里的重复常量正是此
边界的产物，§8.2）。

**`publishInTx` 的 outbox 写与驱动无关，驱动只决定投递面**：`publishInTx(tx, event)` 按
`event.source → module` 查发布注册，经 `tx` 句柄参数化 INSERT 写 `<schema>.domain_events`
行 + 同事务 `pg_notify('outbox_wake_<module>', '')`；未注册 source 抛错。投递面按驱动分：
memory 驱动写行后**额外立即进程内投递**（M12-1 过渡态"outbox 记账 + 内存投递并行"即此；
无 relay，行永远不标 `published_at`）；redis 驱动不直投，投递交给 relay。`publishInTx` 的
唯一预期调用方是各模块 **postgres repository**（在其事务内）——内存 repository fixture 走
`publish()`（§5.4 豁免），因此纯内存单测不触碰 outbox 面。

**critical 误用 `publish()` 的守护**：redis 驱动**直接抛错**——堵住"迁移遗漏一处 = 静默
回退尽力而为"（守护断言归 M12-2 退出标准，`RedisStreamEventBus` 彼时才存在）；memory
驱动缺省记 warn（断言归 M12-1），测试装配可用 `new MemoryEventBus({ allowCriticalPublish:
true })` 显式豁免（§5.4 的 fixture 豁免机制即此参数），避免单测日志噪音。

**"提交前投递"语义差异显式登记**：memory 驱动下 handler 在业务事务提交前运行（读库看
不到本次写入、事务回滚后产生幽灵副作用）；依赖"回滚则不投递"或投递时序的断言必须跑
postgres+redis 门（testing-strategy 收录，§12）。

## 7. 中继（relay）

- **实例化**：`OutboxRelay` 随 `EventBusModule.forRoot` 发布注册项在宿主进程内每模块一个
  实例；只在 `EVENT_BUS_DRIVER=redis` 时启动。**连接预算**：每 relay 一条 LISTEN 专线 ⇒
  gateway 宿主（platform/presence/forms/files 四发布模块）每副本 4 条专线 + 调度锁连接，
  量级无害但进 deployment 容量说明。**跨 app 双 relay 是设计内行为**：platform 模块同时
  装配在 gateway 与独立 platform-api 两个进程，两处都会起 platform relay，靠 advisory lock
  互斥——不是装配错误。
- **唤醒**：LISTEN `outbox_wake_<module>`；收到即触发一次 drain；另有空闲轮询兜底（缺省 2s，
  §14）——LISTEN 连接断连/错过通知时不停摆。
- **互斥（连接语义是命门）**：advisory lock 是 **session 级**——acquire/release 必须落在
  **同一条 PG 连接**上，**不得走连接池**（池下 unlock 被 checkout 到别的连接 = 静默失败 +
  锁泄漏在池连接上，互斥形同虚设）。relay 本就需要一条独占连接做 LISTEN（LISTEN 同样不能
  走池），**锁与 LISTEN 共用这条专线**：drain 周期开始在专线上
  `SELECT pg_try_advisory_lock(hashtext('outbox:<module>'))`，拿不到即跳过本周期（另一副本
  在干活）；周期结束在同一连接上 unlock；专线断开重连 = 锁自动释放，另一副本自然接管。
  锁 key 约定 `outbox:<module>` / `job:<jobKey>` 统一 `hashtext` 取 key，写进 module-contract
  增补（前缀约定防同名 key 复用；32 位哈希碰撞概率在本量级下接受，不作防碰撞声明）。
- **drain 流程**：`SELECT ... WHERE published_at IS NULL ORDER BY occurred_at, id LIMIT <batch>`
  → 逐条 XADD 到本模块 stream（§8.1）→ 成功批次 `UPDATE ... SET published_at = now()`。
  **先 XADD 后标记**：两步间崩溃 ⇒ 重启后重发 ⇒ 重复投递（at-least-once），消费幂等吸收。
  XADD 失败（Redis 不可达）：指数退避重试（§14），不标记、不丢行；积压由指标/告警暴露（§11）。
- **清理**：已发布行保留期后删除（缺省 14 天，§14），清理 job 挂 `@work/scheduling`（每宿主
  每模块一个 job，advisory lock 互斥）。domain_events 不是审计（`audit_logs` 另在），可清。

## 8. Redis Streams 传输与消费三件套

### 8.1 命名约定（写进 module-contract 增补）

| 对象 | 约定 | 示例 |
| --- | --- | --- |
| stream | `events:<module>`（每发布模块一条） | `events:presence` |
| consumer group | `cg:<消费模块>` | `cg:notification` |
| consumer name | `<hostname>:<pid>` | 副本间分工靠 group 语义 |
| 死信 stream | `events:dlq:<消费模块>` | `events:dlq:notification` |
| SSE 信号 channel | `sse:<模块>:signal`（pub/sub） | `sse:notification:signal` |

stream 设 `MAXLEN ~ 100000`（§14）仅作最终背压护栏——**修剪是一条真实丢失路径**（§15②
残余清单第 2 条）：消费积压触顶时最老未消费条目被删（这些事件 outbox 已标 `published_at`，
不会重发），且 Redis 7 的 XAUTOCLAIM 会**静默删除**指向已修剪消息的 pending 条目，连"卡在
pending 被发现"的机会都没有。护栏必须配监控：长度 **> MAXLEN × 10%** 即告警（§11），远在
丢失前人工介入；修剪后的恢复姿态（按 outbox 行 + 时间窗重发）进 runbook。

### 8.2 订阅路由

`RedisStreamEventBus.subscribe(type, handler)` 经注册的 `EventDefinition` 把 `type` 解析到
所属模块 stream；消费宿主维持 `XREADGROUP BLOCK` 循环（group 不存在则
`XGROUP CREATE ... $ MKSTREAM`；订多个源模块时优先单循环多 key——XREADGROUP 原生支持
多 stream，免得每 stream 独占一条 Redis 连接，连接预算归 M12-2 任务包）。未注册 type 抛错——路由**只认注册表不猜前缀**
（`profile.updated` 无模块前缀，靠 §6.2 消费注册档解析）。同一消费模块多副本共享 group ⇒
消息在副本间分工、不重复消费（pending 归属单 consumer）。

### 8.3 消费流程（三件套之幂等 + ack）

1. 读到消息 → 反序列化 `DomainEvent`。
2. **幂等检查 + 业务写 + 幂等落账在同一事务**（有 schema 宿主）：消费者事务内
   `INSERT INTO <schema>.consumed_events (consumer, event_id) ... ON CONFLICT DO NOTHING`，
   插入 0 行 ⇒ 已处理过 ⇒ 直接 XACK 跳过；插入成功 ⇒ 同事务执行业务写 ⇒ 提交 ⇒ XACK。
   表结构由表工厂 `createConsumedEventsTable(schemaName)` 统一：`(consumer varchar(64),
   event_id uuid, consumed_at timestamptz, PK(consumer, event_id))`；清理机制同 §7，
   保留期见 §14（30d，注意与 outbox 的 14d 不同）。
   notification 消费者的业务写在 `notification.*`，幂等表建 `notification.consumed_events`
   ——**同 schema 同事务，消费侧获得"效果恰好一次"**。
3. handler 抛错 / 事务回滚 ⇒ **不 XACK** ⇒ 进 pending，走重试（§8.4）。

订阅 API 不变（`subscribe(type, handler)`），幂等/ack 由 bus 的消费管道统一包裹——handler
需要拿到事务句柄做业务写，消费管道给 handler 注入 `tx`（= `pg.PoolClient`，与 §5.3
`OutboxTx` 同形；notification 的 pool-based repository 需增可携 client 的方法变体，计入
§18 风险行）。Nest 侧封装为 `@work/nest-common` 的 `EventConsumer` 基类，M12-2 细化；
`NotificationEventSubscriber` 迁移时删除自吞 try/catch——**吞错即丢是现缺陷，迁移后失败
必须抛给管道进重试**。

### 8.4 重试与顺序

- **重试 = 重认领，序列定死**：每消费模块一个 reclaimer 定时（缺省 30s）执行——
  ① `XPENDING` 取 pending 消息的 `(id, idle, delivery-count)`；
  ② `delivery-count ≥ 上限`（缺省 5）者走死信支路（§8.5）；
  ③ 其余中 `idle > min-idle`（缺省 60s）者 `XAUTOCLAIM` 重投本副本。
  **先判死信再重认领**——XAUTOCLAIM 会自增 delivery counter 且返回不含 counter，反序会用
  虚高计数误判。**delivery count 语义 = 投递次数而非处理失败次数**（重认领后进程崩溃、
  handler 未跑也计一次）——上限按此理解，允许"提前死信"（宁可误进死信被人工看到，不可
  无限重试）。退避是粗粒度的（≈min-idle/次），刻意不做精细指数退避——事件消费不是实时
  路径，简单优先。
- **顺序 = 尽力而为，不作契约承诺**：单 stream 内 XADD 按 relay 批次序（`occurred_at, id`），
  但**提交序 ≠ occurred_at 序**（并发事务中后发生者可能先提交、先被 drain），重试路径亦
  乱序——消费者一律按乱序设计（幂等 + 以库内状态为准），module-contract 增补明文。现有
  两个订阅器无顺序依赖。聚合级严格有序需求（当前没有）出现时再做 `hash(aggregate_id) % N`
  stream 分片 + 发布侧串行化——`events:<module>:<slot>` 命名【预留】，本期不承诺不实现。
  **本条对 spec §6.2 / blueprint M12 "聚合分区键、同一聚合内有序"的原始表述构成有意修正**
  （提交序 ≠ occurred_at 序，该承诺本就不成立），记录于 ADR-0007，blueprint 同步改（§17）。

### 8.5 死信

死信支路（由 §8.4 序列步骤②触发）：`XRANGE` 取原消息全文 → XADD 到 `events:dlq:<消费模块>`
（附 `firstDeliveredAt/deliveryCount` 元数据）→ XACK 原流 → 触发带外告警（§11）；`XRANGE`
取不到（消息已被修剪，§8.1）⇒ 死信条目仅含元数据 + event id，告警升级（可按 outbox 行
重发恢复）。死信处理是**人工**流程：runbook 给出巡检、修复后 `XRANGE` + `XADD` 回源流
重放的操作步骤（M12-4 交付 `docs/runbooks/event-pipeline-ops.md`），并登记边界：**重放晚于
幂等保留期**（§14：表 30d / Redis 键 7d）时幂等行已清，会重复执行业务写——重放前先核对。
DLQ 深度进指标。

### 8.6 无自有 schema 消费宿主约定（M13 im-adapter 首用）

无 schema ⇒ 无法"幂等行与业务写同事务"，降级为 Redis 幂等键，**单一协议**：

1. `EXISTS consumed:<consumer>:<eventId>` 命中 ⇒ 直接 XACK 跳过；
2. 执行业务动作——**前提：动作必须可重入**（im-adapter 的 OpenIM 增删改是 upsert 语义，
   满足）；
3. 成功后 `SET consumed:<consumer>:<eventId> 1 EX 604800`（7 天）→ XACK。

失败语义：**可能重复执行、不丢失**——步骤 3 前崩溃、或双副本竞态（2/3 非原子）都表现为
业务动作重复执行，由可重入性吸收。**不可重入且无 schema 的消费者不得用本协议**，必须建
最小自有 schema 走 §8.3（此评审门槛写进 module-contract 增补）。

## 9. SSE 多副本 fan-out

- 抽象 `SseSignalBus{ emit(userId, event), onSignal(handler) }`，双驱动：memory（现行为，
  直连本地 registry）/ redis（`PUBLISH sse:notification:signal`，payload `{userId, event}`；
  每副本 SUBSCRIBE 并转发给本地 `NotificationStreamRegistry.emitToUser`）。
- `notification.service.ts:41` 的 `emitToUser` 改为经 `SseSignalBus.emit`；registry 本身不动。
- **notify-only 语义**：pub/sub 无持久化、副本重连窗口丢信号可接受——客户端 keepalive +
  断线回退轮询（M7-4b）自愈；这正是 §5.1 notify-only 的定义案例。
- 驱动跟随 `EVENT_BUS_DRIVER`（不单设开关，减少配置面；memory 驱动仅测试/单进程）。

## 10. 调度抽壳 `@work/scheduling`

- **搬机制**：`ScheduledJobDefinition`、`SchedulerRegistry` 动态 CronJob 注册、`runSafely`
  包装、启动时从配置读 cron/enabled 的引导流程——从 `modules/notification/api/src/scheduler/`
  上移（保留 git 历史，逻辑等价搬运 + 泛化）。
- **补互斥（事务级锁 + 独立锁连接，形态说准确）**：锁持有者 = **一条独立短连接上的空转
  事务**——tick 开始时该连接 `BEGIN` + `SELECT pg_try_advisory_xact_lock(hashtext('job:<jobKey>'))`，
  拿不到 = 另一副本在跑 ⇒ 本 tick 跳过；拿到则 **job 本体在池连接上正常跑**（job 的业务写
  走既有 pool-based repository，本就不在锁连接上），完成后锁连接 COMMIT 释放。事务级锁随
  提交/回滚自动释放、天然钉在自己的连接上，免疫 §7 所述 session 锁走池的失效问题。**两个
  必须点名的坑**：① 持锁事务在 job 运行期间是 idle-in-transaction——部署基线**不得**对该库
  设 `idle_in_transaction_session_timeout`（或调度锁连接单独 `SET ... = 0`），否则锁被中途
  杀掉、互斥静默失效（写进 deployment/runbook）；② 长开事务压 vacuum xmin 视界，分钟级
  job 可接受，小时级 job 出现时再议。实现细节归 M12-3 任务包。
- **配置归宿主**：包定义 `ScheduleConfigPort`（读 cron/enabled/params）；notification 的
  `schedule_config` 表与双 repository 原地不动、实现该 port。新宿主（M13 对账 job）自带
  自己 schema 的配置表或静态配置实现同一 port。
- **`ScheduleModule.forRoot()` 归属**：仍由首个宿主装配一次的约束保持（gateway 进程内单次
  forRoot），`@work/scheduling` 提供 `SchedulingModule.forFeature(jobs)`；多进程各自 forRoot
  互不相干（互斥靠 advisory lock 不靠进程内单例）。
- **notification 先迁移自证**：heartbeat + 两个日报提醒预留 job 换新包驱动，行为与
  `schedule_config` 数据面零变化——验收 = 既有 scheduler 测试全绿 + 双副本互斥 e2e。
- outbox 清理、幂等表清理两个新 job（§7/§8.3）挂此包，作为"非 notification 宿主 job"的
  第一批实例。

## 11. 最小可观测性基线

### 11.1 带外告警通道（拍板执行：SMTP + 独立 webhook 双通道）

- 死信/管道故障告警**不走站内通知、不走 IM**（管道自身故障时告警一起死——spec §6.7 判据）；
  OpenIM admin API 直发候选依赖 M13 且与 IM 同命，**本期不采用**。
- 新包 `@work/alerting`：`AlertChannel{ send(alert) }`，实现 SMTP（内网邮件服务器，env 配置）
  与 generic webhook（任意内网 HTTP 端点，如值班机器人）；两者都配则双发；都未配则降级
  `logger.error` 并在启动时 warn（部署检查清单收录"生产必须至少配一个"）。
- 触发点（M12-4 接线）：DLQ 新增死信、outbox 最老未发布行龄超阈值（缺省 5 分钟）、relay
  连续 XADD 失败超阈值、stream 长度 > MAXLEN × 10%（§8.1 修剪丢失的前哨）、最老 pending
  龄超阈值、调度 job 连续失败超阈值。告警去重（同 key 冷却 15 分钟）。

### 11.2 指标（Prometheus）

各 Nest 进程暴露 `GET /metrics`（prom-client）；**不经 gateway 路由、不鉴权，仅 compose 内网
scrape**（端口不对外发布，部署基线写明）。最小指标集：

| 指标 | 说明 |
| --- | --- |
| `outbox_unpublished_rows{module}` / `outbox_oldest_unpublished_age_seconds{module}` | relay 健康核心信号 |
| `relay_publish_total{module,result}` | XADD 成败计数 |
| `event_consume_total{consumer,type,result}` / `event_retry_total{consumer}` | 消费面 |
| `event_dlq_depth{consumer}` | 死信深度 |
| `event_stream_length{module}` / `event_oldest_pending_age_seconds{consumer}` | 修剪丢失前哨（§8.1） |
| `sse_connections` | registry 新增全量计数方法暴露（现仅有按用户的 `getConnectionCount`） |
| `scheduled_job_runs_total{job,result}` / `scheduled_job_lock_skips_total{job}` | 调度面 |

### 11.3 部署基线（compose `observability` profile）

Prometheus + Grafana（预置一块"事件管道"看板：未发布积压、DLQ、消费速率、告警状态）加入
`infra/docker-compose.prod.yml` 的可选 profile；`docs/deployment.md` 增部署/升级/数据卷说明。
日志维持结构化 stdout + docker 日志轮转配置（"更轻"档，拍板项③）；Loki 评估登记 M13 前置。

## 12. 测试策略与 CI 矩阵

- **CI**：`verify` job 加 `redis:7` service；新增两个门（沿 PG gate 形态）：
  `RUN_REDIS_INTEGRATION=true` + `REDIS_URL`（Redis 集成：bus/relay/消费管道/SSE fanout）、
  `RUN_MULTIPROCESS_E2E=true` + `DATABASE_URL` + `REDIS_URL`（多进程 e2e）。CI 全开。
- **多进程 e2e 形态**：一个 vitest e2e 文件内启动**两个独立 Nest 应用上下文**（发布侧装配
  platform+presence、消费侧装配 notification），各自独立 DI 容器 + `EVENT_BUS_DRIVER=redis`
  + 真 PG/Redis——内存总线无从泄漏，等价于跨进程。断言：① **两条既有链路都过**（blueprint
  M12 退出标准点名）：档案更新（`profile.updated`）与在位登记（`presence.status.changed`）
  各 → 发布侧 outbox 行 → 消费侧 notification 落库；② 人为重复投递同一消息 ⇒ 不产生第二条通知（幂等）；③ 杀掉
  消费处理（handler 抛错）⇒ 重认领后成功 ⇒ 恰好一条；④ 超限 ⇒ 进 DLQ + 告警 channel 收到。
- **防假绿规约（`docs/testing-strategy.md` 核心条款，还 doc-index §7 欠账）**：
  1. gate 未设 ⇒ skip（本地默认快路径）；**gate 已设而依赖不可达 ⇒ 测试失败，禁止 skip**
     ——静默跳过是 PG gate 的既有事故模式，Redis/OpenIM(M13)/k8s(M15) 三类新 gate 统一
     此规约，PG gate 一并回改核查。
  2. 每类 gate 在 testing-strategy 登记：env 变量、覆盖的测试文件模式、CI 哪个 step 真跑。
  3. 三 Vitest 配置按后缀收集的既有 gotcha 收录成文（根 CLAUDE.md 现状成文化）。
  4. 登记后续义务条款：**M13/M15 RFC 须各自登记其外部依赖（OpenIM / k8s）的测试替身与
     容器化策略**（spec §6.8 钦定，防止两个 RFC 抢跑漏项）。
- `pnpm verify:full` 扩为同时拉起 Redis 的说明（docker run 一行命令进 runbook）。
- **内存驱动语义差异**（§6.2）收录：回滚不投递、投递时序等断言必须在 PG+Redis 门内测。

## 13. 安全与合规

- **schema 边界不破**：outbox/幂等表都建在各模块自己 schema，无跨 schema 读写；relay 每
  实例只碰本模块表。security-baseline §8 无需修订。
- **payload 最小化纪律**：事件带 id + 最小字段（现况已如此，如 `changedFields` 只有字段名
  无值）；outbox 行含 payload ⇒ 与审计同等的 PII 纪律——禁止把档案值、表单值整段塞
  payload（module-contract §4 增补明文）；保留期清理（§7）即数据最小化。
- **Redis 面**：requirepass 必配（env 注入，compose 基线补）、仅内网段暴露、不承载凭据类
  数据；`/metrics` 不含 payload 内容仅计数。
- 不触碰 auth/scope/audit 代码面；若切片实施中发现必须动（如 EventConsumer 要复用平台身份），
  按 platform-api 本地规则走 security-reviewer 二审。

## 14. 参数表（缺省值，env 可覆写）

| 参数 | 缺省 | env |
| --- | --- | --- |
| 总线驱动 | `memory` | `EVENT_BUS_DRIVER=memory\|redis`（生产 compose 设 redis） |
| relay 空闲轮询间隔 | 2s | `OUTBOX_POLL_INTERVAL_MS` |
| relay 批量 | 100 | `OUTBOX_BATCH_SIZE` |
| relay XADD 失败退避 | 1s 起指数 ×2，上限 30s | `OUTBOX_PUBLISH_BACKOFF_*` |
| outbox 已发布保留期 | 14d | `OUTBOX_RETENTION_DAYS` |
| 幂等表/键保留期 | 30d / 7d(Redis) | `CONSUMED_EVENTS_RETENTION_DAYS` |
| reclaimer 周期 / min-idle | 30s / 60s | `EVENT_RECLAIM_*` |
| 最大投递次数（超限死信） | 5 | `EVENT_MAX_DELIVERIES` |
| stream MAXLEN | ~100000 | `EVENT_STREAM_MAXLEN` |
| 告警冷却 | 15min | `ALERT_COOLDOWN_MINUTES` |
| 积压告警阈值（最老未发布行龄） | 5min | `OUTBOX_BACKLOG_ALERT_SECONDS` |

## 15. 收口决策位（拍板项）

### ① `apps/realtime-gateway` 处置 —— **建议：退役（删除）**

| 选项 | 评估 |
| --- | --- |
| **退役（建议）** | 骨架无生产消费方；SSE 长在 gateway 进程 notification 模块且 fan-out 由 §9 Redis pub/sub 解决，不需要独立 ws 宿主；IM 走 OpenIM 自有 ws（spec §7）；M15 agent 状态推送可复用 SSE 通道。删 app + `dev:realtime` script + compose 服务 + **仓库级引用全扫**（含根 CLAUDE.md 命令清单、AGENTS.md、architecture/deployment）。**成本最低、无功能损失。** |
| 收编为 SSE fan-out 宿主 | 把 SSE 从 gateway 搬出去 ⇒ 引入新跨进程链路与部署面，只为一个"未来可能的"推送宿主；SSE 多副本已由 §9 解决。过度设计。 |
| 并入 gateway | socket.io 骨架无消费方，并入=搬运死代码。无意义。 |

复活成本：若 vNext 真需要独立推送网关，按彼时需求新建比维护空壳便宜（git 历史在）。

### ② Redis 持久化语义 —— **建议：AOF everysec + RDB，残余窗口显式接受 + 域级对账兜底**

- 配置：`appendonly yes` + `appendfsync everysec` + 默认 RDB 快照；compose 基线落数据卷。
- **残余丢失路径清单（诚实版）**——outbox 兜底覆盖"relay 标记前"的一切丢失；标记
  `published_at` 之后、消费者 XACK 之前，事件唯一副本在 Redis，此区间有两条路径：
  1. **Redis 崩溃**：everysec 下最多丢约 1s 内的在途事件；
  2. **stream 修剪**（§8.1）：消费积压触顶护栏时最老未消费/pending 条目被静默删除——
     不需要 Redis 崩溃，且有前哨告警（长度超护栏 10%）在丢失前给人工介入窗口。
- **兜底分层（不偷换）**：通知类链路（现有两条：presence/profile → 通知创建）**没有对账、
  丢失即接受**——通知本质是可自愈的弱语义，用户下次打开通知中心即得全量；同步类链路
  （M13 用户/部门 → OpenIM、M16 起同类）**必须自带夜间对账**修漂移。不得把"未来同步链路
  的对账"当成"现有通知链路"的兜底。
- **显式接受两条残余路径**，理由：① 规模小、窗口内在途事件预期个位数，且路径 2 有前哨
  告警；② 消除窗口的代价（`fsync=always` 的吞吐损失，或消费者确认才标记 outbox 的架构
  复杂化）不成比例；③ 零容忍链路当前不存在，出现时再议（§18）。**本条对 blueprint M12
  "在途事件丢失依 outbox 重发补齐"的原始表述构成有意修正**（标记后窗口补不齐，只能显式
  接受 + 分层兜底），记录于 ADR-0007，blueprint 同步改（§17）。
- 重启恢复：AOF 重放 ⇒ pending 消息仍在 group ⇒ reclaimer 接手，无需人工。
- **备份矩阵定位（deployment §6 扩列）**：Redis **不是事实源**（事实源=PG outbox 与业务表），
  不做异地备份；数据卷随机器快照即可，灾难恢复 = 接受 stream 内容丢失 + 域级对账修复。
- 监控：`redis_up`、AOF 状态进 Prometheus 抓取（redis-exporter 进 observability profile）。

### ③ 日志聚合栈 —— **建议：本期"更轻"档（结构化 stdout + docker 轮转），Loki 推迟 M13 前评估**

单机 compose、进程数 <10，`docker logs` + 结构化 JSON 已可支撑排障；Loki/promtail 在 OpenIM
全家桶（+8 容器）落地前评估更有依据。若拍板本期就上，并入 M12-4 observability profile。

## 16. 切片计划（4~5 切片 + 交付验证）

| 切片 | 内容 | 退出标准 |
| --- | --- | --- |
| M12-1 outbox 写入侧 | SQL 模板表工厂 + `publishInTx`（写行与驱动无关，§6.2）+ 两档路由注册 + 事件分级契约（含聚合对照表接线）+ platform 表改造迁移 + presence/forms/files 建表迁移 + 四发布方接线（含 §5.4 两处行为反转）；投递仍内存直投（过渡态 = outbox 记账 + 内存投递并行）。**过渡态已知事实**：无 relay ⇒ 未发布行按事件量线性堆积（本系统事件频率下量级无害；清理 job 只删已发布行、管不到它们），堆积由 M12-2 cutover 水位一次性收编——是设计内行为不是 bug | 单元 + PG 集成：回滚不落 outbox 行；四发布方业务写与事件行同事务；memory 驱动对 critical 误用 `publish()` 记 warn 的断言 |
| M12-2 传输与消费 | `RedisStreamEventBus` + relay + 消费三件套 + 幂等表 + 两个既有订阅器迁移（删自吞 try/catch）+ 无 schema 宿主约定成文 + **cutover 迁移**（把切换时点前的既存 outbox 行 `SET published_at = now()` 设水位——M12-1 过渡态已内存投递过的历史行不得在开启 redis 驱动时全量重放成重复通知）。**升级序钦定 stop-the-world**：停旧进程 → 跑 cutover 迁移打水位 → 注入 `EVENT_BUS_DRIVER=redis`/`REDIS_URL` + Redis AOF 配置 → 起新进程（旧副本运行中打水位会留"水位后被内存投递、重启后又被 relay 重放"的竞态窗口且幂等表拦不住——单机内网 compose 停机几分钟可接受，不做滚动）；序写进升级 runbook（§17） | 多进程 e2e 四断言（§12）全绿；cutover 后无历史事件重放；redis 驱动对 critical 误用 `publish()` 抛错的守护断言 |
| M12-3 收口三件 | SSE `SseSignalBus` 双驱动 + realtime-gateway 处置执行（按拍板）+ `@work/scheduling` 抽壳 + notification 调度迁移 + outbox/幂等清理 job | SSE 双副本 fanout e2e；调度双副本互斥 e2e；scheduler 既有测试全绿 |
| M12-4 可观测性 | `@work/alerting` + 告警触发点 + `/metrics` + compose observability profile + redis 持久化配置（按拍板）+ `docs/runbooks/event-pipeline-ops.md`（死信重放、积压排障、Redis 恢复） | 故障注入演练：杀 Redis / 塞死信，告警在带外通道收到 |
| M12-5 CI 与交付验证 | CI 矩阵扩展 + `docs/testing-strategy.md` + PG gate 防假绿回改 + 文档落点收口（§17）+ 全量门禁 | `pnpm verify` + PG/Redis/多进程门 CI 真跑绿（防假绿自证：故意断依赖须红） |

依赖序：M12-1 → M12-2 → {M12-3, M12-4} 可并行 → M12-5。每切片独立任务包 + 独立评审，
按 development-workflow 门禁交付。

## 17. 文档落点

| 文档 | 变更 |
| --- | --- |
| `docs/adr/0007-*.md`（新） | 事件传输选型决策记录（D1–D3 + §15①② 两个收口拍板结果——ADR-0006 钦定子 ADR 含此两决策位），随 M12-1 入库 |
| `docs/module-contract.md` | §4 增补：沿用既有 `<module>.<aggregate>.<verb>` 命名规则并登记 `profile.updated` 历史豁免、可靠性分级判据、乱序消费明文、payload 最小化、消费三件套规范、无 schema 宿主约定（§8.6 单一协议）、advisory lock key 约定 |
| `docs/architecture.md` | 事件与数据流章：outbox/relay/Streams 拓扑、SSE fanout、realtime-gateway 处置结果 |
| `docs/deployment.md` | Redis 持久化与 requirepass、**给 gateway-api / im-adapter 注入 `REDIS_URL`**（现 compose 未注入，`docker-compose.prod.yml:63-76`）、observability profile、§6 备份矩阵扩列（Redis 定位）、环境变量表（§14） |
| `docs/testing-strategy.md`（新） | §12 全部内容；doc-index §7 欠账销账 |
| `docs/runbooks/event-pipeline-ops.md`（新） | 死信重放、积压排障、Redis 故障恢复、**M12-2 上线切换序**（stop-the-world 升级步骤，§16）、调度锁的 `idle_in_transaction_session_timeout` 约束（§10） |
| `docs/foundation-blueprint.md` | M12 节两处措辞随 ADR-0007 同批修正：**"聚合分区键"→"顺序尽力而为（分片预留）"**（§8.4）、**"在途丢失依 outbox 重发补齐"→"残余窗口显式接受 + 分层兜底"**（§15②）——按 doc-index 优先级 blueprint > RFC，不同批改会留高低文档打架 |
| `docs/doc-index.md` / `docs/foundation-progress.md` | 收录新文档；M12 进度行 |

## 18. 风险

| 风险 | 缓解 |
| --- | --- |
| 发布方事务改造（§5.4）触碰四个模块的 repository 层，回归面大 | M12-1 单切片集中做 + 既有测试全绿门禁；内存 repository 等价语义保证单元测试不改断言 |
| 消费管道（EventConsumer 注入 tx）设计过重，订阅方接入成本高 | M12-2 任务包先以 notification 迁移打样，API 不顺手就地修正后再成文进 module-contract |
| Redis 单点：broker 挂 ⇒ 事件停摆 | outbox 兜底不丢；告警 + runbook 恢复；单机部署本就单点（PG 同理），不为此上哨兵 |
| at-least-once 的两条残余丢失路径（Redis 崩溃 ≤1s + stream 修剪，§15②） | 显式接受 + 分层兜底（通知类丢失即接受、同步类域级对账）+ 修剪前哨告警；如未来出现零容忍链路，彼时再议消费者确认式 outbox |
| 重试乱序破坏隐含顺序假设 | §8.4 契约明文 + 消费者幂等以库内状态为准；现有两个订阅器无顺序依赖（通知创建互相独立） |
| 观测栈加重单机资源 | Prometheus+Grafana 约 +500MB 级，进容量规划；profile 可选、内网关闭不影响业务面 |
| 与 M9 并行推进的合并冲突 | M12-1 排在 M9-2 合并后开工；冲突面 = presence 发布点 ×2 + forms 发布点 ×3（M9-2 泛化重排 `forms.service.ts`，§3 所引行号必漂移）+ `notification-event.subscriber.ts`（M9-1 已改写、M12-2 要整体迁移）——开工前按 M9-2 合并后版本重核 §3 行号 |

## 19. Open questions / follow-ups

- `EventConsumer` 给 handler 注入 tx 的具体 API 形状（装饰器 vs 基类 vs 回调参数）归 M12-2
  任务包，RFC 不锁死。
- forms/files 事件当前无订阅者，critical 定级带来 outbox 写放大（每次表单提交多一行）——
  可忽略量级，但若 M17 数据引擎高频写入场景出现，届时评估按事件类型旁路。
- `notification.created` 是否**升格为领域事件**（其常量今日已是 SSE 信号的 wire 类型，
  §3）：本期不动，避免把 notify-only 信号混进领域事件语义；M13 通知 IM 投递落地时重看。
- 多进程 e2e 用"双应用上下文"近似真进程：若发现 Nest 全局单例（如 ScheduleModule）跨上下文
  串扰，升级为 child_process 真隔离（M12-5 任务包备选路径）。
