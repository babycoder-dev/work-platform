# vNext 技术路线图设计：类飞书愿景 + AI Agent

状态：Draft（两轮独立评审已修订，待产品负责人审阅）｜ 起草 2026-07-05、
一审修订 + 二审修订 2026-07-06 ｜ 参与：产品负责人 + Claude（brainstorming 流程）

> 本文是设计规格（spec），不是仓库权威文档。它的"实现"= 按 §13 产出 ADR-0006 与各权威文档增量。
> 在 ADR-0006 落地前，本文与既有文档冲突时以既有文档为准；本文对既有 ADR/宪法前提的修正
> 均在 §13 显式登记，落地时以"新增 ADR 修正"方式进行，不悄改旧结论。

> 一审（独立 sub-agent，2026-07-06）：3 Critical / 7 Major / 10 Minor 已全部落修——
> **C1** OpenIM JS SDK 接入姿态与 ADR-0001/AGENTS.md §7 冲突（改为 npm 依赖引用 + 显式 ADR 修正）、
> **C2** M15 消费的 IM @消息通道被 §7.5 隐私边界排除（为 agent 会话显式开洞并列为 M13 交付物）、
> **C3** 令牌扩展缺 security-baseline 落点 + IM token 撤销传播缺失（§7.1/§8.4/§13 补齐）、
> **M1** outbox 中继组件缺位 + 部分索引事实错误、**M2** 调度复用前置缺失、**M3** RRULE×排他约束
> 需 occurrence 物化、**M4** 云 LLM 与内网前提冲突未声明、**M5** 文档落点缺项、**M6** 纯 🔧 计数
> 自相矛盾、**M7** 存储模型"既拍板又留辩题"。

> 二审（换代理独立评审，2026-07-06）：一审 20 条核对 19 修净、1 部分修净；新增 1 Critical +
> 4 Major + 8 Minor 已全部落修——**C-N1** bitable 运行时 DDL 与 security-baseline §8 冲突未登记
> （§13.3 补 §8 增量豁免边界）、**M-N1** agent bot 消息传输形态两处口径不一（拍板：回调直连
> 专线，不走 outbox/总线）、**M-N2** 写确认信任锚落在 OpenIM（拍板：平台锚定确认为缺省，IM
> 内联确认标预留）、**M-N3** "业务模块不得直接调用 OpenIM"铁律例外未登记（modules/im/web 为
> 唯一获准 SDK 宿主）、**M-N4** 新数据类型触发 baseline §5 落点缺失；Minor 含 constitution
> 落点、中继实例化粒度、委托令牌签发方、消费者状态存储、files 引用迁移、自动化引擎归属等。
>
> 增补（产品负责人拍板，2026-07-06）：**Agent 定位升级为"数字员工"**——常驻实例（非会话
> 工具）、App 内注册/启用、k8s 全生命周期管理（采用 Kubernetes Agent Sandbox CRD 路线）、
> 双模式身份（委托代办 + 自主任职）；平台能力按**单源三投影**供给 Agent（manifest
> `agentTools` → MCP + `work-cli` + AgentSkills，对标飞书官方 lark-cli）。详见 §2 表末行、
> §3.3、§5 里程碑表、§8、§12、§13、§14 对应修订。增量经独立 delta 评审（1C/3M/5m，核心：
> 常驻化后的隔离单元与令牌语义须重算）已全部落修。
>
> 缺漏审计（独立 sub-agent gap audit，2026-07-06）：2 P0 / 9 P1 / 7 P2 已全部落修——核心
> 盲区是"物理世界"：**P0-1** 内网 LLM 硬件/推理服务零规划却为缺省通道（新增第 4 个 spike，
> M15 部署前置）、**P0-2** 可观测性无人认领且告警不能走自身管道（M12 认领带外告警 + 最小
> 观测栈，§6.7）；P1 含 CI 矩阵/testing-strategy 还账（§6.8）、realtime-gateway 处置与
> Redis 持久化决策位（§6.9）、`agent.*` 归属/业务面逐面口径/owner 离职联动（§13.2）、统一
> 备份矩阵与容量规划与离线交付（§13.6）、Chrome109×OpenIM SDK 检查项（§7.3）；P2 含云文档/
> 全局搜索/通知偏好显式非目标（§13.4）、baseline §11 密钥落点、C/S 承诺时点标注（§13.8）、
> bitable Win7 降级引用（§11）、数据保留策略（§13.2）。

## 1. 愿景与范围

把平台从"以人为中心的组织管理"（M0–M11）扩展为**类飞书的企业协作平台**：

1. 传统企业协作面：人员管理（已有）、IM、任务+日历（含会议室资源）、审批（M11 已排）；
2. 数据能力：类飞书多维表格（Bitable）的通用 表/字段/记录/视图 引擎；
3. AI Agent：用户/组织可按需配置 Agent，自动化日常重复工作（对标 Slack + Claude 模式）。

方法论要求：**充分调研业界成熟开源项目**，按组件选择接入姿态（独立部署 / harness 嵌入 /
解剖搬运），降本提速；同时不架空平台最值钱的资产——统一身份/组织/权限/审计底盘。

## 2. 已确认约束（2026-07-05 与产品负责人对齐）

| 约束 | 拍板 | 影响 |
| --- | --- | --- |
| 商业化意图 | **纯内部使用，不商业化** | AGPL 依赖可安心引用；AGPL 源码 fork/搬运（如 Teable）无传染顾虑。**注意**：具体到 OpenIM JS SDK，既有 ADR-0001/AGENTS.md §7 另有"不 Fork/不复制 SDK 代码"约束，接入姿态见 §7.3（npm 依赖引用，须 ADR 修正） |
| LLM 连接性 | ~~双通道都要（云 API + 内网自部署）~~ **2026-07-07 拍板修正：线上 API 为主通道，放弃内网自部署**（ADR-0006 状态节增补拍板） | 由 pi-ai 满足，不自研 provider 抽象。air-gapped 部署下 agent 能力不可用；可发送数据类别硬边界归 Agent 身份子 ADR；数据出内网风险登记 §14 |
| 开源接入姿态 | **混合：按组件定** | 见 §3.5 姿态矩阵 |
| 产能节奏 | **继续"负责人 + AI 编程代理"模式，不设硬期限** | 里程碑按依赖排序即可；保持 RFC→切片→独立评审重流程 |
| 大组件顺序 | **IM 优先**（M11 之后） | IM 先行还带来 Agent 的对话入口 |
| Agent 形态（2026-07-06 补拍板） | **数字员工**：常驻实例 + App 内注册启用 + k8s 全生命周期管理；平台能力以 CLI/Skills 形式喂给 Agent（对标 lark-cli） | Agent 实例模型与运行时编排见 §8；能力供给三层见 §8.5；身份双模式见 §8.4 |

