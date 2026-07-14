# ADR 0007: 事件传输选型——事务性 outbox + 按模块中继 + Redis Streams

## 状态

Accepted（2026-07-10）

本 ADR 是 ADR-0006《vNext 技术路线图》钦定的 M12 子 ADR。决策内容已在
`docs/rfc/m12-reliable-events-multiprocess.md`（Accepted，两轮独立评审 + 三项拍板）
中定稿，本 ADR 为**决策记录**（为什么选这条路），随 M12-1 切片同批入库；具体怎么做以 RFC 为准。
本 ADR 同时登记两个收口决策位的拍板结果（§15①②）与三处对上游文档的**有意修正**（见「决策 6」），
依 doc-index 优先级（ADR > blueprint > RFC）作为最终口径。

## 背景

领域事件链路今天成立**只因一个装配巧合**：gateway-api 把 Platform / Files / Forms / Notification /
Presence 全部装进同一进程，共享 `@work/nest-common` 提供的单例 `MemoryEventBus`。任何消费者搬出
该进程——M13 im-adapter 成为第一个跨进程消费者、SSE 多副本、未来 gateway 拆分——事件即断流。

同时发布侧存在结构性丢失面：全部发布点都在业务写事务**之外**，发布失败与业务写不同生死
（platform 侧甚至 try/catch 吞掉发布失败）。`platform.domain_events` 表自 M1 起就具 outbox 形状，
但至今零写入方。

约束现实：企业内网单机 docker compose 部署、几百人规模、无公网依赖；Redis 7 已在 infra 基线清单；
运行时数据访问是裸 `pg`（drizzle 仅作 platform schema 定义与迁移生成）；模块只写自己 schema 是
章程铁律。

## 决策

### 1. 传输选型 = 事务性 outbox + 按模块中继（relay）+ Redis Streams

- **丢失面先在发布侧堵死**：critical 事件行与业务写**同事务**落进发布方模块自己 schema 的
  `domain_events` 表（outbox），broker 只解决传输与消费。
- **中继按模块实例化、宿主进程内运行**：PG NOTIFY 唤醒 + 空闲轮询兜底，advisory lock（钉在
  LISTEN 专线上的 session 级锁）做多副本互斥；先 XADD 后标记 `published_at`，崩溃窗口产生重复
  投递 ⇒ **at-least-once**，由消费幂等吸收。
- **Redis Streams 为跨进程传输**：consumer group 原生提供 ack / pending / XAUTOCLAIM 重认领；
  Redis 本在 infra 清单，运维面最小。
- **Kafka 落选**：几百人规模下运维成本远大于收益（ZK/KRaft 运维、分区管理、镜像体积），
  Streams 能力面足够；不做消息队列选型重议。
- **`MemoryEventBus` 降级为测试 / 单进程 fallback**：驱动切换走 env
  （`EVENT_BUS_DRIVER=memory|redis`），与 `PLATFORM_REPOSITORY_DRIVER` 双实现模式同构；
  发布/订阅契约（`EventBus` 接口与既有事件名）不破。

### 2. outbox 按 schema 分治，表工厂统一表结构

模块只写自己 schema（AGENTS/章程），故**没有中央 outbox 表**：每个发事件模块在自己 schema 建
同构 `domain_events` 表，结构由 `@work/event-bus` 的建表 SQL 模板
`createDomainEventsTableSql(schemaName)` 统一。`platform.domain_events` **升级改造而非弃表**
（零写入方 ⇒ 一次加列 + 部分索引重建迁移，零数据风险）。

### 3. 契约扩展 = `publishInTx` + 宿主注册路由 + 两级可靠性

- `publishInTx(tx, event)` 是 **critical 事件唯一发布入口**（事件行经调用方事务句柄写入）；
  `publish()` 保留给 notify-only 与测试。
- 发布路由由**宿主（app 层）装配时注册**（`EventBusModule.forRoot`），未注册**事件**直接抛错
  （fail fast——critical 事件不允许静默降级为直发；实现按事件 `type` 键控注册，见 M12-1 任务包
  决策 D-1）。宿主允许 import 各模块 contract 聚合注册；模块之间仍不得跨 contract import。
