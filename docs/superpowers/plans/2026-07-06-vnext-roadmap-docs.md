# vNext 路线图文档落地 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已定稿的 vNext 路线图设计规格（`docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md`，下称 **spec**）落成仓库权威文档：ADR-0006、constitution 前提修正、foundation-blueprint vNext 篇章、product-requirements 增量、foundation-progress 对齐、`docs/research/` 目录与首个 spike 任务包、doc-index 收纳。

**Architecture:** 纯文档变更，无代码。遵守 doc-index 文档优先级与防冲突规则：决策进 ADR、路线进 blueprint、需求进 product-requirements、入口文件只放链接；对既有 ADR/宪法的修正一律"新增 ADR 修正 + 旧文标注"，不悄改旧结论。每个任务 = 一个文档一个 commit，可独立评审。

**Tech Stack:** Markdown（简体中文）、Conventional Commits（`docs:` 前缀）、rg/git 做验证。

## Global Constraints

- 所有文档用简体中文；行宽尽量 ≤100 字符（与仓库 Prettier `printWidth: 100` 口径一致，硬换行照既有文档习惯）。
- 【本期做】/【预留】/【vNext】阅读约定必须沿用（product-requirements 开头定义）；预留项必须写清未来用途与触发条件，不留无人知晓的空白（用户硬规约）。
- 每个 commit 用 Conventional Commits `docs: ...`，末尾加：
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 工作分支：当前 worktree 分支 `claude/kind-northcutt-eacf6a`，不直接推 main。
- 内容以 spec 为唯一事实源；发现 spec 与本计划文稿冲突时以 spec 为准并停下来报告，不自行发挥。
- 所有文稿中的文件引用必须指向仓库真实存在的路径（最后任务统一验证）。

---

### Task 1: 创建 ADR-0006 vNext 技术路线图

**Files:**
- Create: `docs/adr/0006-vnext-roadmap.md`

**Interfaces:**
- Consumes: spec 全文（尤其 §2/§3.5/§4/§5/§13/§14）。
- Produces: ADR 文件路径 `docs/adr/0006-vnext-roadmap.md` 与其标题「ADR-0006」——后续任务的所有交叉引用都指向它。

- [ ] **Step 1: 写入 ADR 全文**

写入 `docs/adr/0006-vnext-roadmap.md`，内容如下（可按行宽微调换行，不改语义）：

```markdown
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
```

- [ ] **Step 2: 验证**

```bash
rg -n "ADR-0006" docs/adr/0006-vnext-roadmap.md | head -3
rg -n "2026-07-05-vnext-roadmap-design" docs/adr/0006-vnext-roadmap.md
```

预期：标题行命中；spec 引用命中 ≥2 处。并确认引用的文件存在：

```bash
ls docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md docs/adr/0005-product-replan-roadmap.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0006-vnext-roadmap.md
git commit -m "docs(adr): add ADR-0006 vNext roadmap (Feishu-like vision + AI agents)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: constitution §1 前提修正标注

**Files:**
- Modify: `docs/constitution.md:11-15`

**Interfaces:**
- Consumes: Task 1 的 `docs/adr/0006-vnext-roadmap.md`。
- Produces: constitution §1 中对 ADR-0006 的三处标注（供后续文档引用宪法时口径一致）。

- [ ] **Step 1: 修改 §1 三处表述（两处前提修正 + 一处时点标注）**

将 `docs/constitution.md` 第 11 行：

```markdown
长期预留 IM、多维表格、日历与事项能力，但当前不实现。
```

改为：

```markdown
长期预留 IM、多维表格、日历与事项能力；其落地规划已由 `docs/adr/0006-vnext-roadmap.md`
激活（vNext M12–M19），在对应里程碑启动前仍不实现。
```

将第 13 行：

```markdown
系统必须支持企业内网无公网环境部署。身份源默认使用企业内部账号，不依赖飞书、企业微信、LDAP、互联网 OAuth 或外部 OIDC。
```

改为：

```markdown
系统必须支持企业内网无公网环境部署；该前提为缺省与底线。例外经 ADR 显式修正：vNext M15
起云 LLM API 为可选通道（显式开启项，air-gapped 部署降级为仅内网自部署 LLM 通道，见
`docs/adr/0006-vnext-roadmap.md`）。身份源默认使用企业内部账号，不依赖飞书、企业微信、
LDAP、互联网 OAuth 或外部 OIDC。
```

另将 §1 中"同时提供 Web UI 与 C/S 客户端"所在句加时点标注（第三处标注）：

```markdown
系统同时提供 Web UI 与 C/S 客户端（桌面端交付时点见 `docs/adr/0006-vnext-roadmap.md`
M20+ 预留桶，vNext M12–M19 期间不排期）。
```

（以 constitution 现行原句为准做最小改写，保留原句其余内容；若原句措辞不同，只追加括号
标注不改原意。）

注意：**不改 §4** 的"业务模块不得直接调用 OpenIM"（该例外随 M13 的 IM 子 ADR 落，不在
本批）。

- [ ] **Step 2: 验证**

```bash
rg -n "0006-vnext-roadmap" docs/constitution.md
```

预期：恰好 3 处命中（§1 三个段落：IM 激活、内网前提、桌面端时点）。

```bash
rg -n "但当前不实现" docs/constitution.md
```

预期：0 处命中。

- [ ] **Step 3: Commit**

```bash
git add docs/constitution.md
git commit -m "docs: annotate constitution premises amended by ADR-0006

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: foundation-blueprint vNext 篇章