## 3. 开源调研结论（2026-07 实况）

### 3.1 多维表格候选

| 项目 | 栈 | 存储模型 | 许可 | 活跃度 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **Teable** | NestJS + Prisma + PostgreSQL + Next.js | **动态物理表**（用户表=真实 PG 表、字段=真实列） | CE AGPL-3.0；**自动化/权限矩阵在闭源企业版**（2026-07-06 spike 实证修正：AI 基础能力已进 CE，商业授权边界 M19 前重核，见 `docs/research/teable-anatomy.md` §6）；packages 层 MIT | 21.4k stars，2026-07 仍在发版 | ✅ **首选代码来源**（同栈同库） |
| APITable | Java Spring Boot（backend-server）+ NestJS（room-server，OT 协同）+ Next.js + MySQL | 记录 JSON + OT changeset | AGPL-3.0 | 主仓最后更新 2025-10，公司重心转 AITable.ai SaaS | ❌ 基座（异构双后端 + MySQL + 低维护）；✅ 参考 OT 协同引擎与 canvas 网格交互。**注**：现行 product-requirements §5 口径为"仅借鉴概念、不轻易引入其代码"，若 spike 后决定搬运 room-server 源码，须在 product-requirements 增量中显式翻案（§13） |
| Baserow | Django + Vue, PG | 元数据驱动 | 核心 MIT | 活跃 | 二线参考（字段类型语义） |
| Grist | Node + Python 沙箱公式引擎 | SQLite 文档 | Apache-2.0 | 活跃 | 公式引擎单点参考 |
| NocoDB | Node | 连接既有库的 UI 层 | 已转 source-available（非开源） | 活跃 | ❌ 定位不合 + 许可倒退 |

### 3.2 IM

维持 ADR-0001 的服务端姿态：**OpenIM Server**（Apache-2.0，Go）独立部署 + `im-adapter-api`
适配，不 fork、不接管账号。备选（Rocket.Chat/Zulip/Matrix）均无推翻理由。

**Web 端 SDK 是新决策点**：OpenIM JS SDK 为 AGPL-3.0/商业双许可。ADR-0001:41-42 当前明确
"第一阶段不集成 AGPL 客户端 SDK、接入需单独评估"，AGENTS.md §7 明确"不复制 OpenIM Demo 或
客户端 SDK 代码"。本设计的姿态：**以 npm 依赖方式引用 SDK（不复制/不 fork 源码）**，纯内部
使用下 AGPL 合规成立；此决策 = 对 ADR-0001 的显式修正，由 IM 子 ADR 承载（附许可 + 数据流
审查，security-baseline §10 同步），AGENTS.md §7 措辞同步更新（"不复制源码"保留，"引用 SDK
依赖"放行）。fork 源码仅作为上游停摆时的逃生舱预案登记，不是本期姿态。

### 3.3 Agent 运行时

- **pi**（pi-mono，MIT，TypeScript）：极简 agent 工具箱——`pi-ai`（统一 25+ LLM provider）、
  `pi-agent-core`（agent loop + tool calling）。同栈、分层干净，**选为 harness**。治理现状：
  仓库已于 2026-04 移交 `earendil-works/pi`（公益公司持有，核心仍 MIT）——依赖风险从
  "个人项目断更"转为"商业化/许可漂移"，缓解见 §14。
- **OpenClaw**：自托管助手网关模式标杆（单网关桥接多消息渠道 ↔ 沙箱 agent 会话），底层即 pi
  stack。**采用其拓扑**；其 sandbox 默认即 **per-agent 作用域**、会话状态持久化磁盘——
  佐证"常驻实例 + 按需容器"的数字员工运行模型。
- **Kubernetes Agent Sandbox**（SIG Apps，2026-03 发布）：专为 Agent 设计的 **Sandbox CRD**
  ——有状态持久环境、内建生命周期（shutdownTime/shutdownPolicy）、**空闲缩零 + 快速恢复**、
  可选 gVisor/Kata 强隔离运行时，标准 controller 模式。**选为 Agent 实例编排主线**（§8.3）。
- **kagent**（CNCF）：Agent 即 CRD 资源、kubectl/GitOps 管生命周期——声明式姿态作参考，
  不直接引入（其框架与 pi harness 定位重叠）。
- **lark-cli**（飞书官方开源，2026）：11 业务域 / 200+ 命令 / **19 个 AgentSkills**，官方
  定位 CLI 与 MCP 互补（CLI 轻量无常驻进程、MCP 管实时订阅）。**作为平台能力供给 Agent 的
  形态基准**（§8.5 `work-cli` + Skills）。
- **hermes-agent**（Nous Research，Python）：多渠道 IM 桥接（Telegram/Discord/Slack/WhatsApp/
  Signal 等已核实；飞书/企微渠道待 spike 核实）+ 技能自习得 + 持久记忆。完整产品难嫁接我们
  权限模型，**作 v2 借鉴**（技能/记忆）。
- MCP（Model Context Protocol）已是工具接入事实标准，平台工具面按 MCP server 暴露。

### 3.4 任务/日历/会议室

无合适基座：Cal.com 自托管开源版已转为 Cal.diy（MIT 但官方定位非生产就绪，M16 spike 一句话
复核其成熟度即可）；Vikunja/Planka 权限模型是项目制、与组织制不合。**自建**，但循环日程照
iCalendar RRULE 标准建模、CalDAV 服务端留预留。

### 3.5 接入姿态矩阵（三种姿态各有代表）

| 姿态 | 适用 | 代表 |
| --- | --- | --- |
| 独立部署 + Provider 适配 | 重型域外系统，域模型自洽 | OpenIM Server |
| harness / SDK 嵌入（依赖引用，不搬源码） | 许可可依赖、同栈、边界干净的运行时 | pi（pi-ai / pi-agent-core）、OpenIM JS SDK（须 ADR 修正，见 §3.2） |
| 解剖搬运（spike 深评后成块搬代码） | 平台命脉组件，必须长在自有底盘上 | Teable（bitable）；APITable 协同代码若搬运须先翻案（§3.1 注） |

**流程规范**：每个大组件 RFC 前固定一个"开源深评 spike"切片——拉起候选项目 + 读关键子系统
源码，输出可搬运清单/需自研清单/风险清单，沉淀为 `docs/research/*.md`。

## 4. 总体策略：双轨交替（已选方案 B）

被否方案：A 垂直串行（Agent 迟到、基建救火）、C 开源拼装卫星舰队（架空统一权限底盘、
一体 UX 名存实亡）。

