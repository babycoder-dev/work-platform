# ADR-0006: vNext 技术路线图（类飞书愿景 + AI Agent）

## 状态

Accepted（2026-07-06）｜ 修正 ADR-0005 的 vNext 段；对 constitution §1 作两处前提修正
并加一处时点标注（C/S 客户端交付时点）
（见「对既有文档的修正」）。设计推演过程与逐里程碑细节见
`docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md`（两轮独立评审已落修）。

## 背景

M0–M11 覆盖"以人为中心的组织管理"（人员/在位/日报/审批）。产品负责人于 2026-07-05 拍板
将平台长期愿景扩展为**类飞书的企业协作平台**：传统协作面（IM、任务+日历+会议室）、
数据能力（类 Bitable 多维表格）、以及 **AI Agent**（用户/组织可按需配置 Agent 自动化日常
重复工作，对标 Slack + Claude 模式）。同时确认五项约束：

1. 纯内部使用、不商业化——AGPL 代码可依赖引用乃至 fork/搬运；
2. LLM 双通道——云 API（Claude）与内网自部署（OpenAI 兼容端点）皆可切换；
3. 开源接入姿态按组件混合决策；
4. 产能维持"负责人 + AI 编程代理"，不设硬期限，保持 RFC→切片→独立评审流程；
5. 大组件顺序 IM 优先；
6. Agent 形态 = **数字员工**（2026-07-06 补拍板）：常驻实例、App 内注册/启用、k8s 全生命
   周期管理；平台能力以 CLI/Skills 形式喂给 Agent（对标飞书官方 lark-cli）。

ADR-0005 的 vNext 段（"多维表格+自动化、周报、桌面端、外部 IM、内网交付强化"）只是清单，
未回答顺序、依赖与接入姿态；本 ADR 给出可执行的里程碑序列并取代该段。

## 决策

### 1. 双轨里程碑序列（M12–M19 + M20+ 预留桶）

现有 M9（进行中）→ M10 日报 → M11 审批不动。vNext 采用**横切基建（🔧）与纵向组件（📦）
交替**的双轨序列：

| 里程碑 | 类型 | 内容 |
| --- | --- | --- |
| M12 可靠事件与多进程基建 | 🔧 | 事务性 outbox + 按模块实例化的中继 + Redis Streams 驱动 + 消费幂等/重试/死信规范 + SSE 多副本 fan-out + 调度基建抽壳 `@work/scheduling` + **最小可观测性基线**（带外告警通道 + 指标/日志最小栈）+ **CI 矩阵/测试策略扩展**（补齐 `docs/testing-strategy.md`，统一新 env-gate 防假绿）+ realtime-gateway 处置与 Redis 持久化两个收口决策位 |
| M13 IM 基座 | 📦 | OpenIM Server 独立部署基线（备份/监控 runbook + 离线导入）+ im-adapter 实装（账号 provisioning / 部门群同步 / token 换发与撤销传播 / webhook 回流 / agent bot 消息回调专线） |
| M14 IM 体验 | 📦 | Shell 内嵌聊天 UI（OpenIM JS SDK 以 npm 依赖引用）+ 站内通知可选 IM 投递 |
| M15 Agent 基座 v1 | 🔧+📦 | 数字员工实例模型（`agent.*` 状态机）+ Agent Sandbox CRD 编排（k8s 全生命周期、空闲缩零、SandboxDriver 三档）+ pi harness（pi-ai + pi-agent-core）+ 能力供给三层（manifest `agentTools` 单源 → MCP / `work-cli` / AgentSkills 三投影）+ Agent 双模式身份（委托 + 自主任职）/审计 + 首个数字员工（内置助手）挂 IM |
| M16 任务+日历+会议室 | 📦 | 自建 `modules/calendar` + `modules/tasks`；RRULE 真源 + occurrence 物化；会议室=资源日历 + 排他约束冲突检测 |
| M17 数据引擎 | 🔧 | `modules/bitable` 动态物理表内核（Teable 路线）；员工档案槽位迁移跑通（既有 UI 无感） |
| M18 多维表格 UI | 📦 | 网格（canvas+虚拟滚动）/Kanban/表单视图；forms 填报页切换新引擎，迁毕 forms 退役 |
| M19 自动化 + Agent v2 | 📦 | when-trigger-then-action 引擎（归属 bitable 子域）+ 数字员工自助注册/启用 UI 与自主任职全量开放 + Skills 覆盖面扩展 + 治理面板 |
| M20+ 持续项 | 🔧/📦 预留桶 | gateway 真拆分、桌面 Qt、多层部门、周报、Excel 导入、内网交付强化【均预留：按业务触发插入，不阻塞主线】 |