**Files:**
- Modify: `docs/foundation-blueprint.md:489-495`（`### vNext：平台愿景与交付强化` 整节替换）

**Interfaces:**
- Consumes: Task 1 的 ADR-0006（里程碑表）。
- Produces: blueprint 内 `### vNext（M12–M19，2026-07 重定义）` 小节，含每个里程碑的
  目标/交付/退出标准——后续里程碑 RFC 的门禁基准。

- [ ] **Step 1: 整节替换 vNext 段**

把 `docs/foundation-blueprint.md` 中 `### vNext：平台愿景与交付强化` 及其 5 个列表项
（当前 489-495 行）替换为：

```markdown
### vNext（M12–M19，2026-07 重定义）

> vNext 已由 `docs/adr/0006-vnext-roadmap.md` 从"愿景清单"重定义为双轨里程碑序列
> （🔧 横切基建与 📦 纵向组件交替）。设计推演见
> `docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md`；每个里程碑启动时按既有
> 流程产出 RFC（两轮独立评审），大组件 RFC 前置开源深评 spike（报告进 `docs/research/`）。

#### M12：可靠事件与多进程基建（🔧）

目标：进程内尽力而为事件升级为跨进程 at-least-once；IM webhook、Agent worker、SSE 多副本、
gateway 拆分的共同前置。

交付：事务性 outbox（按 schema 分治 + `@work/event-bus` 表工厂 + `publishInTx`）、按模块
实例化的中继（advisory lock 互斥、聚合分区键）、Redis Streams 驱动、消费三件套规范（幂等/
重试/死信，含无 schema 宿主的状态存储约定）、事件两级可靠性（critical / notify-only）、
SSE 多副本 fan-out、调度基建抽壳 `@work/scheduling`、**最小可观测性基线**（告警带外通道
拍板 + 指标/日志最小栈进部署基线 + 死信告警落地）、**CI 矩阵扩展**（Redis service + 多
进程 e2e 形态）与 `docs/testing-strategy.md` 补齐（统一 PG/Redis/OpenIM/k8s 各类 env-gate
的防假绿规约）、两个收口决策位（`apps/realtime-gateway` 处置三选一；Redis 持久化/备份
语义——在途事件丢失依 outbox 重发补齐的论证）。

退出标准：`presence.status.changed` 与 `profile.updated` 两条既有链路在"发布方进程 ≠
消费方进程"的部署形态下 e2e 跑通（该形态进 CI）；notification 调度迁移到
`@work/scheduling` 自证；一条死信经带外通道告警送达。

#### M13：IM 基座（📦）

目标：OpenIM Server 进入部署基线，平台身份/组织单向同步，IM 成为平台的可替换卫星服务。

交付：OpenIM 部署基线 + **备份/监控 runbook 与离线导入路径**（前置 spike 评估组件裁剪；
借此立项欠账的 `docs/offline-deployment-runbook.md`）、账号 provisioning（OpenIM userID =
平台 user id）、部门群同步（事件驱动 + 夜间对账）、token 换发（短 TTL）与撤销传播（禁用/
登出 → admin API 强制下线）、webhook 回流（默认仅账号/群组生命周期）、agent bot 消息回调
专线（签名校验 + 转发契约，echo 探针验收）；IM 消息留存/归档策略随 IM 子 ADR 拍板。

退出标准：平台建人/调部门后 OpenIM 侧自动一致；平台禁用用户后其 IM 会话失效；echo 探针
经回调专线往返成功。

#### M14：IM 体验（📦）

目标：员工在 Shell 内完成日常沟通。

交付：`modules/im/web` 聊天 UI（OpenIM JS SDK 以 npm 依赖引用；唯一获准直连 OpenIM 的
SDK 宿主）、会话/单聊/群聊/未读、站内通知可选 IM 投递（点亮 M7 预留接口位）；RFC 检查项：
**Chrome 109（Win7）× OpenIM JS SDK 实测**（wasm/SharedArrayBuffer/跨源隔离头 + 企业
反代），跑不通则显式豁免并同步 constitution §7 / architecture §3.3 清单；用户侧通知偏好/
免打扰在此一并拍板（做或显式后置）。

退出标准：一个真实部门可用 IM 日常沟通；通知触发点可配置投递到 IM；Win7 口径已拍板落档。

#### M15：Agent 基座 v1（🔧+📦）

目标：**数字员工**模型与运行时就位——常驻实例、k8s 全生命周期、平台能力三层供给；首个
数字员工（内置助手）在 IM 里帮员工干活。

交付：数字员工实例模型（`agent.*` schema：定义/实例/状态机 registered→provisioning→
running/idle→upgrading→suspended→archived）、**Agent Sandbox CRD 编排**（持久工作区 +
空闲缩零 + 快速恢复；`apps/agent-gateway` = 生命周期管理器 + 会话路由；SandboxDriver
三档：CRD / 裸 Pod / Docker）+ 沙箱 egress 白名单、pi harness（pi-ai + pi-agent-core，
版本锁定）、**能力供给单源三投影**（manifest `agentTools` → 平台 MCP server + `work-cli`
预装沙箱镜像 + AgentSkills 包，权限/审计继承既有管道）、Agent 双模式身份（委托令牌 +
审计双主体 + 平台锚定写确认；自主任职 `kind=agent` 账号只建模型）、首个数字员工（查在位/
查待办/代登记/代发审批，写操作带确认，全走委托模式）。**部署前置**：内网 LLM 推理端点
（专项 spike 产出的 GPU/模型/推理服务基线）与 k3s 基线 runbook（含 agent 持久卷备份）
先行到位。

退出标准：内置助手在 IM 中完成一次带确认的写操作，全链路审计含双主体；实例空闲缩零后被
@ 可秒级唤醒续聊（记忆在卷）；沙箱 Pod 无法触达白名单外网络；`work-cli` 在沙箱内以委托
令牌完成一次平台查询；以上验收在**内网缺省通道**上跑通。

#### M16：任务 + 日历 + 会议室（📦）

目标：自建日程/任务/会议室资源模块，补齐传统协作面。

交付：`modules/calendar`（RRULE 真源 + occurrence 物化窗口 + 会议室=资源日历 + `tstzrange`
排他约束冲突检测）、`modules/tasks`（指派/截止/我的待办聚合）、参与者制可见性与组织范围制
并存口径、提醒（M7 通知 + `@work/scheduling`）、邀约 IM 投递、`agentTools` 随模块出生。

退出标准：循环会议可预订会议室且冲突被拒；Agent 可完成"订一间明天下午的会议室"。

#### M17：数据引擎（🔧）

目标：bitable 动态物理表内核替换 forms 引擎（扩展不是重写的兑现）。

交付：`modules/bitable` contract + api（独立 `bitable.*` schema）、DDL 管理层（单一入口、
运行账号权限限定本 schema、配额/命名/审计）、字段类型系统与公式/视图（Teable 解剖 spike
产出搬运清单）、平台数据范围权限桥、员工档案槽位迁移（含 files 引用迁移，既有 UI 无感）。

退出标准：员工档案自定义字段在 bitable 引擎上读写，既有 UI 与 API 契约不破。

#### M18：多维表格 UI（📦）

目标：多维表格成为用户可直接使用的通用能力。

交付：网格视图（canvas + 虚拟滚动）、Kanban/表单视图、`modules/bitable/web` 挂 shell、
forms 填报页全部切换新引擎（日报/在位登记迁移，迁毕 forms 退役）、实时协同方案定型；
RFC 检查项：canvas 网格对 Win7/Chrome 109 引用 architecture §3.3 既有降级豁免并定义降级
形态（如表单视图兜底）。

退出标准：HR 可自建一张业务表并配视图；forms 模块退役且历史数据可读。

#### M19：自动化 + Agent v2（📦）

目标：表单、通知、审批在自动化收敛；数字员工全量开放为"组织按需配置的自动化工人"。

交付：when-trigger-then-action 引擎（bitable 子域；触发器=领域事件/记录变更/定时，动作=
通知/IM/创建记录/发起审批/调用 Agent）、数字员工自助注册/启用/停用 UI（指令 + 工具白名单 +
触发方式 IM @/定时/自动化动作）、**自主任职模式全量开放**（挂部门/配角色/接任务/出现在 IM
联系人，按自身角色权限行事）、Skills 覆盖面扩展到全模块、治理面板（实例清单/用量/审计/
配额）；RAG 知识库【预留：数字员工出现组织知识问答场景时触发，语料库定位（非用户文档
产品，见 product-requirements §5.6）】。

退出标准：一条"记录变更 → 通知 + 发起审批"自动化跑通；一名用户自助注册的数字员工以自主
模式完成一项定时任务，审计 `actor=agent` 可查。

#### M20+：持续项（🔧/📦 预留桶）

gateway 真拆分（ADR-0003）、桌面 Qt 客户端、多层部门完整展示、周报、Excel 批量导入、
看板高级筛选、日报 git-diff、内网交付强化（镜像裁剪/安装升级回滚演练，承接老 M8 交付
内容）。【均预留：按业务触发插入，不阻塞主线。】
```