选定 B：**横切基建里程碑（🔧）与纵向组件里程碑（📦）交替**。三条横切基建——可靠跨进程
事件、Agent 基座（工具面 + 身份治理）、数据引擎换代——在被需要的前一刻就位；组件骑在
基建上，每个组件上线即交付其 MCP 工具面。两条贯穿原则：

1. **无用户可见交付的纯 🔧 里程碑仅 M12、M17 两个**，均已在 §14 登记获得感风险与缓解
   （M12 顺带收掉 SSE fan-out 等既有预留；M17 以"员工档案槽位在新引擎跑通、既有 UI 无感
   切换"作为内部可验证面）；
2. M15 之后 `agentTools` 是模块 manifest 的常规组成部分（如 menus/permissions）。

## 5. 里程碑总图

现有路线不动：M9（进行中）→ M10 日报 → M11 审批。vNext 自 M12 起：

| 里程碑 | 类型 | 内容摘要 |
| --- | --- | --- |
| M12 可靠事件与多进程基建 | 🔧 | 事务性 outbox + 中继 + Redis Streams 驱动 + 消费三件套规范 + SSE fan-out + 调度基建抽壳与多副本互斥 + **最小可观测性基线** + **CI 矩阵/测试策略扩展** |
| M13 IM 基座 | 📦 | OpenIM 部署基线（备份/监控 runbook + 离线导入）+ 账号 provisioning/部门群同步/token 换发与撤销传播/webhook 回流 + **agent bot 消息通道** |
| M14 IM 体验 | 📦 | Shell 内嵌聊天 UI（OpenIM JS SDK 依赖引用）+ 通知 IM 投递（点亮 M7 预留接口位） |
| M15 Agent 基座 v1 | 🔧+📦 | 数字员工实例模型 + Agent Sandbox CRD 编排（k8s 全生命周期）+ pi harness + 能力供给三层（MCP/`work-cli`/Skills 单源三投影）+ Agent 双模式身份/审计 + 首个数字员工（内置助手）挂 IM |
| M16 任务+日历+会议室 | 📦 | 自建 `modules/calendar` + `modules/tasks`，RRULE 建模 + occurrence 物化，会议室=资源日历 |
| M17 数据引擎 | 🔧 | `modules/bitable` 动态物理表内核（Teable 路线），员工档案槽位迁移跑通（既有 UI 无感） |
| M18 多维表格 UI | 📦 | 网格（canvas+虚拟滚动）/Kanban/表单视图；forms 填报页切换到新引擎，迁毕 forms 退役 |
| M19 自动化 + Agent v2 | 📦 | when-trigger-then-action 引擎 + 数字员工自助注册/启用 UI 与自主任职模式全量开放 + Skills 覆盖面扩展 + 治理面板 |
| M20+ 持续项 | 🔧/📦（预留桶） | gateway 真拆分、桌面 Qt、多层部门【均预留：按业务触发按需插入，不阻塞主线】 |

## 6. M12 可靠事件与多进程基建

目标：进程内尽力而为 → **跨进程 at-least-once**，发布/订阅契约不破。IM webhook、Agent
worker、SSE 多副本、gateway 拆分的共同前置。

1. **事务性 outbox，按 schema 分治**：事件行与业务写同事务；模块只写自己 schema ⇒ 每个发
   事件模块各建同构 outbox 表，表结构由 `@work/event-bus` 提供 Drizzle 表工厂。
   `platform.domain_events` 已具 outbox 表形状可升级启用，但要如实评估：该表**至今零写入方**，
   `domain_events_unpublished_idx` 是 `published_at` 普通索引（`0000_init_platform.sql:194`）
   ——启用工作含**改造为 `WHERE published_at IS NULL` 部分索引** + 从零接线发布方。
   `EventBus` 契约扩展事务感知入口 `publishInTx(tx, event)`。
2. **中继（relay）是 outbox 的命门组件，显式设计**：中继由 `@work/event-bus` 提供、**按模块
   实例化**——每个实例只触达本模块的 outbox 表，不做跨 schema 的中央轮询（守 schema
   ownership）；宿主进程内运行（轮询 + PG NOTIFY 唤醒混合），把未发布行搬进 broker 后标记
   `published_at`；多副本下中继经 PG advisory lock 互斥；顺序保证按 aggregate id 作 stream
   分区键（同一聚合内有序，跨聚合不承诺）。轮询间隔/批量/失败退避等参数归 M12 RFC。
3. **事件可靠性分两级**（发布方在事件契约上声明）：`critical`——走 outbox + at-least-once
   （默认级，凡驱动下游业务动作的事件必须此级）；`notify-only`——绕过 outbox 直发、容忍丢失
   （仅限纯 UI 信号类，如 SSE 重拉提示）。判据细则与既有事件的定级归 M12 RFC。
4. **Broker = Redis Streams**（consumer group 给 ack/pending/重试；Redis 本在 infra 清单；
   规模不配 Kafka）。`@work/event-bus` 新增 `RedisStreamEventBus`，`MemoryEventBus` 降级为
   测试/单进程 fallback——与 repository 双实现模式同构。
5. **消费三件套写进 `docs/module-contract.md`**：幂等（按 event id 去重）、重试退避、死信
   stream + 告警。**无自有 schema 的消费宿主**（如 im-adapter-api）的幂等/死信状态存储约定
   一并规范（Redis 幂等键为缺省，或经评审建最小自有 schema——M12 定约定，M13 首用）。既有
   两个订阅器（`presence.status.changed`←M7-2、`profile.updated`←M8-3）为迁移验证对象，
   验收 = 发布方进程 ≠ 消费方进程的 e2e 跑通。
6. **一并收口既有预留与新增前置**：SSE 多副本 fan-out（Redis pub/sub）、**调度基建抽壳**——
   现调度长在 `modules/notification/api` 内（`ScheduleModule.forRoot()` + 只读
   `notification.schedule_config`），M13 对账 job、M19 定时触发器都需要非 notification 宿主的
   调度能力 ⇒ 抽为 `@work/scheduling` 共享包（含 PG advisory lock 多副本互斥），notification
   先迁移自证。

7. **最小可观测性基线（2026-07-06 缺漏审计后本里程碑认领）**：**告警带外通道**拍板——
   死信/管道故障告警不能走站内通知或 IM 投递（管道自身故障时告警一起死），候选：邮件 /
   独立 webhook / 经 OpenIM admin API 直发运维群（该候选依赖 M13 后才可用且与 IM 同命，
   M12 验收须用前两者），M12 RFC 定；指标采集 + 日志聚合最小栈
   （Prometheus + Loki 级或更轻）进部署基线；M13（OpenIM 全家桶）/M15（k3s/沙箱）各自
   组件的监控项挂各自 runbook。