- 事件可靠性两级 `critical`（默认）/ `notify-only` 写在契约上（`EventDefinition`），分级判据与
  既有事件定级归 `docs/module-contract.md` §4 增补与 RFC §5。

### 4. 收口拍板①：`apps/realtime-gateway` 退役（删除）

socket.io 骨架无任何生产消费方；SSE 实际长在 gateway 进程内 notification 模块（M12 抽
`SseSignalBus` 双驱动，走 Redis pub/sub）；IM 将走 OpenIM 自有 ws 通道（ADR-0001/0008）。
保留一个无人消费的实时网关只会误导后续接线。**执行归 M12-3**（删 app + compose/文档同步）。

### 5. 收口拍板②：Redis 持久化 = AOF everysec + RDB，残余丢失路径显式接受 + 分层兜底

- Redis 配置 `appendonly yes`（everysec）+ RDB 快照；部署基线与 requirepass 归 deployment 文档。
- at-least-once 的两条**残余丢失路径显式接受**：①Redis 崩溃丢失最后 ≤1s 已 XADD 未落盘的条目；
  ②stream 修剪（MAXLEN）删掉长期未消费的积压。兜底分层：通知类事件丢失即接受（自愈 = 用户下次
  拉取）；同步类链路（M13 起）走**域级对账** job 补偿；修剪水位配前哨告警。
- **不做消费者确认式 outbox**（发布行等消费方 ack 才标记）：复杂度换来的增量保障在当前链路
  不必要；若未来出现零容忍链路，彼时再议。

### 6. 三处对上游文档的有意修正（登记）

1. **对 vNext 设计规格 §6.1「Drizzle 表工厂」**：定形为 **SQL 模板 + 列名常量**。本仓运行时数据
   访问是裸 `pg`，不存在可运行时消费 Drizzle 表对象的模块；若未来 drizzle 运行时化，属横切技术栈
   决策，另立 ADR，不由 M12 隐式带入。
2. **对 foundation-blueprint M12 节「聚合分区键」（及 vNext 设计规格 §6.2「同一聚合内有序」）**：
   顺序为**尽力而为、不作契约承诺**（`aggregate_type/aggregate_id` 列保留为未来分片预留）；重试
   乱序客观存在，消费者以库内状态为准。blueprint 措辞随本 ADR 同批修正。
3. **对 foundation-blueprint「在途事件丢失依 outbox 重发补齐」**：修正为**残余窗口显式接受 + 分层
   兜底**（见决策 5）——outbox 保证的是发布侧不丢，不承诺传输侧零丢失。blueprint 措辞随本 ADR
   同批修正。

## 后果

**正面**：发布侧丢失面归零（事件与业务写同生死）；契约与既有事件名不破；驱动可切换（memory 保留
为测试/单进程语义）；schema ownership 铁律不破（无中央表、无跨 schema 轮询）；M13 im-adapter、
SSE 多副本、gateway 拆分的事件前提就位。

**代价与接受**：每个 critical 事件多一行 outbox 写（当前事件频率下可忽略；M17 高频场景届时评估
旁路）；relay 每模块一条 LISTEN 专线进连接预算；at-least-once 要求所有消费方幂等（M12-2 三件套）；
M12-1 过渡态（memory 驱动 + outbox 记账）未发布行线性堆积，由 M12-2 cutover 水位一次性收编——
设计内行为。

**显式不做**：exactly-once、schema registry / 事件版本协商、Kafka、消费者确认式 outbox、
IM/agent 消息通道接入本总线（直连专线，ADR-0008/0009 口径）。

## 关联

- `docs/adr/0006-vnext-roadmap.md`（钦定本 ADR 的决策位）
- `docs/rfc/m12-reliable-events-multiprocess.md`（实施规格，Accepted）
- `docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md` §6.1（被修正点 1）
- `docs/foundation-blueprint.md` M12 节（被修正点 2/3，同批措辞修正）
- ADR-0003（gateway 组合宿主边界，不因本 ADR 改变）