两条贯穿原则：① 无用户可见交付的纯 🔧 里程碑仅 M12、M17，其获得感风险已显式接受；
② M15 之后 `agentTools` 是模块 manifest 的常规组成部分（如 menus/permissions）。

### 2. 开源接入三姿态

| 姿态 | 适用 | 代表 |
| --- | --- | --- |
| 独立部署 + Provider 适配 | 重型域外系统，域模型自洽 | OpenIM Server（沿 ADR-0001） |
| harness / SDK 嵌入（依赖引用，不搬源码） | 许可可依赖、同栈、边界干净 | pi（MIT）、OpenIM JS SDK（AGPL，须 IM 子 ADR 修正 ADR-0001 后启用） |
| 解剖搬运（spike 深评后成块搬代码） | 平台命脉组件，必须长在自有底盘 | Teable（bitable 内核/前端）；APITable 仅参考协同设计，搬运须先在 product-requirements 翻案 |

**流程规范**：每个大组件 RFC 前置一个"开源深评 spike"切片（拉起候选 + 读关键子系统源码，
输出可搬运/自研/风险清单），报告沉淀于 `docs/research/`。已规划四个：OpenIM 部署裁剪
（M13）、Agent 运行时评估（M15）、**内网 LLM 推理基线评估（M15 部署前置）**、Teable 解剖
（M17-M18）；OpenIM 与 LLM 两个 spike 的资源实测汇总为容量规划输入。

### 3. 关键技术拍板（细节与理由见 spec）

- **事件**：outbox 按 schema 分治、中继按模块实例化、broker 用 Redis Streams、事件分
  critical / notify-only 两级；`MemoryEventBus` 降级为测试 fallback。
- **IM**：OpenIM userID = 平台 user id、零独立账号；token 换发短 TTL + 平台禁用/登出事件
  驱动 admin API 强制下线（撤销传播）；聊天内容不回流平台库，agent bot 回调专线是唯一
  白名单例外（非领域事件、不走 outbox/总线）。
- **Agent = 数字员工**：常驻实例为平台一等实体（`agent.*` 状态机 registered→provisioning→
  running/idle→upgrading→suspended→archived）；运行时编排 = **Kubernetes Agent Sandbox
  CRD**（持久工作区、空闲缩零、快速恢复；SandboxDriver 三档：CRD/裸 Pod/Docker；k3s 起步，
  egress 白名单三端点）；**双模式身份**——委托模式（用户权限 ∩ 工具白名单、platform-api
  签发、级联吊销、审计双主体）+ 自主任职模式（平台账号新主体类型 `kind=agent`，挂部门配
  角色，复用既有 RBAC/数据范围，M15 建模型 M19 全量开放）；**能力供给单源三投影**——
  manifest `agentTools` 编译出 MCP server / `work-cli` / AgentSkills 包（对标 lark-cli）；
  **写操作确认平台锚定**（IM 卡片只载深链；IM 内联确认标预留）。
- **bitable**：存储模型定调**动态物理表**（翻案须新 ADR）；运行时 DDL 经 DDL 管理层单一
  入口、运行账号 DDL 权限限定 `bitable.*`（security-baseline §8 增量豁免边界）。
- **任务/日历**：自建；RRULE 为真源、occurrence 物化为冲突检测前提；日程可见性引入参与者
  制，与组织范围制并存（security-baseline §5 增量）。
- **运维与算力（2026-07-06 缺漏审计后认领）**：M12 认领**最小可观测性基线**（告警带外
  通道——死信/管道故障告警不得走站内通知或 IM 投递，管道自身故障时会一起死；指标 + 日志
  最小栈进部署基线）与 **CI 矩阵扩展**（Redis service + 多进程 e2e 形态，补齐
  `docs/testing-strategy.md` 统一新 env-gate 防假绿规约）；**内网 LLM 推理端点是 M15 的
  部署前置**（GPU/模型/推理服务由专项 spike 实证，不到位则缺省通道不存在）；deployment
  扩为"vNext 部署基线与容量规划"（统一备份矩阵 PG+files+Redis+Mongo/MinIO+agent PV、
  单机堆叠 vs 拆机容量视角、离线交付链路含 k3s air-gap 与模型权重导入，借 M13 立项欠账的
  `docs/offline-deployment-runbook.md`）。

### 4. 子 ADR 立项（编号顺排，各里程碑启动时产出）