8. **CI 矩阵与测试策略扩展**：CI 增加 Redis service 与**多进程 e2e 形态**（下方退出标准
   所需）；借此补齐 doc-index §7 欠账的 `docs/testing-strategy.md`，统一 Redis/OpenIM/k8s
   三类新 env-gate 的防假绿规约（连同既有 PG gate 一并收口，沿其"静默跳过"教训）；
   M13/M15 RFC 各登记其外部依赖的测试替身/容器化策略。
9. **两个收口决策位**：① `apps/realtime-gateway` 处置——现为无业务的 socket.io 骨架，
   SSE 实际长在 gateway 内 notification 模块、IM 走 OpenIM 自有 ws，退役 / 收编为 SSE
   fan-out 宿主 / 并入 gateway 三选一（architecture/deployment 随之更新）；② Redis 升格
   为 critical 事件 broker 后的**持久化语义**——AOF/RDB 配置、重启时在途事件丢失依 outbox
   重发补齐的论证、备份策略（deployment §6 统一备份矩阵扩列）。

不做：不拆 gateway、不做 exactly-once、不引入 schema registry（事件契约仍在 `packages/*-contract`）。
交付：ADR（事件传输选型）+ RFC + 4~5 切片（含可观测性与 CI 基建切片）。

## 7. M13-14 IM 接入

总原则：OpenIM Server 是可替换卫星服务，平台是身份与组织唯一真源，业务模块的**服务端**只见
`@work/im-provider`；**`modules/im/web` 是唯一获准直连 OpenIM 的指定 SDK 宿主**——这是对
constitution §4 / AGENTS.md §7"业务模块不得直接调用 OpenIM"铁律的显式例外，随 IM 子 ADR
登记（措辞更新见 §13.8）。服务端姿态沿 ADR-0001；**Web SDK 接入与 agent 消息通道是对
ADR-0001 的两处显式修正，由 IM 子 ADR 承载**（§3.2、本节 5）。

1. **身份映射零账号 + 撤销传播**：OpenIM userID = 平台 user id；昵称/头像从档案同步；不设
   OpenIM 密码，Web 端 IM token 仅经 `im-adapter-api` token 换发端点（平台会话 → OpenIM
   admin API 签发，**短 TTL**）。**撤销传播是硬要求**：平台禁用用户/登出/会话失效 →
   im-adapter 消费平台事件后经 admin API 强制下线该用户的 OpenIM 会话并吊销 token——OpenIM
   ws 不穿平台网关，phantom-token 的"即时撤销"语义（ADR-0004/baseline §4）对它不自动生效，
   必须显式补链路（security-baseline §10 增量，§13）。
2. **同步 = 事件驱动 + 夜间对账**：platform 用户/部门事件 → im-adapter 消费（M12 第一个新
   消费者）→ OpenIM 用户与**部门群**增删；夜间全量对账 job 修漂移——调度能力来自 M12 抽壳
   的 `@work/scheduling`（§6.6），不是复用 notification 内部调度。部门群成员资格以平台组织
   树为准。
3. **聊天 UI 自建**：`modules/im/web` 标准模块挂 shell，OpenIM JS SDK 以 **npm 依赖**引入
   （不复制源码，姿态与 ADR 修正见 §3.2）；OpenIM websocket 经反代直连，不穿 realtime-gateway
   （平台 SSE 管通知信号，IM ws 管消息，两通道各司其职）。**Win7 口径 = M14 RFC 检查项**：
   OpenIM JS SDK（wasm 形态，或依赖 SharedArrayBuffer/跨源隔离响应头）在 Chrome 109 + 企业
   反代下**实测**，跑不通则显式豁免"IM 不入 Win7 核心功能清单"并同步 constitution §7 与
   architecture §3.3 清单口径。
4. **通知 IM 投递**：站内通知可选投递渠道 `ImProvider.sendSystemMessage`（系统账号），按
   触发点配置；通知中心仍是事实源。
5. **隐私边界（写进 IM 子 ADR），含 agent 通道的显式开洞**：
   - 常规聊天内容不回流平台库（不进审计/搜索）；webhook 默认只回流账号/群组生命周期事件；
     内容级合规审计留预留接口位；
   - **例外通道（M13 交付物）**：平台注册专用 **agent bot 账号**；仅"发给 bot / @bot"的消息
     经消息回调白名单回流。**传输形态拍板 = 回调直连专线**：OpenIM 回调 → im-adapter 校验
     （签名 + 发送者 userID 绑定）→ 按**转发契约**直连推给 agent 消费端；**显式不是领域事件、
     不走 outbox/总线**——若走总线，critical 级事件行落 PG 即违反"内容不落平台业务库"的
     本节承诺；可靠性由回调重试 + 会话级对账兜底。M13 交付物界定为：bot 账号 + 回调白名单 +
     签名校验 + im-adapter 侧转发契约（M15 前以 echo 探针验收，agent-gateway 到位后接管）；
     消息内容不落平台业务库、会话元数据进 `agent.*`（M15 建 schema）。**转发契约预留收件
     agent 标识**（M19 多数字员工各有 IM 账号后按收件方路由）；agent 账号的 IM
     provisioning（无档案——昵称/头像取自 agent 定义）与回调白名单随 agent 注册**动态
     维护**，归 IM 子 ADR × Agent 身份 ADR 联合决策位。

部署注意：OpenIM 全家桶（Mongo/Kafka/MinIO/Redis）是平台首次引入非 PG 存储——compose
基线 + 备份 runbook 是 M13 一等公民交付物；M13 前 spike 评估组件裁剪空间。
交付：子 ADR（IM 集成边界 + 对 ADR-0001 的修正，编号随 ADR-0006 后顺排）+ M13/M14 两个 RFC。

## 8. M15 Agent 基座 v1（数字员工模型：pi harness + Agent Sandbox + IM 入口）

**定位拍板（2026-07-06）：Agent = 数字员工**——常驻实例、有身份、有记忆、可被注册/启用/
停用，不是"聊完即毁"的会话工具。自研面收窄为"实例生命周期 + 平台能力供给面 + 身份治理"，
其余用现成：

1. **LLM 层 = pi-ai**（放弃自研 `@work/llm-provider`），外包一层部署配置（模型清单/密钥/
   端点）。~~双通道语义：内网自部署通道为缺省~~ **2026-07-07 拍板修正：线上 API 为主
   通道，内网自部署放弃**（ADR-0006 状态节增补拍板）——M15 部署前置从"GPU/模型/推理
   服务"变为"受控公网 egress + API key 管理"；"哪些数据类别可进 prompt"升级为主通道硬
   边界，归 Agent 身份子 ADR 拍板位；原"内网 LLM 推理基线评估"spike（§13.9）**取消**，
   其携带的 pi 真实 provider 协议实测改在 M15 首切片以真实 key 冒烟完成。