- [ ] **Step 2: 验证**

```bash
rg -n "vNext（M12–M19" docs/foundation-blueprint.md
rg -n "平台愿景与交付强化" docs/foundation-blueprint.md
```

预期：第一条命中 1 处；第二条 0 处（旧节名已被替换）。

```bash
rg -c "^#### M1[2-9]" docs/foundation-blueprint.md
```

预期：8。

- [ ] **Step 3: Commit**

```bash
git add docs/foundation-blueprint.md
git commit -m "docs: redefine blueprint vNext chapter as M12-M19 dual-track milestones

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: product-requirements vNext 需求增量

**Files:**
- Modify: `docs/product-requirements.md`（§5 整节替换：163-168 行；§6 表 4 行更新：174-183 行）

**Interfaces:**
- Consumes: Task 1 的 ADR-0006。
- Produces: §5 各能力的需求条目（要什么/给谁/边界），供 M12+ 各 RFC 引用为需求依据。

- [ ] **Step 1: 替换 §5**

把 `## 5. vNext（远期愿景，本期不预留具体实现）` 整节（含 4 个列表项）替换为：

```markdown
## 5. vNext（2026-07 已激活规划，逐里程碑交付）

> 2026-07 起 vNext 不再是"远期愿景"：技术路线图见 `docs/adr/0006-vnext-roadmap.md`
> （M12–M19 双轨序列），本节按能力记录"要什么、给谁、边界"。各条目状态标
> 【vNext 已规划】——晚于 M11 交付，但数据模型/接口在对应里程碑 RFC 中正式定义。
> M12（可靠事件与多进程基建）为纯技术前置，无独立产品需求，不在本节列条目。

### 5.1 IM 即时通讯【vNext 已规划：M13-M14】

- 员工在工作台内完成单聊/群聊/未读管理；部门群随组织架构自动建群、同步成员。
- 账号与组织以平台为唯一真源（IM 侧无独立账号）；平台禁用即 IM 下线。
- 站内通知可按触发点配置投递到 IM；通知中心仍是事实源。
- **边界**：聊天内容不进平台审计/搜索（显式决策，内容级审计留预留接口位）；不做已读回执/
  音视频等高级能力的本期承诺。基座 OpenIM 独立部署、可替换。

### 5.2 AI Agent（数字员工）【vNext 已规划：M15、M19】

- **产品定位：数字员工**——常驻的智能工作伙伴（非一次性对话工具）：有名字、有记忆、可被
  @、可接任务，在 App 内注册/启用/停用，后台自动管理其运行环境的全生命周期。
- 第一阶段（M15）：平台内置数字员工挂在 IM 里，员工用自然语言查在位/查待办与日报/代登记
  状态/代发审批；一切变更类操作需本人确认后执行。
- 第二阶段（M19）：组织/用户可**按需注册**数字员工（自定义指令、工具白名单、触发方式：
  IM @/定时/自动化动作），可给它挂部门、配角色、指派例行工作；管理侧有实例清单/用量/审计/
  配额治理面板。
- **边界**：替人办事时权限永不超过发起用户本人（委托模式）；以自己身份任职时按自身角色
  权限行事、与人类员工同一套权限体系（自主模式）；所有操作可审计、可区分"谁的 Agent、
  替谁做的/自己做的"；LLM 双通道（云 API 可选开启、内网自部署为缺省）。

### 5.3 任务管理 + 日历 + 会议室【vNext 已规划：M16】

- 日程：个人/共享日历、循环日程、提醒；可见性为参与者制（组织者/参与人/忙闲）。
- 任务：指派、截止、我的待办聚合（与审批待办同屏）。
- 会议室：资源实体统一管理，预订冲突自动拒绝；可选审批联动（M11 事件）。

### 5.4 多维表格 + 自动化【vNext 已规划：M17-M19】

- 把 M6 动态表单升级为通用 `表/字段/记录/视图` 引擎（M17-M18），网格/Kanban/表单等多视图，
  HR 等有权限者可自建业务表；既有档案/日报/在位表单槽位平滑迁移，**是扩展不是重写**。
- 自动化流程（M19）：事件→动作（发通知、发 IM、建记录、发起审批、调 Agent）——**表单、
  通知、审批三者最终在此统一收敛**。
- **边界与口径**：交互与概念参考飞书多维表格与 apitable/Teable；Teable（AGPL，纯内部使用
  合规）经解剖 spike 后可成块搬运代码；apitable 维持"仅借鉴交互与概念，不轻易引入其代码"
  ——若 M17/M18 spike 结论确需搬运其协同引擎代码，须先在本文档增量中显式翻案。

### 5.5 仍属远期、本期不规划

桌面 Qt 客户端业务界面、部门多层嵌套完整展示、周报、Excel 批量导入（详见
`docs/foundation-blueprint.md` M20+ 预留桶）。

### 5.6 显式非目标（vNext 亦不做，登记以免反复被问）

- **云文档 / 知识库**（Feishu Docs/Wiki 类）：不做文档产品；结构化协作需求以多维表格
  （§5.4）承接。M19 给数字员工预留的"RAG 知识库"是 Agent 语料库，不是用户文档产品。
- **全局搜索**：不做跨 人员/消息/任务/日程/表格记录 的统一搜索。注意 IM 消息因隐私边界
  （聊天内容不回流平台，§5.1）**结构性**无法进入平台搜索——这是显式决策的隐含后果。
- **通知偏好 / 免打扰**：站内 + IM + Agent 消息三渠道叠加后的用户侧渠道偏好与免打扰设置，
  M14 通知 IM 投递落地时一并拍板（做或显式后置），本文档先登记不承诺。
```

