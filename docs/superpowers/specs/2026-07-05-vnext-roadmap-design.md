# vNext 技术路线图设计：类飞书愿景 + AI Agent

状态：Design Approved（对话式评审通过，待落 ADR）｜ 起草 2026-07-05 ｜
参与：产品负责人 + Claude（brainstorming 流程）

> 本文是设计规格（spec），不是仓库权威文档。它的"实现"= 按 §13 产出 ADR-0006 与各权威文档增量。
> 在 ADR-0006 落地前，本文与既有文档冲突时以既有文档为准。

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
| 商业化意图 | **纯内部使用，不商业化** | AGPL 代码可作基座 fork/搬运（Teable、OpenIM JS SDK 等），无传染顾虑 |
| LLM 连接性 | **双通道都要**（Provider 抽象） | 云 API（Claude）与内网自部署（vLLM/Ollama，OpenAI 兼容）可切换；由 pi-ai 天然满足 |
| 开源接入姿态 | **混合：按组件定** | 见 §3 姿态矩阵 |
| 产能节奏 | **继续"负责人 + AI 编程代理"模式，不设硬期限** | 里程碑按依赖排序即可；保持 RFC→切片→独立评审重流程 |
| 大组件顺序 | **IM 优先**（M11 之后） | IM 先行还带来 Agent 的对话入口 |

## 3. 开源调研结论（2026-07 实况）

### 3.1 多维表格候选

| 项目 | 栈 | 存储模型 | 许可 | 活跃度 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **Teable** | NestJS + Prisma + PostgreSQL + Next.js | **动态物理表**（用户表=真实 PG 表、字段=真实列） | CE AGPL-3.0；**自动化/权限矩阵/AI 在闭源企业版**；packages 层 MIT | 21.4k stars，2026-07 仍在发版 | ✅ **首选代码来源**（同栈同库） |
| APITable | Java Spring Boot（backend-server）+ NestJS（room-server，OT 协同）+ Next.js + MySQL | 记录 JSON + OT changeset | AGPL-3.0 | 主仓最后更新 2025-10，公司重心转 AITable.ai SaaS | ❌ 基座（异构双后端 + MySQL + 低维护）；✅ 参考 OT 协同引擎与 canvas 网格交互 |
| Baserow | Django + Vue, PG | 元数据驱动 | 核心 MIT | 活跃 | 二线参考（字段类型语义） |
| Grist | Node + Python 沙箱公式引擎 | SQLite 文档 | Apache-2.0 | 活跃 | 公式引擎单点参考 |
| NocoDB | Node | 连接既有库的 UI 层 | 已转 source-available（非开源） | 活跃 | ❌ 定位不合 + 许可倒退 |

### 3.2 IM

维持 ADR-0001：**OpenIM**（Apache-2.0，Go）独立部署 + `im-adapter-api` 适配。备选
（Rocket.Chat/Zulip/Matrix）均无推翻理由。OpenIM JS SDK 为 AGPL——纯内部使用已确认无碍。

### 3.3 Agent 运行时

- **pi**（badlogic/pi-mono，MIT，TypeScript）：极简 agent 工具箱——`pi-ai`（统一 25+ LLM
  provider）、`pi-agent-core`（agent loop + tool calling）。同栈、分层干净，**选为 harness**。
- **OpenClaw**：自托管助手网关模式标杆（单网关桥接多消息渠道 ↔ 沙箱 agent 会话），底层即 pi
  stack。**采用其拓扑**。
- **hermes-agent**（Nous Research，Python）：18 渠道 IM 桥接（含飞书/企微）+ 技能自习得 +
  持久记忆。完整产品难嫁接我们权限模型，**作 v2 借鉴**（技能/记忆）。
- MCP（Model Context Protocol）已是工具接入事实标准，平台工具面按 MCP server 暴露。

### 3.4 任务/日历/会议室

无合适基座（Cal.com 自托管版被官方边缘化定位非生产；Vikunja/Planka 为 AGPL 但权限模型是
项目制、与组织制不合）。**自建**，但循环日程照 iCalendar RRULE 标准建模、CalDAV 服务端留预留。

### 3.5 接入姿态矩阵（三种姿态各有代表）

| 姿态 | 适用 | 代表 |
| --- | --- | --- |
| 独立部署 + Provider 适配 | 重型域外系统，域模型自洽 | OpenIM |
| harness 嵌入（库级引入） | 许可友好、同栈、边界干净的运行时 | pi（pi-ai / pi-agent-core） |
| 解剖搬运（spike 深评后成块搬代码） | 平台命脉组件，必须长在自有底盘上 | Teable（bitable）、APITable（协同参考） |

**流程规范**：每个大组件 RFC 前固定一个"开源深评 spike"切片——拉起候选项目 + 读关键子系统
源码，输出可搬运清单/需自研清单/风险清单，沉淀为 `docs/research/*.md`。