2. **Agent 循环 = pi-agent-core**；我们只写平台工具集与治理钩子。
3. **实例模型与运行时编排 = Agent Sandbox CRD（k8s 全生命周期）**：
   - **Agent 是平台一等实体**：`agent.*` schema 存定义与实例（所属人/组织、指令、工具白名单、
     触发方式、状态机 `registered → provisioning → running/idle → upgrading → suspended →
     archived`）。M15 的内置助手就是第一个实例走同一模型；M19 开放自助注册/启用 UI。
   - **每个启用实例对应一个 k8s Agent Sandbox（Sandbox CRD，SIG Apps）**：持久工作区
     （pi 会话/记忆/技能落卷）、**空闲缩零 + 被唤醒秒级恢复**（用户视角"我的数字员工常驻
     在线"，资源视角闲时不占——几百人规模单机 k3s 可养）；升级 = 换镜像重建沙箱，状态在
     卷上故可滚动；可选 gVisor/Kata 强隔离。
   - `apps/agent-gateway` 职责 = **Agent 生命周期管理器 + 会话路由**：管实例状态机与 Sandbox
     CRD 编排；消费 agent bot 消息（§7.5 回调直连专线，接管 M13 echo 探针位；不经 outbox/
     总线）并按收件 Agent 路由到其沙箱（必要时先唤醒）；流式回复经 im-provider 桥回 IM。
   - **`SandboxDriver` 抽象三档**：Agent Sandbox CRD 主线 / 裸 Pod（CRD 项目不成熟时的
     fallback）/ Docker（开发降级）——沿双实现模式；k8s（k3s）是继 OpenIM 后第二个部署
     基线扩展，需专门 runbook。
   - **常驻化的安全语义重算（决策位，归 Agent 身份 ADR + M15 RFC）**：隔离单元从会话变为
     常驻实例后，**沙箱内多用户会话隔离与委托令牌注入/续期语义**必须显式拍板——候选：
     内置助手按用户实例化 / 单实例内按会话分区且记忆不跨用户 / 委托令牌**逐消息**经
     agent-gateway 控制通道下发、不落持久卷（预倾向：令牌逐消息下发 + 记忆按用户分区）；
     持久记忆与 §14"会话上下文最小化"缓解之间的张力一并论证。
   - 定时/自动化触发（M19"调用 Agent"动作、自主任职定时任务）经 agent-gateway 公开 API
     进入，唤醒语义同消息路由；升级（换镜像）时在途会话的 drain/切换语义归 M15 RFC。
   - **沙箱 egress 白名单闭环**：仅放行 ① LLM 端点（内网通道时无公网 egress；云通道开启时
     仅 Claude API 域名）② 平台 MCP/API 端点 ③ **agent-gateway 控制通道**（会话指令下发与
     流式回传）。不给 DB、不给内网横向。
4. **平台侧不变量（不因 harness 改变）**：
   - **MCP 工具面规范**：模块 manifest 声明 `agentTools`（工具名/描述/输入 JSON Schema/
     绑定权限点/数据范围语义），**gateway-api**（模块 manifest 的组合宿主，非 agent-gateway）
     聚合为平台 MCP server；工具 = 既有 service 薄适配器，
     授权与审计**继承** `@RequirePermissions` + scope 管道，不为 Agent 重写一套；manifest
     扩展的规范归属 `docs/module-contract.md`（§13）；
   - **Agent 身份模型 = 双模式（专门 ADR，安全基线第二次大扩展）**。数字员工有两种行事
     模式，审计与令牌形态区分：
     - **委托模式（代人办事）**：用户在 IM 里让 Agent 替自己做事。审计双主体
       `actor=agent:<id>, onBehalfOf=user:<id>`（连带 `platform.audit_logs` 增列——schema
       变更，过 doc-index §5 文档审查）；**委托令牌** = 用户权限 ∩ Agent 工具白名单、短
       时效、永不超过用户本人；**用户会话失效 → 派生委托令牌级联吊销**是硬语义。
     - **自主模式（以自己身份任职）**【M15 建模型、M19 全量开放】：数字员工作为**平台账号
       体系的新主体类型**（`kind=agent` 的账号，可挂部门、配角色、出现在 IM 联系人里、被
       指派任务），在定时/事件触发下以**自身角色权限**行事（审计 `actor=agent:<id>`、无
       onBehalfOf）。权限经角色最小化授予，与人类员工同一套 RBAC/数据范围机制——复用
       平台底盘而非另造 Agent 权限系统；敏感操作仍可按工具配置 HITL 升级为找 owner 确认。
       **落位注意**：平台现无独立 users 表，"用户"即 `platform.employees`（identities/
       部门负责人均外键指向它）——agent 主体落位为**独立 agent 实体挂 `local_identities`**
       还是 **employees 扩 kind 列**，归 Agent 身份 ADR 拍板；属 platform schema 变更，
       过 doc-index §5 文档审查。
     - 两种令牌**签发与存储归 platform-api**（令牌真源只有一个）；**gateway 鉴权面须认新
       令牌形态**——`PlatformAuthGuard` / introspection 现仅认用户 token 且入口为
       `GET /auth/me` 返回 `CurrentUserDto`（ADR-0004 §2），扩展为可辨识 agent 主体并解析
       双主体（扩 DTO 或新 introspection 端点，Agent 身份 ADR 定），属 ADR-0004 的显式
       扩展 + security-baseline §4/§5 增量（§13）；
   - **写操作 human-in-the-loop，确认信任锚拍板 = 平台锚定**：查询类直接执行；变更类的 IM
     卡片只承载**平台深链**，用户点击后在平台侧（携平台会话）完成确认——授权动作的信任锚
     不落在 OpenIM 上（IM 回调签名只能证明"消息来自 OpenIM Server"，证明不了"用户本人
     点了确认"；OpenIM 是平台外信任域的可替换卫星，不进写授权 TCB）。**IM 内联按钮直接
     确认**【预留：需 Agent 身份 ADR 论证把 OpenIM 纳入确认 TCB 的条件后方可启用】。确认
     落审计；风险登记 §14；
   - 治理数据归 `agent.*` schema（实例状态/会话元数据/token 用量/工具调用审计）；pi 会话
     文件与记忆留沙箱持久卷。