- [ ] **Step 2: 更新 §6 表四行**

在 `## 6. 非目标 / 本期明确不做（含预留说明）` 表中，把以下四行的「状态」与「说明」更新
（其余行不动）：

| 行 | 新状态 | 新说明（替换原说明） |
| --- | --- | --- |
| 人对人即时聊天（IM） | vNext 已规划（M13-M14） | 本期（M5–M11）仍不做；vNext 经 OpenIM 接入，见 §5.1 与 ADR-0006。通知抽象层的干净接口即为其预留 |
| OpenIM 集成 | vNext 已规划（M13-M14） | 本期不做；vNext 作为独立部署的 IM Provider 接入（Server 为 Apache-2.0；JS SDK 为 AGPL，接入姿态与合规见 ADR-0006 及 IM 子 ADR） |
| 多维表格 / 任意表单生成器 | vNext 已规划（M17-M18） | 本期用固定槽位 + 前向兼容数据模型；vNext 升级为通用引擎，见 §5.4 |
| 桌面客户端 | vNext（M20+ 预留桶） | 设计上保持 web/桌面一致；未进入 M12–M19 序列 |

- [ ] **Step 3: 验证**

```bash
rg -n "vNext（2026-07 已激活规划" docs/product-requirements.md
rg -n "远期愿景，本期不预留具体实现" docs/product-requirements.md
rg -c "vNext 已规划" docs/product-requirements.md
```