1. 事件传输选型（M12，含 realtime-gateway 处置与 Redis 持久化语义两个收口决策位）；
2. IM 集成边界（M13）= **对 ADR-0001 的显式修正**（Web SDK 依赖引用 + agent bot 通道 +
   token 换发/撤销传播 + IM 消息留存/归档策略 + AGENTS.md §7 / constitution §4 措辞例外；
   M14 RFC 另含 Chrome 109 × OpenIM JS SDK 实测或 Win7 显式豁免检查项）；
3. Agent 身份、工具面与运行时编排（M15）= **对 ADR-0004 的显式扩展**（双模式身份：委托
   令牌 + 自主任职的平台账号新主体类型 `kind=agent` 及其 schema 落位、gateway 鉴权面新
   令牌形态、确认回传防伪、Agent Sandbox CRD 编排选型与 SandboxDriver 三档、常驻沙箱的
   多用户会话隔离与令牌注入/续期语义、agent 的 IM 账号 provisioning——与 IM 子 ADR 联合、
   `agent.*` schema 归属与迁移入口、agent 主体在既有业务面的逐面纳入-排除清单（名册/看板/
   日报需报/组织树/统计/导出 vs IM 联系人/任务指派）、owner 生命周期联动、审计与用量数据
   增长预算）；
4. bitable 存储模型（M17）。

## 对既有文档的修正

- **ADR-0005**：其 vNext 段被本 ADR 的 M12–M19 序列取代；M5–M11 结论不变。
- **constitution §1**：
  - "长期预留 IM、多维表格、日历与事项能力，但当前不实现" → 已由本 ADR 激活规划；
  - "系统必须支持企业内网无公网环境部署" → 保持为缺省与底线，但 M15 起云 LLM API 为
    **可选通道**（显式开启项）；air-gapped 部署降级为仅内网自部署 LLM 通道。业务数据出
    内网的风险与缓解见 spec §14。
- **security-baseline**：§4（委托令牌 + agent 自主身份令牌、平台账号新主体类型
  `kind=agent` 的认证与吊销语义、撤销窗口/级联吊销）、§5（新数据类型扩展机制 + agent
  主体在授权基线的口径）、§8（bitable 运行时 DDL 豁免边界）、§9（Redis Streams 加固 +
  持久化/备份语义）、§10（IM token 换发/撤销 + JS SDK 许可与数据流审查）、§11（新密钥
  类别：OpenIM admin secret / 云 LLM API key / 内网 LLM 端点凭据 / k8s Secret 与沙箱令牌
  注入姿态）六处增量，按其 §16"先改文档再动代码"门禁随对应里程碑 RFC 落地。
- **constitution §1"同时提供 Web UI 与 C/S 客户端"**：加时点标注（桌面端见本 ADR M20+
  预留桶），避免承诺长期悬置无标注（doc-index §6）。

## 后果

**正面**：Agent 能力有明确落点且长在统一权限/审计底盘上；三姿态让 IM/多维表格避免从零
自研；双轨保证基建在被需要的前一刻就位、组件里程碑持续可感知。

**代价与风险**（登记于 spec §14，摘要）：部署基线两次扩展（OpenIM 全家桶、k3s）；业务
数据出内网（云通道，显式开启）；OpenIM token 撤销窗口；pi 治理漂移（已移交 earendil-works
PBC，版本锁定 + 许可审查 + MIT fork 逃生舱）；Agent Sandbox CRD 项目年轻（SandboxDriver
三档保底）；数字员工自主模式的权限失控面（复用 RBAC + 角色最小化 + 敏感工具 HITL + 全量
审计 + 治理面板）；bitable 运行时 DDL 突破生产禁改 schema 基线（豁免边界收口）；Teable
搬运缝合成本不确定（spike 先行）；**内网 LLM 硬件不到位则 M15 缺省通道空转**（LLM spike
为部署前置，不可行须回到前提重议）；**owner 离职后数字员工失主**（Agent 身份 ADR 登记
生命周期联动）；**观测缺位下的多组件运维盲区**（M12 认领最小可观测性基线）。

## 备选方案（已否）

- **A 垂直串行**（按组件逐个做完）：Agent 迟到、事件/调度基建被迫在组件中途救火。
- **C 开源拼装卫星舰队**（Teable/OpenIM/自动化平台全部独立部署 + SSO 粘合）：架空统一
  权限/审计底盘，"以人为中心的一体 UX"名存实亡。

## 关联

- 设计规格：`docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md`
- 路线：`docs/foundation-blueprint.md`（vNext 篇章）｜ 需求：`docs/product-requirements.md` §5
- 既有决策：ADR-0001（OpenIM）、ADR-0003（gateway 边界）、ADR-0004（phantom-token）、
  ADR-0005（2026-05 重规划）