5. **平台能力供给三层 = 单源三投影（对标 lark-cli）**：模块 manifest 的 `agentTools` 声明
   是**唯一定义源**，编译出三种投影，避免多套工具定义漂移：
   - **MCP server**（gateway-api 聚合，见上）——结构化调用与实时订阅；
   - **`work-cli`**——平台官方 CLI，薄壳包公开 API，预装进 Agent 沙箱基础镜像，鉴权读
     沙箱注入的令牌；轻量、可组合、pi 这类 harness 天生吃 CLI（lark-cli 同款定位：11 域
     200+ 命令的形态基准）；
   - **AgentSkills 包**——markdown + 脚本的流程知识（"帮张三补登记出差的完整流程"），
     随模块交付、预装沙箱，M15 后与 menus/permissions 一样是模块出厂标配。
   三投影共享同一权限点绑定与审计管道；`work-cli` 与 Skills 的规范同归
   `docs/module-contract.md`（§13）。
6. **首个数字员工（内置助手，不可自助注册）**：查在位/查我的待办与日报/代登记状态（带
   确认）/代发审批（带确认）——全部走委托模式；自主模式在 M15 只建身份模型不放业务。
7. 依赖治理：pi 已由公益公司接管（§3.3），风险转为商业化/许可漂移——**版本锁定 + 逐版本
   许可审查 + MIT fork 逃生舱**写进 RFC；agent-gateway 不深耦合 pi 内部 API。Agent Sandbox
   CRD 为 2026-03 新项目——`SandboxDriver` 三档保底（§8.3），风险登记 §14。

留 M19【预留，触发条件 = M15 内置助手验收通过】：数字员工自助注册/启用 UI、自主任职模式
全量开放（挂部门/配角色/接任务）、定时/事件触发、RAG 知识库、技能自习得（hermes 借鉴）、
Claude Agent SDK 高级驱动（沙箱代码执行场景）、Skills 覆盖面扩展到全模块。

## 9. M16 任务 + 日历 + 会议室（自建）

1. 两个标准业务模块：`modules/calendar`（日程 + 会议室）、`modules/tasks`（任务）。会议室 =
   资源实体 = 一本资源日历。
2. **循环日程照 iCalendar RRULE 语义建模（真源）+ occurrence 物化窗口（派生行）**：RRULE/
   EXDATE/单次修改存于日程主体；滚动窗口（如未来 N 月）内展开为 occurrence 物化行，单次
   修改落覆盖行。**会议室冲突检测作用在 occurrence 物化行上**（PG `tstzrange` 排他约束）——
   排他约束无法作用于未展开的 RRULE 序列，物化是它的前提而非可选项；窗口长度/滚动策略/
   窗口外循环预订的语义归 M16 RFC。CalDAV 服务端【预留：桌面/移动客户端接入时触发】。
3. **访问模型新设计题**：日程可见性为参与者制（组织者/参与人/忙闲），与组织范围制正交——
   RFC 拍板"忙闲按组织范围、内容按参与者"的双层口径；任务按指派链。
4. 咬合：提醒走 M7 通知 + `@work/scheduling`；邀约走 IM 投递；会议室审批联动走 M11 事件；
   `agentTools` 随模块出生（订会议室是 Agent 演示价值最高工具之一）。

## 10. M17 数据引擎（bitable 内核）

1. **新建共享模块 `modules/bitable`**（contract + api，先无 web），独立 `bitable.*` schema。
   不在 forms 原地改：forms 保持稳定，bitable 达标后**按槽位渐进迁移**（员工档案 → 日报 →
   在位登记），迁完 forms 退役——"扩展不是重写"的兑现方式是契约平滑、实现换代。
2. **存储模型定调 = 动态物理表**（Teable 路线，本 spec/ADR-0006 拍板，不再留辩题）：用户表 =
   `bitable` schema 真实 PG 表、字段 = 真实列，DDL 管理层负责建列/改列/索引。查询/排序/索引/
   行数上限对 JSONB 是质变。JSONB 快照仅保留在记录历史/审计侧。M17 RFC 只细化 DDL 管理层、
   命名/配额/迁移策略；若解剖 spike 发现重大反证，经 ADR 修正翻案。
   **⚠️ 运行时 DDL 与 security-baseline §8 正面冲突**（"生产禁止自动同步 schema、变更一律走
   迁移、运行账号最小权限"三条全撞）——须以 baseline §8 增量定豁免边界：DDL 仅经 bitable
   DDL 管理层单一入口、运行账号的 DDL 权限**限定在 `bitable.*` schema 内**、配额/命名/审计
   约束随行（§13.3 登记，遵守 §16"先改文档"门禁）。
   "直接 SQL 查数"限定澄清：指 bitable 模块**自身**提供的查询能力与未来专门的只读通道
   【预留：BI 场景触发时设计】，**不是**允许其他模块/外部直连 `bitable.*` 物理表——schema
   隔离铁律不因物理表模型松动。
3. **搬运清单（Teable 解剖 spike 输出）**：字段类型系统、公式引擎（解析器 + 依赖图 + 增量
   重算）、视图 = 查询编译。**自研清单**：平台组织/角色/数据范围权限桥（Teable 权限矩阵在
   闭源企业版且模型不同）、审计接入、**槽位兼容层与 forms 退役迁移**——含
   `presence.status_records.form_record_id`（M9-1 增列）指向语义从 forms 记录切换到 bitable
   记录的跨模块引用迁移、**files 单引用模型的引用迁移**（forms 记录携带的文件/图片字段，
   `ownerModule/referenceType/referenceId` 须随记录改指 bitable）、forms 既有记录数据迁移/
   归档、`db:migrate:forms` 入口退役流程。
4. 实时协同推迟 M18 再定（spike 对比 Teable 与 APITable room-server 方案）。
5. 里程碑定性：纯 🔧（无用户可见交付），内部可验证面 = 员工档案槽位在新引擎跑通、既有 UI
   无感切换；获得感风险已登记 §14。

## 11. M18 多维表格 UI

网格视图（canvas + 虚拟滚动，搬 Teable 前端）为主交付；Kanban/表单视图次之；画册/日历视图
【预留：网格/Kanban 验收后按需求触发】。`modules/bitable/web` 标准模块挂 shell。既有 forms
填报页切换到新引擎渲染即为迁移验收面。像素级还原门禁照 UI 收口切片先例。canvas 网格对
Win7/Chrome 109 引用 architecture §3.3 既有降级豁免（"复杂表格可对 Win7 降级"），M18 RFC
显式定义降级形态（如表单视图兜底），避免还原度门禁与旧浏览器降级在验收时打架。

## 12. M19 自动化 + Agent v2

1. **自动化引擎**（需求 §5 收敛落点）：触发器三类（领域事件/bitable 记录变更/定时——定时
   触发器消费 `@work/scheduling`）× 动作五类（站内通知/IM 消息/创建记录/发起审批/调用
   Agent）；事件类全部长在 M12 总线上；**归属拍板 = bitable 模块的子域**（automation 作为
   `modules/bitable` 内子能力，Teable 同构）——规则存 `bitable.*` 即为模块内自举，不跨
   schema；跨模块动作（通知/审批/Agent）一律经公开 API 与事件，不直写他模块。