预期：第一条 1 处；第二条 0 处；第三条 ≥7（§5 四个小节标题 + §6 三行）。另验证：

```bash
rg -n "云文档|全局搜索|免打扰" docs/product-requirements.md
```

预期：§5.6 三条均命中。

- [ ] **Step 4: Commit**

```bash
git add docs/product-requirements.md
git commit -m "docs: activate vNext requirements (IM, agents, tasks/calendar, bitable) per ADR-0006

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: foundation-progress 对齐

**Files:**
- Modify: `docs/foundation-progress.md`（§1 总览表 vNext 行；§6 末尾补一段）

**Interfaces:**
- Consumes: Task 1 的 ADR-0006。
- Produces: 进度看板与新路线图一致（SessionStart hook 注入的就是本文件，影响每个后续会话）。

- [ ] **Step 1: 更新 §1 总览表 vNext 行**

把总览表中：

```markdown
| vNext                       | 多维表格+自动化、周报、桌面端、外部 IM、内网交付强化                                                    | Pending     | 远期愿景，含老 M8 交付内容                                                                                                                                                     |
```

替换为（保持表格对齐可自行调整空格）：

```markdown
| vNext（M12–M19）            | 事件基建 → IM → Agent 基座 → 任务/日历/会议室 → 多维表格 → 自动化+Agent v2（双轨序列）                  | Planned     | 2026-07 由 ADR-0006 重定义并激活规划；周报/桌面端/内网交付强化进 M20+ 预留桶                                                                                                  |
```

- [ ] **Step 2: 在 §6「当前下一步」末尾追加一段**

在 §6 现有内容（"上一切片任务包"段之前的主体文字末尾，即 M9-2 相关段落之后）追加：

```markdown
**vNext 路线图已定（2026-07-06）**：`docs/adr/0006-vnext-roadmap.md` 把 vNext 重定义为
M12–M19 双轨序列（可靠事件基建 → IM 基座/体验 → Agent 基座 → 任务/日历/会议室 → bitable
数据引擎/UI → 自动化+Agent v2），设计规格见
`docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md`（两轮独立评审已落修）。vNext
文档与 spike 工作和 M10/M11 并行，互不阻塞；首个 spike 任务包见
`docs/tasks/vnext-spike-openim-deployment.md`。
```

- [ ] **Step 3: 验证**

```bash
rg -n "ADR-0006|0006-vnext-roadmap" docs/foundation-progress.md
```

预期：≥2 处（表行 + §6 段落）。

- [ ] **Step 4: Commit**

```bash
git add docs/foundation-progress.md
git commit -m "docs: align foundation-progress with ADR-0006 vNext roadmap

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: docs/research/ 目录 + 首个 spike 任务包（OpenIM 部署裁剪）