## 4. 总体策略：双轨交替（已选方案 B）

被否方案：A 垂直串行（Agent 迟到、基建救火）、C 开源拼装卫星舰队（架空统一权限底盘、
一体 UX 名存实亡）。

选定 B：**横切基建里程碑（🔧）与纵向组件里程碑（📦）交替**。三条横切基建——可靠跨进程
事件、Agent 基座（工具面 + 身份治理）、数据引擎换代——在被需要的前一刻就位；组件骑在
基建上，每个组件上线即交付其 MCP 工具面。两条贯穿原则：

1. 每个 📦 里程碑结束时用户可感知新能力（纯 🔧 只有 M12 一个）；
2. M15 之后 `agentTools` 是模块 manifest 的常规组成部分（如 menus/permissions）。

## 5. 里程碑总图

现有路线不动：M9（进行中）→ M10 日报 → M11 审批。vNext 自 M12 起：

| 里程碑 | 类型 | 内容摘要 |
| --- | --- | --- |
| M12 可靠事件与多进程基建 | 🔧 | 事务性 outbox + Redis Streams 驱动 + 消费三件套规范 + SSE fan-out + 调度多副本互斥 |
| M13 IM 基座 | 📦 | OpenIM 部署基线 + 账号 provisioning/部门群同步/token 换发/webhook 回流 |
| M14 IM 体验 | 📦 | Shell 内嵌聊天 UI（OpenIM JS SDK）+ 通知 IM 投递（点亮 M7 预留接口位） |
| M15 Agent 基座 v1 | 🔧+📦 | pi harness + 沙箱（k8s）运行时 + 平台 MCP 工具面规范 + Agent 身份/委托令牌/审计 + 首个内置助手挂 IM |
| M16 任务+日历+会议室 | 📦 | 自建 `modules/calendar` + `modules/tasks`，RRULE 建模，会议室=资源日历 |
| M17 数据引擎 | 🔧 | `modules/bitable` 动态物理表内核（Teable 路线），forms 按槽位渐进迁移 |
| M18 多维表格 UI | 📦 | 网格（canvas+虚拟滚动）/Kanban/表单视图；forms 填报页切换到新引擎 |
| M19 自动化 + Agent v2 | 📦 | when-trigger-then-action 引擎 + 组织级可配置 Agent + 治理面板 |
| M20+ 持续项 | 🔧 | gateway 真拆分、桌面 Qt、多层部门等按需插入，不阻塞主线 |

## 6. M12 可靠事件与多进程基建

目标：进程内尽力而为 → **跨进程 at-least-once**，发布/订阅契约不破。IM webhook、Agent
worker、SSE 多副本、gateway 拆分的共同前置。

1. **事务性 outbox，按 schema 分治**：事件行与业务写同事务；模块只写自己 schema ⇒ 每个发
   事件模块各建同构 outbox 表（`platform.domain_events` 已在 M1 建成 outbox 形状且有
   unpublished 部分索引，直接升级启用；补 `presence.domain_events` 等；表结构由
   `@work/event-bus` 提供 Drizzle 表工厂）。`EventBus` 契约扩展事务感知入口
   `publishInTx(tx, event)`；既有 `publish()` 保留为非关键事件直发路径，事件按声明分可靠性等级。
2. **Broker = Redis Streams**（consumer group 给 ack/pending/重试；Redis 本在 infra 清单；
   规模不配 Kafka）。`@work/event-bus` 新增 `RedisStreamEventBus`，`MemoryEventBus` 降级为
   测试/单进程 fallback——与 repository 双实现模式同构。
3. **消费三件套写进 `docs/module-contract.md`**：幂等（按 event id 去重）、重试退避、死信
   stream + 告警。M7 两个既有订阅器（`presence.status.changed`、`profile.updated`)为迁移
   验证对象，验收 = 发布方进程 ≠ 消费方进程的 e2e 跑通。
4. **一并收口既有预留**：SSE 多副本 fan-out（Redis pub/sub）与调度多副本互斥（PG advisory
   lock）都在本里程碑做掉，不结转。

不做：不拆 gateway、不做 exactly-once、不引入 schema registry（事件契约仍在 `packages/*-contract`）。
交付：ADR（事件传输选型）+ RFC + 3~4 切片。

## 7. M13-14 IM 接入

总原则（沿 ADR-0001）：OpenIM 是可替换卫星服务，平台是身份与组织唯一真源，业务模块只见
`@work/im-provider`。

1. **身份映射零账号**：OpenIM userID = 平台 user id；昵称/头像从档案同步；不设 OpenIM 密码，
   Web 端 IM token 仅经 `im-adapter-api` token 换发端点（平台会话 → OpenIM admin API 签发）。