2. **Agent v2 = 数字员工全量开放**：自助注册/启用/停用 UI（用户与组织按需配置：指令 +
   工具白名单 + 触发方式 IM @/定时/自动化动作）；**自主任职模式全量开放**（挂部门/配角色/
   接任务/出现在 IM 联系人，§8.4）；hermes 式技能自习得与持久记忆；Skills 覆盖面扩展到
   全模块；Claude Agent SDK 作为高级驱动【预留：沙箱代码执行场景出现真实需求时触发】；
   治理面板（实例清单/用量/审计/配额）。

## 13. 文档落点（本设计进仓库的方式）

1. **ADR-0006 vNext 技术路线图**：修正 ADR-0005 的 vNext 段——双轨序列、三种开源姿态、
   子 ADR 立项；**显式声明对 constitution §1"内网无公网部署"前提的修正**（云 LLM 通道为
   可选配置 + air-gapped 降级姿态）。
2. 子 ADR 按里程碑启动补（编号随 ADR-0006 后顺排）：
   - 事件传输选型（M12）；
   - **IM 集成边界（M13）= 对 ADR-0001 的显式修正**：Web SDK 依赖引用姿态（附 AGPL 合规
     结论 + 数据流审查）、agent bot 消息通道对隐私边界的开洞、token 换发与撤销传播、
     **IM 消息留存/归档策略**（Mongo 留存时长——合规争议 §14 已登记，留存口径在此拍板）；
   - **Agent 身份、工具面与运行时编排（M15）= 对 ADR-0004 的显式扩展**：双模式身份（委托
     令牌 + 自主任职的平台账号新主体类型 `kind=agent` 及其 schema 落位）、gateway 鉴权面
     新令牌形态、确认回传防伪、Agent Sandbox CRD 编排选型与 SandboxDriver 三档、**常驻
     沙箱的多用户会话隔离与令牌注入/续期语义**、agent 的 IM 账号 provisioning（与 IM 子
     ADR 联合）、**`agent.*` schema 归属**（agent-gateway 是 app 非 module——归属/迁移
     入口 `db:migrate:agent` 由谁提供/是否新建 `modules/agent` 承载 contract+api）、
     **agent 主体在既有业务面的逐面纳入-排除清单**（在位看板名册/日报"在岗须报"/组织树/
     人员统计与导出 vs IM 联系人/任务指派——前者大概率排除、后者必须出现，逐面拍板）、
     **owner 生命周期联动**（owner 禁用/离职 → 其名下实例 suspend/转移/归档 + 持久记忆卷
     处置）、**审计与用量数据的增长预算**（agent 逐工具调用全量审计下 audit_logs 与
     `agent.*` 用量表的保留/归档策略）；
   - bitable 存储模型（M17，定调动态物理表，翻案须新 ADR）。
3. **`docs/security-baseline.md` 增量（遵守其 §16"先改文档再动代码"门禁）**：§4 新令牌
   形态（委托令牌 + agent 自主身份令牌）、平台账号体系新主体类型 `kind=agent` 的认证与
   吊销语义、撤销窗口/级联吊销；**§5 新数据类型扩展机制**——现"可配置数据
   类型固定为 profile/presence/report"，M16 日历参与者制/任务指派链、M17 bitable 权限桥
   都触发数据范围模型调整（按模块声明的数据类型注册 + 参与者制与组织范围制并存口径，随
   M16/M17 子 RFC）+ **agent 主体在授权基线的口径**（§3 登录/锁定/员工状态校验对 agent
   的适用与排除、数据范围对 agent 的适用，随 Agent 身份 ADR）；**§8 bitable 运行时 DDL 豁免边界**（单一入口/schema 限定权限/配额与
   审计，见 §10.2）；§9 Redis Streams 承载业务事件后的访问控制加固 + **持久化/备份语义**
   （在途事件即业务数据，§6.9）；§10 OpenIM token 换发/撤销传播 + JS SDK 许可与数据流
   审查结论；**§11 新密钥类别**（OpenIM admin API secret、云 LLM API key、内网 LLM 端点
   凭据、k8s Secret 与沙箱令牌注入机制的存放姿态）。
4. `docs/foundation-blueprint.md` 增补 vNext 篇章（M12–M19 门禁）；
   `docs/product-requirements.md` 补 IM/任务日历/多维表格/Agent 需求条目 + **三条显式
   非目标登记**（缺漏审计 P2：① 云文档/知识库——不做文档产品，结构化协作以 bitable 承接，
   M19 的"RAG 知识库"是 agent 语料非用户文档；② 全局搜索——不做统一搜索，且 IM 消息因
   隐私边界（内容不回流平台）**结构性**无法进平台搜索，此为 §7.5 拍板的隐含后果须写明；
   ③ 通知偏好/免打扰——三渠道叠加后的用户侧设置，后置到 M14 一并定或显式不做）；各
   条目标注状态；若搬运 APITable 代码，§5"不轻易引入其代码"口径在此翻案。
5. `docs/architecture.md`：新增 agent-gateway、modules/{im,calendar,tasks,bitable}、Redis
   Streams、OpenIM 全家桶、k8s 沙箱的拓扑更新，**§3.1 身份认证架构**（agent 主体类型进入
   身份模型，M15），及 **realtime-gateway 处置结论**（§6.9 决策位落定后同步）（各里程碑
   交付时同步）。
6. `docs/deployment.md` + runbooks 扩为"vNext 部署基线与容量规划"：OpenIM 部署与备份/
   监控（M13）、k3s 沙箱基线 + agent 持久卷备份（M15）、**内网 LLM 推理端点**（M15 部署
   前置，spike 产出）、**可观测性组件进基线**（M12）、**统一备份矩阵**（PG + files +
   Redis + Mongo/MinIO + agent PV 的 RPO/RTO 口径）、**容量规划**（单机堆叠 vs 拆机——
   平台 compose + OpenIM 全家桶 + k3s 沙箱群 + LLM 推理的叠加视角，两个 spike 产出汇总，
   M15 前完成）、**离线交付链路**（OpenIM 镜像集、k3s air-gap 安装、沙箱基础镜像、模型
   权重与 GPU 驱动离线导入；借 M13 立项欠账的 `docs/offline-deployment-runbook.md`）——
   doc-index §5"改变内网部署方式"必审项。
7. `docs/module-contract.md`：`agentTools` manifest 扩展规范与**单源三投影**（MCP /
   `work-cli` / AgentSkills，M15）、事件消费三件套（M12）。