**Files:**
- Create: `docs/research/README.md`
- Create: `docs/tasks/vnext-spike-openim-deployment.md`

**Interfaces:**
- Consumes: Task 1 的 ADR-0006（三姿态与 spike 流程规范）。
- Produces: spike 报告模板与命名约定（`docs/research/<topic>.md`）；首个可执行 spike 任务包。
  注：其余三个 spike 任务包（agent-runtime / llm-inference / teable-anatomy）已由设计轨
  于 2026-07-06 直接产出并入库 `docs/tasks/`，README 表引用的路径均已真实存在，Task 8 的
  引用检查无需为它们豁免。
  （其交付物路径 `docs/research/openim-deployment-evaluation.md` 被任务包定义）。

- [ ] **Step 1: 写入 `docs/research/README.md`**

```markdown
# docs/research/ —— 开源深评 spike 报告

本目录承接 `docs/adr/0006-vnext-roadmap.md` 的流程规范：**每个大组件 RFC 前置一个开源
深评 spike**。spike 不是搜一圈博客——是把候选项目拉起来跑 + 读关键子系统源码，产出可
直接支撑 RFC 决策的清单。报告不定义新规则（权威性同 `docs/tasks/*.md`，见
`docs/doc-index.md` §1）。

## 报告命名

`docs/research/<topic>.md`，如 `openim-deployment-evaluation.md`、`teable-anatomy.md`、
`agent-runtime-evaluation.md`。

## 报告必含章节

1. **评审对象与版本**：项目、commit/tag、许可证（含子包差异）、维护活跃度实证。
2. **运行实证**：怎么跑起来的（compose/命令）、资源占用基线（内存/磁盘/CPU）。
3. **关键子系统解剖**：读了哪些源码路径、机制结论。
4. **可搬运清单**：哪些代码/设计可成块搬，预估缝合点。
5. **需自研清单**：哪些必须长在自有底盘上（权限/审计/组织模型接驳处）。
6. **风险清单**：许可、维护、升级、安全。
7. **对 RFC 的建议**：直接可写进对应里程碑 RFC 的决策建议。

## 已规划的 spike

| spike | 服务的里程碑 | 任务包 | 报告 |
| --- | --- | --- | --- |
| OpenIM 部署裁剪评估 | M13 | `docs/tasks/vnext-spike-openim-deployment.md` | `openim-deployment-evaluation.md`（待产出） |
| Agent 运行时评估（pi/OpenClaw 拓扑 + Agent Sandbox CRD/kagent 实测 + lark-cli 的 CLI/Skills 形态解剖） | M15 | `docs/tasks/vnext-spike-agent-runtime.md` | `agent-runtime-evaluation.md`（待产出） |
| 内网 LLM 推理基线评估（GPU 规格 × 候选模型中文/工具调用能力 × vLLM 等 OpenAI 兼容推理服务 × 离线权重导入；**M15 部署前置，带 go/no-go 判定**） | M15 | `docs/tasks/vnext-spike-llm-inference.md` | `llm-inference-baseline.md`（待产出） |
| Teable 解剖（DDL 层/公式/视图/协同） | M17-M18 | `docs/tasks/vnext-spike-teable-anatomy.md` | `teable-anatomy.md`（待产出） |

> OpenIM 与 LLM 两个 spike 须各自产出资源占用实测，汇总为 `docs/deployment.md`"vNext
> 部署基线与容量规划"的输入（单机堆叠 vs 拆机的判断依据）。
```

- [ ] **Step 2: 写入 `docs/tasks/vnext-spike-openim-deployment.md`**

```markdown
# 任务包：vNext spike —— OpenIM 部署裁剪评估（M13 前置）

状态：Ready ｜ 类型：研究型 spike（产出报告，不改产品代码）｜ 依据
`docs/adr/0006-vnext-roadmap.md` §2 流程规范与 M13 里程碑；报告规范见
`docs/research/README.md`。

## 1. 目标

回答 M13 RFC 的第一个拦路问题：**OpenIM Server 全家桶（Mongo/Kafka/MinIO/Redis）在
"几百人、单机内网、docker compose"的部署约束下能裁到多小、运维面有多大**。产出
`docs/research/openim-deployment-evaluation.md`。

## 2. 背景

- 平台现部署基线：单 PostgreSQL + Redis + Nginx 的 docker compose（`docs/deployment.md`）。
- OpenIM 是平台首次引入非 PG 持久化存储；ADR-0006 已把"部署基线扩展 + 备份 runbook"列为
  M13 一等公民交付物，spike 先行量化。
- ADR-0001 姿态不变：独立部署、REST/Webhook 接入、不接管账号。

## 3. 范围

**做**：

1. 用官方 docker compose 在本机拉起 OpenIM Server（记录版本/tag）。
2. 组件裁剪实验：逐项评估 Kafka（可否单副本/可否去除）、MinIO（可否复用平台 files 存储或
   本地盘）、Mongo（最小副本形态）、Redis（可否与平台 Redis 共享实例或必须隔离）。
3. 资源基线：空载与 50 并发模拟用户下的内存/磁盘/CPU 实测。
4. REST API POC：admin API 建用户、建群、发系统消息、签发用户 token 四条链路 curl 跑通。
5. Webhook POC：配置回调地址，实证"账号/群组生命周期事件"与"消息回调"两类 webhook 的
   触发形态与载荷（为 M13 agent bot 回调专线与 M15 取证）。
6. 备份/恢复初探：Mongo 与配置的最小备份恢复路径演练一次。

**不做**：JS SDK / 前端接入（M14）、与平台代码的任何集成、性能压测调优、高可用形态。

## 4. 交付物

`docs/research/openim-deployment-evaluation.md`，按 `docs/research/README.md` 模板七章
齐全；其中「对 RFC 的建议」章必须给出：推荐部署形态（组件清单 + compose 拓扑）、资源
基线表、备份策略建议、webhook 能力结论（含消息回调可行性——直接决定 agent bot 专线设计）。

## 5. 验收断言

1. 报告七章齐全，评审对象含精确版本 tag 与各组件许可证；
2. 资源基线为实测数据（含测量方法），非官方文档转抄；
3. 四条 REST 链路各附实际请求/响应片段（脱敏）；
4. webhook 两类回调各附一段实际载荷（脱敏）；
5. 组件裁剪结论逐项给出"可裁/不可裁/可共享"与依据；
6. 报告登记进 `docs/research/README.md` 的 spike 表（状态改「已产出」）。

## 6. 风险与注意

- 本 spike 在开发机/隔离环境进行，不触碰任何生产或共享环境；
- 不提交 OpenIM 源码或其镜像内文件进本仓库，只提交报告；
- 若官方 compose 在 Windows 本机不可用，允许在 Linux 虚拟机/服务器完成，报告注明环境。
```

- [ ] **Step 3: 验证**

```bash
ls docs/research/README.md docs/tasks/vnext-spike-openim-deployment.md
rg -n "openim-deployment-evaluation" docs/research/README.md docs/tasks/vnext-spike-openim-deployment.md
```

预期：两文件存在；报告文件名交叉引用在两个文件中都命中。

- [ ] **Step 4: Commit**

```bash
git add docs/research/README.md docs/tasks/vnext-spike-openim-deployment.md
git commit -m "docs: add research spike methodology and OpenIM deployment spike task package

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: doc-index 收纳

**Files:**
- Modify: `docs/doc-index.md`（§1 优先级清单、§2 阅读路径、§3 职责表、§7 已补齐清单）

**Interfaces:**
- Consumes: Task 1-6 产出的全部文件路径。
- Produces: 文档索引闭环（后续会话/评审者按 doc-index 能找到全部新文档）。

- [ ] **Step 1: §1 优先级清单补 research**

在 §1 第 10 条（runbooks）之后、第 11 条（verification-log）之前插入：

```markdown
11. `docs/research/*.md`：开源深评 spike 报告，支撑对应里程碑 RFC 的决策输入；不定义新规则，权威性同任务包。
```

原第 11 条顺延为第 12 条。

- [ ] **Step 2: §2 补 vNext 阅读路径**

在 §2.10 之后追加：

```markdown
### 2.11 开始 vNext 里程碑（M12+）

​```text
docs/adr/0006-vnext-roadmap.md
docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md
docs/foundation-blueprint.md（vNext 篇章 M12–M19）
docs/product-requirements.md（§5）
docs/research/README.md 与该里程碑对应 spike 报告
该里程碑子 ADR 与 RFC（启动时产出）
​```
```

（注意：实际写入时代码围栏用正常三反引号，此处为嵌套转义。）

- [ ] **Step 3: §3 职责表补一行**

在 `docs/runbooks/*.md` 行之后加：

```markdown
| `docs/research/*.md`           | 开源深评 spike 报告          | 每个大组件 RFC 前置 spike 完成时       |
```

- [ ] **Step 4: §7 已补齐清单追加三条**

在 §7"已补齐"列表末尾（M9-2 条目之后）追加：

```markdown
- vNext 技术路线图 ADR：`docs/adr/0006-vnext-roadmap.md`（M12–M19 双轨序列、开源接入三姿态、
  子 ADR 立项、constitution §1 前提修正；设计规格
  `docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md`，两轮独立评审已落修）
- 开源深评 spike 规范：`docs/research/README.md`（报告模板七章 + 已规划 spike 清单）
- vNext 首个 spike 任务包：`docs/tasks/vnext-spike-openim-deployment.md`（OpenIM 部署裁剪
  评估，M13 前置；产出 `docs/research/openim-deployment-evaluation.md`）
```

- [ ] **Step 5: 验证**

```bash
rg -n "docs/research" docs/doc-index.md
```

预期：≥4 处（§1、§2.11、§3、§7）。

```bash
rg -n "0006-vnext-roadmap" docs/doc-index.md
```

预期：≥2 处。

- [ ] **Step 6: Commit**

```bash
git add docs/doc-index.md
git commit -m "docs: index ADR-0006, research directory and vNext spike task package

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 全量交叉引用验证 + 独立评审

**Files:**
- Modify:（仅在评审发现问题时修正 Task 1-7 的产出文件）

**Interfaces:**
- Consumes: Task 1-7 全部产出。
- Produces: 验证通过的文档集，可发 PR。

- [ ] **Step 1: 交叉引用完整性检查**

```bash
# 新文档引用的所有 docs/ 路径必须真实存在
rg -oN "docs/[A-Za-z0-9/_.-]+\.md" docs/adr/0006-vnext-roadmap.md docs/research/README.md docs/tasks/vnext-spike-openim-deployment.md | sort -u | while read -r f; do [ -f "$f" ] || echo "MISSING: $f"; done
```

预期：除以下**三条预期豁免**外无 `MISSING:` 输出（均为已立项、待后续里程碑产出的文件，
被 ADR/README 前向引用属设计使然）：
- `docs/research/openim-deployment-evaluation.md`（spike 报告，spike 执行时产出）
- `docs/testing-strategy.md`（M12 补齐，doc-index §7 欠账）
- `docs/offline-deployment-runbook.md`（M13 立项，doc-index §7 欠账）
出现第四条 MISSING 才算失败。

```bash
# 六个被改/新建文档全部指回 ADR-0006
rg -l "0006-vnext-roadmap" docs/ | sort
```

预期：至少包含 `docs/adr/0006-vnext-roadmap.md`、`docs/constitution.md`、
`docs/foundation-blueprint.md`、`docs/product-requirements.md`、
`docs/foundation-progress.md`、`docs/doc-index.md`、`docs/research/README.md`、
`docs/tasks/vnext-spike-openim-deployment.md`。

- [ ] **Step 2: 独立 sub-agent 文档评审（用户硬规约：不得自己审自己）**

用 Agent 工具 spawn 一个独立 general-purpose sub-agent，prompt 要求：通读本批 7 个 commit
的 diff（`git diff <起点>..HEAD -- docs/`），对照
`docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md` §13 与 doc-index 防冲突规则，
检查：① spec §13 第一批落点是否全部落地且无擅自扩权（本批不该动 security-baseline /
AGENTS.md / architecture / module-contract）；② 新旧文档间有无口径矛盾（尤其 constitution
修正措辞 vs ADR-0006、blueprint 里程碑表 vs product-requirements §5 的 M 编号）；③ 有无
违反"预留必须写用途与触发条件"的条目。输出 Critical/Major/Minor 清单。

- [ ] **Step 3: 落修评审发现（若有），逐文件修正并 commit**

```bash
git add -A docs/
git commit -m "docs: apply independent review fixes to vNext documentation batch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

（若评审零发现则跳过本步。）

- [ ] **Step 4: 汇报**

向用户汇报：全部 commit 清单、评审结论、建议下一步（发 PR 到 main 走既有 review 流程；
PR 合并后 vNext 文档基线生效，spike 任务包可排期执行）。

---

## Self-Review 记录

- **Spec coverage**：spec §13 第一批 = ADR-0006（Task 1）、constitution §1（Task 2，§13.8
  中"随 ADR-0006"的部分）、blueprint（Task 3）、product-requirements（Task 4）、research
  目录与首个 spike（Task 6）、doc-index 收纳（Task 7）。§13 其余项（security-baseline、
  子 ADR、architecture、deployment、module-contract、AGENTS.md §7 例外）均显式"随对应
  里程碑"，不在本批——已在 Task 8 评审要点①中反向断言"本批不该动它们"。
- **Placeholder 扫描**：全部文稿为完整正文，无 TBD/待补；spike 任务包的"待产出"指其
  交付物报告，属任务定义而非计划占位。
- **一致性**：M 编号（M12–M20+）、文件路径（`0006-vnext-roadmap.md`、
  `vnext-spike-openim-deployment.md`、`openim-deployment-evaluation.md`）在各任务间已
  交叉核对一致；三处拍板（回调直连专线/平台锚定确认/bitable 子域自动化）在 ADR 与
  blueprint 文稿中口径一致。