2. **同步 = 事件驱动 + 夜间对账**：platform 用户/部门事件 → im-adapter 消费（M12 第一个新
   消费者）→ OpenIM 用户与**部门群**增删；夜间全量对账 job（复用 M7 调度）修漂移。部门群
   成员资格以平台组织树为准。
3. **聊天 UI 自建**：`modules/im/web` 标准模块挂 shell，基于 OpenIM JS SDK；OpenIM websocket
   经反代直连，不穿 realtime-gateway（平台 SSE 管通知信号，IM ws 管消息，两通道各司其职）。
4. **通知 IM 投递**：站内通知可选投递渠道 `ImProvider.sendSystemMessage`（系统账号），按
   触发点配置；通知中心仍是事实源。
5. **隐私边界（写进 ADR）**：聊天内容不回流平台库（不进审计/搜索）；webhook 只回流账号/群组
   生命周期事件；内容级合规审计留预留接口位。

部署注意：OpenIM 全家桶（Mongo/Kafka/MinIO/Redis）是平台首次引入非 PG 存储——compose
基线 + 备份 runbook 是 M13 一等公民交付物；M13 前 spike 评估组件裁剪空间。
交付：子 ADR（IM 集成边界，编号随 ADR-0006 之后顺排）+ M13/M14 两个 RFC。

## 8. M15 Agent 基座 v1（pi harness + 沙箱 + IM 入口）

自研面收窄为"平台工具面 + 身份治理 + 沙箱编排"，其余用现成：

1. **LLM 层 = pi-ai**（放弃自研 `@work/llm-provider`），外包一层部署配置（模型清单/密钥/
   内网 OpenAI 兼容端点）。天然满足双通道约束。
2. **Agent 循环 = pi-agent-core**；我们只写平台工具集与治理钩子。
3. **运行时拓扑 = OpenClaw 模式落 k8s**：
   - `apps/agent-gateway`：消费 IM @消息（走 M12 总线），管理会话生命周期，为每会话调度
     **沙箱 Pod**（注入委托令牌 + 平台 MCP 端点 + pi 运行时），流式回复桥回 IM；
   - **`SandboxDriver` 抽象**：k8s Job/Pod 驱动为主线（内网基线推荐 k3s），Docker 驱动作
     开发/降级——沿双实现模式；k8s 是继 OpenIM 后第二个部署基线扩展，需专门 runbook；
   - **沙箱网络策略为安全命门**：Pod egress 白名单仅 LLM 端点 + 平台 MCP 端点，不给 DB、
     不给内网横向。防过权助手 + 提示注入（OpenClaw 社区教训）。
4. **平台侧不变量（不因 harness 改变）**：
   - **MCP 工具面规范**：模块 manifest 声明 `agentTools`（工具名/描述/输入 JSON Schema/
     绑定权限点/数据范围语义），gateway 聚合为平台 MCP server；工具 = 既有 service 薄适配器，
     授权与审计**继承** `@RequirePermissions` + scope 管道，不为 Agent 重写一套；
   - **Agent 身份模型（专门 ADR，安全基线第二次大扩展）**：审计双主体
     `actor=agent:<id>, onBehalfOf=user:<id>`；**委托令牌** = 用户权限 ∩ Agent 工具白名单、
     短时效，永不超过用户本人；
   - **写操作 human-in-the-loop**：查询类直接执行，变更类在 IM 发确认卡片，确认落审计；
   - 治理数据归 `agent.*` schema（会话元数据/token 用量/工具调用审计）；pi 会话文件留沙箱卷。
5. **首个内置助手**（不可配置）：查在位/查我的待办与日报/代登记状态（带确认）/代发审批
   （带确认）。
6. 依赖治理：pi-mono 为个人主导年轻项目——版本锁定 + fork 逃生舱（MIT）写进 RFC。

留 M19：组织自定义 Agent、定时/事件触发、RAG 知识库、技能自习得（hermes 借鉴）、Claude
Agent SDK 高级驱动。

## 9. M16 任务 + 日历 + 会议室（自建）

1. 两个标准业务模块：`modules/calendar`（日程 + 会议室）、`modules/tasks`（任务）。会议室 =
   资源实体 = 一本资源日历；预订 = 带资源参与者的日程 + 冲突检测（PG `tstzrange` 排他约束）。
2. 循环日程照 **iCalendar RRULE** 语义（成熟 rrule 库解析）；CalDAV 服务端【预留】。
3. **访问模型新设计题**：日程可见性为参与者制（组织者/参与人/忙闲），与组织范围制正交——
   RFC 拍板"忙闲按组织范围、内容按参与者"的双层口径；任务按指派链。
4. 咬合：提醒走 M7；邀约走 IM 投递；会议室审批联动走 M11 事件；`agentTools` 随模块出生
   （订会议室是 Agent 演示价值最高工具之一）。