8. AGENTS.md §7 与 constitution 措辞更新（随对应 ADR）：保留"不复制源码"，放行"SDK 依赖
   引用"；"业务模块不得直接调用 OpenIM"补 `modules/im/web` 唯一 SDK 宿主例外（AGENTS.md
   §7 + constitution §4）；constitution §1"内网无公网部署"补云 LLM 可选通道的前提修正、
   "IM 长期预留当前不实现"等过时表述随 ADR-0006 更新；constitution §1"同时提供 Web UI 与
   C/S 客户端"加时点标注（桌面端见 ADR-0006 M20+ 预留桶，长期悬置须显式）（doc-index §6：
   过时文档必须标注替代）。
9. 新增 `docs/research/` 目录承接开源深评 spike 报告，共四个：Teable 解剖、OpenIM 部署
   裁剪、**Agent 运行时评估**（pi/OpenClaw 拓扑 + Agent Sandbox CRD 实测 + kagent 姿态
   文档级核实 + lark-cli 的 CLI/Skills 形态解剖）、**内网 LLM 推理基线评估**（缺漏审计
   P0 新增：GPU 规格 × 候选
   模型 × vLLM 等推理服务 × 离线权重导入，M15 部署前置）；OpenIM 与 LLM 两个 spike 的
   资源实测汇总为容量规划输入（§13.6）。
10. 各里程碑 RFC 在启动时按既有两轮独立评审流程产出。

## 14. 风险登记

| 风险 | 缓解 |
| --- | --- |
| OpenIM 运维重量（Mongo/Kafka/MinIO 首次进部署基线） | M13 前 spike 评估裁剪；备份/监控 runbook 为一等交付物 |
| **业务数据出内网**（云 LLM 通道发送在位/待办/审批等上下文至云 API）——2026-07-07 拍板后云 API 为主通道，本风险从"可选项风险"升级为"常态风险" | 可发送数据类别的**硬边界**归 Agent 身份子 ADR 拍板（白名单 + 脱敏规则 + 按工具声明数据面）；air-gapped 部署下 agent 能力不可用（ADR-0006 前提修正加强） |
| **提示注入下经 LLM 请求外传数据**（云通道即公网 egress，恶意上下文可诱导 Agent 把工具取回的数据编入对 LLM 的请求） | 委托令牌收窄读面 + 会话上下文最小化 + 云通道数据类别限制 + 敏感工具输出不回填上下文的白名单策略（M15 RFC 细化）；配合既有四层纵深（令牌∩白名单、egress 白名单、写确认、双主体审计） |
| OpenIM token 撤销窗口（IM ws 不穿平台网关，平台撤销不自动生效） | 短 TTL + 平台禁用/登出事件驱动 admin API 强制下线（§7.1，security-baseline §10 增量） |
| pi 治理漂移（已移交 earendil-works PBC，商业化/许可变更风险） | 版本锁定 + 逐版本许可审查 + MIT fork 逃生舱；agent-gateway 不深耦合 pi 内部 API |
| k8s（k3s）进内网部署基线的运维成本 | SandboxDriver 抽象保 Docker 降级路径；k3s 单机起步 |
| Teable 搬运代码与自有底盘的缝合成本高估/低估 | M17 前解剖 spike 先行，产出量化的搬运/自研清单再写 RFC |
| 纯 🔧 里程碑（M12、M17）无用户可见交付 | 已与产品负责人确认接受；M12 顺带收掉 SSE fan-out 等既有预留；M17 以档案槽位迁移跑通为内部可验证面 |
| 聊天内容不进平台审计的合规争议 | 显式 ADR 决策 + 内容级审计预留接口位；agent bot 通道为白名单例外（§7.5） |
| outbox/中继从零接线的工作量被"表已存在"掩盖 | §6.1 已如实登记（零写入方 + 索引改造）；M12 RFC 按真实工作量拆片 |
| **OpenIM 进入授权链的诱惑**（IM 内联确认体验更好，但把卫星服务拉进写授权 TCB） | 确认信任锚拍板平台锚定（§8.4）：IM 卡片只载深链、确认在平台侧携平台会话完成；内联确认标【预留】且启用须 Agent 身份 ADR 论证 |
| **数字员工自主模式的权限失控面**（agent 以自身角色权限自主行事，无人在环） | 复用平台 RBAC/数据范围（不另造权限系统）+ 角色最小化授予 + 敏感工具可配 HITL 找 owner 确认 + 全量审计 `actor=agent` + 治理面板配额；M15 只建模型不放业务，M19 全量开放前过 Agent 身份 ADR 评审 |
| **共享常驻沙箱的跨用户上下文隔离**（多用户令牌/记忆共存一个常驻实例，提示注入的横向面） | §8.3 决策位：令牌逐消息下发不落卷（预倾向）+ 记忆按用户分区 / 按用户实例化，Agent 身份 ADR + M15 RFC 拍板后才放行内置助手多用户服务 |
| **Agent Sandbox CRD 项目年轻**（SIG Apps 2026-03 发布，API 可能变动） | `SandboxDriver` 三档抽象（CRD/裸 Pod/Docker）保底；Agent 运行时 spike 实测后再定版本锁定策略 |
| **内网 LLM 硬件不到位 → M15 缺省通道空转**（GPU/模型/推理服务无落地则被迫全走云通道，数据出内网缓解整体失效） | "内网 LLM 推理基线评估" spike 为 M15 部署前置（§13.9）；采购/选型结论进 deployment 容量规划（§13.6）；spike 结论为"不可行"时须回到 §2 前提重议 |
| **owner 离职后数字员工失主**（实例继续以旧授权运行，记忆卷含离职者业务数据） | Agent 身份 ADR 登记 owner 生命周期联动（禁用/离职 → suspend/转移/归档 + 记忆卷处置）；M19 治理面板含归属转移 |
| **观测缺位下的多组件运维盲区**（Mongo 打满/Kafka 积压/沙箱泄漏无人知晓） | M12 认领最小可观测性基线（§6.7：带外告警通道 + 指标/日志最小栈）；M13/M15 runbook 各挂组件监控项 |
| **bitable 运行时 DDL 突破"生产禁自动改 schema"基线** | baseline §8 增量定豁免边界：DDL 管理层单一入口 + 运行账号 DDL 权限限定 `bitable.*` + 配额/命名/审计（§10.2、§13.3） |

## 15. 后续步骤

1. 两轮独立评审已完成并落修（二审结论：可进入 ADR 阶段，二审条目在 ADR-0006 评审时顺带
   核销），交产品负责人审阅；
2. 进入 writing-plans：产出实施计划——第一批交付物为 ADR-0006 + foundation-blueprint
   vNext 篇章 + product-requirements 增量 + `docs/research/` 目录与首个 spike 任务包；
3. M10/M11 照常推进，vNext 文档工作与其并行，互不阻塞。