## 10. M17 数据引擎（bitable 内核）

1. **新建共享模块 `modules/bitable`**（contract + api，先无 web），独立 `bitable.*` schema。
   不在 forms 原地改：forms 保持稳定，bitable 达标后**按槽位渐进迁移**（员工档案 → 日报 →
   在位登记），迁完 forms 退役——"扩展不是重写"的兑现方式是契约平滑、实现换代。
2. **存储模型 = 动态物理表**（Teable 路线）：用户表 = `bitable` schema 真实 PG 表、字段 =
   真实列，DDL 管理层负责建列/改列/索引。查询/排序/索引/行数上限对 JSONB 是质变，为
   "直接 SQL 查数"留门。JSONB 快照仅保留在记录历史/审计侧。M17 RFC 核心辩题即
   "动态物理表 vs JSONB"，预倾向前者。
3. **搬运清单（Teable 解剖 spike 输出）**：字段类型系统、公式引擎（解析器 + 依赖图 + 增量
   重算）、视图 = 查询编译。**自研清单**：平台组织/角色/数据范围权限桥（Teable 权限矩阵在
   闭源企业版且模型不同）、审计接入、槽位兼容层。
4. 实时协同推迟 M18 再定（spike 对比 Teable 与 APITable room-server 方案）。

## 11. M18 多维表格 UI

网格视图（canvas + 虚拟滚动，搬 Teable 前端）为主交付；Kanban/表单视图次之，画册/日历
视图后置。`modules/bitable/web` 标准模块挂 shell。既有 forms 填报页切换到新引擎渲染即为
迁移验收面。像素级还原门禁照 UI 收口切片先例。

## 12. M19 自动化 + Agent v2

1. **自动化引擎**（需求 §5 收敛落点）：触发器三类（领域事件/bitable 记录变更/定时）×
   动作五类（站内通知/IM 消息/创建记录/发起审批/调用 Agent）；长在 M12 总线上；规则存
   bitable（自举）。
2. **Agent v2**：组织级可配置 Agent（自定义指令 + 工具白名单 + 触发方式 IM @/定时/自动化
   动作）；hermes 式技能自习得与持久记忆；Claude Agent SDK 可选高级驱动（沙箱代码执行）；
   治理面板（用量/审计/配额）。

## 13. 文档落点（本设计进仓库的方式）

1. **ADR-0006 vNext 技术路线图**：修正 ADR-0005 的 vNext 段——双轨序列、三种开源姿态、
   子 ADR 立项。
2. 子 ADR 按里程碑启动补：事件传输选型（M12）、IM 集成边界（M13）、Agent 身份与工具面
   （M15）、bitable 存储模型（M17）。
3. `docs/foundation-blueprint.md` 增补 vNext 篇章（M12–M19 门禁）；
   `docs/product-requirements.md` 补 IM/任务日历/多维表格/Agent 需求条目（标注状态）。
4. 新增 `docs/research/` 目录承接开源深评 spike 报告（Teable 解剖、OpenIM 部署裁剪、
   pi/OpenClaw 运行时评估）。
5. 各里程碑 RFC 在启动时按既有两轮独立评审流程产出。

## 14. 风险登记

| 风险 | 缓解 |
| --- | --- |
| OpenIM 运维重量（Mongo/Kafka/MinIO 首次进部署基线） | M13 前 spike 评估裁剪；备份/监控 runbook 为一等交付物 |
| pi-mono 个人主导、项目年轻 | 版本锁定 + MIT fork 逃生舱；agent-gateway 不深耦合 pi 内部 API |
| k8s（k3s）进内网部署基线的运维成本 | SandboxDriver 抽象保 Docker 降级路径；k3s 单机起步 |
| Teable 搬运代码与自有底盘的缝合成本高估/低估 | M17 前解剖 spike 先行，产出量化的搬运/自研清单再写 RFC |
| 提示注入与 Agent 越权 | 委托令牌收窄 + egress 白名单 + 写操作确认卡片 + 审计双主体，四层纵深 |
| 纯 🔧 里程碑（M12）无用户可见交付 | 已与产品负责人确认接受；M12 同时收掉 SSE fan-out 等既有预留提升获得感 |
| 聊天内容不进平台审计的合规争议 | 已定为显式 ADR 决策，留内容级审计预留接口位可翻案 |

## 15. 后续步骤

1. 本 spec 经产品负责人审阅；
2. 进入 writing-plans：产出实施计划——第一批交付物为 ADR-0006 + foundation-blueprint
   vNext 篇章 + product-requirements 增量 + `docs/research/` 目录与首个 spike 任务包；
3. M10/M11 照常推进，vNext 文档工作与其并行，互不阻塞。
