# ADR 0009: Agent 身份、工具面与运行时编排（数字员工）

## 状态

Accepted（两轮独立评审已修订 + 两项拍板，2026-07-07）｜ 起草 2026-07-07 ｜ 依据 `docs/adr/0006-vnext-roadmap.md`
§4.3 立项（**对 ADR-0004 的显式扩展**，安全基线第二次大扩展）；实证输入
`docs/research/agent-runtime-evaluation.md`（2026-07-06 spike）；设计推演
`docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md` §8。

> 编号说明：ADR-0007 已由 M12 RFC 钦定给"事件传输选型"（将随 M12-1 入库）；ADR-0008 按
> ADR-0006 §4 顺位保留给"IM 集成边界"（等 OpenIM spike 回流）。本 ADR 提前于 0008 起草
> 是刻意的：其全部输入已齐（agent-runtime spike + 2026-07-07 LLM 通道拍板），而 0008 还在
> 等 spike；两者的唯一交叠（agent 的 IM 账号 provisioning）以联合决策位切分（§D10）。

> 本 ADR 的 **两个拍板项已定（2026-07-07 产品负责人）**：① agent 主体落位 = `employees`
> 扩 `kind` 列 + 默认排除（§D2）；② 云 LLM prompt 数据类别白名单初版 = 组织架构 + 在位
> 状态 + 任务/日报元数据 + **档案联系方式**四类可发，表单/审批正文与文件内容默认不发
> （M19 重议）、凭据/密钥/审计日志永不（§D6）。

> 一审（独立 sub-agent，2026-07-07）发现并已修订：**C1** D2 默认排除被通知收件人解析
> 绕过（部门负责人/角色两条非 UI 路径，执行面上升为"一切产生对人可投递效果的解析点"、
> 点名 `PlatformOrgPort` + M7 `RecipientResolver`，§D2）；及 **M1** D6 未对用户自带内容
> 诚实划界（补边界声明 + spec §14 上下文最小化，§D6）、**M2** 级联吊销依赖未建原语
> （用户侧会话吊销/禁用联动是前置，§D3/§D11）、**M3** single-use 与多轮工具调用的 TTL
> 矛盾（精确化为"每消息单枚、覆盖整个 loop 窗口、不可跨消息复用"，§D3）、**M4** 进程内
> 内存态跨用户串未处置（补内存隔离口径 + 升级判据，§D5）。minor（审计物理列名 vs 语义、
> 自主会话 `user_id` 取值、认证路径风险提示、确认防重放成文、drain 回指）一并落修。

> 二审（换视角独立 sub-agent：安全实施负责人 + 修订验证者，2026-07-07）验证一审 6 命门
> 修复"全部扎实落地、无新矛盾"，结论可交拍板；发现 4 个"补文字不改决策"的完备性/一致性
> 缺口并已修订：**M-1** 令牌窗口×级联吊销×introspection 缓存 TTL 链路未闭环——补"吊销
> 即时性 = 两窗口取长边"的诚实声明（§D3，这是作为 0004 扩展最该补的一笔）、**M-2**
> `audit_logs` 三列可空性/回填未交代——补对齐 D3 sessions 详尽度的列定义（§D9）、**M-3**
> §影响风险例子没跟上 C1（补"通知收件人"非 UI 面到最前，§影响）、**M-4** security-baseline
> §16 门禁清单不覆盖 D6/D2 新维度——补"§16 须新增两项门禁"（§与其它决策）。minor（白名单
> 表补日程/会议占位、行号精度、编号时态、introspection 缓存物理位置澄清）一并落修。

## 背景

ADR-0006 拍板 Agent = **数字员工**：常驻实例、有身份、有记忆、App 内注册/启用/停用，
k8s 全生命周期管理，平台能力以 CLI/Skills/MCP 喂给 Agent。这带来安全基线自 M0 以来的
第二次大扩展：平台要出现**非人类主体**，它既能"代人办事"（委托）也能"以自己身份任职"
（自主），而承载它的运行时是平台第一次引入的沙箱化常驻工作负载。

2026-07-07 增补拍板（ADR-0006 状态节）改变了一个前提：LLM 采购**线上 API 为主通道**、
放弃内网自部署——"哪些数据类别可进 prompt"从可选通道的开启声明升级为**主通道硬边界**，
归本 ADR 拍板。

spike 实证输入（`agent-runtime-evaluation.md`）：Agent Sandbox CRD v0.5.0 唤醒 p95 2.97s
过 5s 红线（k3d/runc，20 样本）；Secret/env 注入被实测证明不适合逐消息委托令牌（env 不
热更、volume 落盘）；pi 0.80.3 的会话库**没有 user/tenant 强制边界**（宿主必须自己钉
目录根）；隔离与令牌是**两个正交轴**，不是三选一。

现状事实（决策的锚点）：

- 平台**无独立 users 表**——"用户"即 `platform.employees`（`platform.schema.ts:52`），
  `local_identities.user_id` 一对一挂 employees（`:81-82`），RBAC/数据范围/审计全部围绕
  employees 主键。
- `platform.audit_logs` 只有单主体 `actor_user_id/actor_account`（`:193-194`），无
  onBehalfOf 概念。
- 跨进程鉴权 = phantom token（ADR-0004）：对外 opaque + `GET /api/platform/auth/me`
  introspection（返回 `CurrentUserDto`）+ 缓存 TTL ≤ 60s；即时撤销是 security-baseline
  §4.1 的硬要求。

## 决策

### D1 身份双模式，令牌真源唯一（platform-api）

数字员工的两种行事模式在**令牌形态与审计形态**上强制区分，签发与存储只在 platform-api：

| | 委托模式（代人办事） | 自主模式（以自己身份任职） |
| --- | --- | --- |
| 触发 | 用户在 IM/平台里让 Agent 替自己做事 | 定时/事件触发，M15 只建模型、M19 开放业务 |
| 权限 | **用户权限 ∩ Agent 工具白名单**，永不超过用户本人 | Agent 自身角色权限（同一套 RBAC/数据范围） |
| 审计 | 双主体 `actor=agent:<id>, onBehalfOf=user:<id>` | 单主体 `actor=agent:<id>` |
| 令牌 | **委托令牌**：短时效、逐消息、级联吊销（D3） | agent 会话令牌：platform-api 直发，无密码登录路径 |

### D2 agent 主体落位 = `employees` 扩 `kind` 列 + 默认排除（拍板项①，附建议）

两个候选的实质差别是"复用底盘的代价付在哪"：

- **(a) `employees` 加 `kind` 列**（`'human'|'agent'`，缺省 `'human'`）【建议】：RBAC、
  数据范围、审计外键、部门挂载、IM 同步全部**天然复用**，不改任何权限表结构。代价 =
  agent 默认会出现在**一切消费 `employees` 主键并产生对人可见/可投递效果**的解析点上，
  必须配**默认排除机制**——执行面**不止**"员工查询面"（名册/看板/日报需报/组织树/统计/
  导出），**必须显式含非 UI 的解析路径**，已知至少三处（一审 C1 证实的破面）：
  - `PlatformOrgPort.resolveDepartmentManager`（`platform-org-lookup.service.ts:9-38`，
    今仅校验 `status='active'`、无 kind 过滤）——agent 若挂部门负责人（D1 自主模式明说可
    挂部门配角色），该部门成员的 subject 事件会把 agent 解析成**通知收件人**（M7
    `RecipientResolver` 的 `department_manager` 分支，`recipient-resolver.ts:23-30`）；
  - `PlatformOrgPort.listUserIdsByRole`（`platform-org-lookup.service.ts:41-61`）——自主
    agent 持角色即被 M7 `role` 分支纳入收件人；
  - 通用读路径 `listEmployees()`（`platform.repository.ts:86`，今**无 kind/includeAgents
    形参**）是上述两者的共同根，默认排除要下刀的第一处。
  机制 = 这些解析点缺省过滤 `kind='human'`、需要 agent 的面**显式 opt-in**
  （`includeAgents`），守护测试锁住（含一条"agent 挂部门负责人/持角色时不得被解析为通知
  收件人"）。逐面**完整**清单归 M15/M19 RFC，但"执行面含非 UI 解析路径"这条原则在此定死
  ——否则本选项"付一次性代价换全栈复用"的论证不成立（代价随每个新 `employees` 消费点
  复发）。agent 主体**不建 `local_identities` 行** ⇒ 密码登录路径天然不存在。
- (b) 独立 `agent.agents` 实体、platform.employees 不动：默认排除免费得到，但
  `user_roles`/scope resolver/审计外键都要支持第二种主体（多态外键或影子行）——等于
  重造半套权限系统，直接违背 ADR-0006"复用平台底盘而非另造 Agent 权限系统"的拍板。

**拍板 (a)（2026-07-07 产品负责人）**。这是 platform schema 变更：过 doc-index §5 文档
审查、security-baseline §16"先改文档再动代码"门禁，随 M15 首切片落地。`agent.*` schema
仍然存在（D9），但存的是**治理数据**（实例状态机/沙箱编排/用量），不是身份——身份只有
一处真源。

### D3 委托令牌 = opaque 变体 + introspection 扩展（ADR-0004 的显式扩展）

- **形态沿 ADR-0004 不变**：opaque、存 `platform.sessions`、hash 落库——理由与 0004 相同
  且更强：级联吊销是委托令牌的硬语义，JWT 撤不掉。sessions 表扩列：
  `kind`（`user|agent_delegated|agent_autonomous`）、`agent_id`、`parent_session_id`
  （委托令牌指向派生它的用户会话）。**`user_id NOT NULL`（`0000_init_platform.sql:120`，
  `ON DELETE CASCADE`）无需放松**——正因 D2(a) 让 agent 是 employees 行：委托会话
  `user_id=委托人 id` + `agent_id` + `parent_session_id`，自主会话 `user_id=agent 自身
  employees id`（D2(a) 对 D3 的正向支撑）。`ON DELETE CASCADE` 与 D11 owner 转移/归档的
  交互见 D11。
- **级联吊销**：用户登出/被禁用/会话失效 ⇒ 按 `parent_session_id` 级联删除全部派生委托
  令牌行；opaque + introspection 使吊销即时生效（缓存 TTL ≤ 60s 的窗口沿 0004 上限）。
  **前置警示（一审 M2）**：用户侧会话吊销/禁用联动（写 `sessions.revoked_at`）**当前未
  实装**——`AuthService` 今天只有 login/authenticate/changePassword，无 logout/revoke，
  `revoked_at` 列存在但全库无写入方（`postgres-platform.repository.ts:707` 仅读它作过滤）。
  故委托令牌级联吊销实为**两件事**：先补齐用户侧会话吊销 + 禁用联动（禁用用户 → 批量
  吊销其 session），再叠子级 `parent_session_id` 级联——两者均随 M15 首切片建，不是对既有
  能力的纯扩展。
- **吊销即时性的折扣（二审 M-1，须显式接受）**：ADR-0004 的"即时撤销"承诺在委托令牌上
  **打折**——吊销生效最坏时延 = **两窗口取长边** `max(introspection 缓存剩余 TTL≤60s, 消息
  级令牌的 loop 窗口剩余·分钟级)`。即用户被禁用/吊销后，最坏情况在该时延内派生委托令牌
  仍可对平台发起授权调用。此为 opaque + introspection + 分钟级令牌窗口三者的组合残余，
  **显式接受**（缩短窗口的代价——每调用换新令牌 / 缓存 TTL 归零——不划算）；零容忍的高敏
  工具走 D5 升级档（按用户实例化 + 更短令牌窗口）另计。
- **逐消息下发、不落卷**（spike 实证采纳）：委托令牌经 agent-gateway 的**内存控制通道**
  随单条消息下发进沙箱；**令牌粒度 = 每消息单枚**（jti 绑定该消息），**TTL 覆盖该消息的
  整个 agent-loop 处理窗口（含 3–10 轮工具调用，spike §2.1 实测单会话 5 次调用、窗口可达
  分钟级），窗口内该枚令牌可复用于对平台的多次授权调用**——"single-use"指**不可跨消息
  复用**，非每次 API 调用换新令牌（后者对 introspection 压力与内存驻留都不划算）；ack 或
  超时后作废、内存清零。**不注入 Secret/env、不写持久卷**（spike 证明 env 不热更、volume
  落盘且轮换粗）。断线/超时 = 令牌自然过期，不依赖沙箱配合。
- **introspection 扩展**：沿 0004"复用 `/auth/me` 不新建端点"的取舍——`CurrentUserDto`
  扩展为可辨识主体形态（`principalKind` + `onBehalfOf`），gateway `PlatformAuthGuard` 与
  scope 管道透传双主体；业务模块经既有 `@RequirePermissions` + scope 管道消费，**不为
  Agent 重写授权**。**扩展落地前的风险须严防（一审 m3）**：现
  `authenticateAccessToken`→`toCurrentUser` 对任意 employees 行都装配完整人类主体（无
  principalKind 分支），故 **agent 主体绝不得经普通 `createAccessSession` 路径拿到
  `kind='user'` 型令牌**——否则 introspection 会静默把它当完整人类主体解析。这是"令牌真源
  唯一 + 无密码登录路径"（D1/D2）的另一面防线。
- 控制通道传输形态：**gRPC bidi streaming**（spike 建议采纳：类型与 backpressure 清晰）；
  必须支持 message-bound token、ack、TTL、断线清理——若 M15 RFC 实装中发现内网基建约束
  （反代/证书），可在保持这四个语义不变的前提下换 mTLS WebSocket，不回本 ADR。

### D4 运行时编排 = SandboxDriver 三档，CRD 主线有条件转正

- 抽象边界 = `SandboxDriver`（沿双实现模式）：**Agent Sandbox CRD v0.5.0 主线**（exact
  pin）/ 裸 Pod + PVC + NetworkPolicy fallback / Docker 开发档。
- CRD **生产准入门槛**（spike 数字为 k3d/runc 单机，不外推）：目标 Linux/k3s 上 30 次
  唤醒 p95 ≤ 5s + 一次 v0.4.x→v0.5.0 迁移演练 + gVisor/Kata 取舍完成；不过门槛切裸 Pod
  fallback。
- 持久工作区 = PVC 直挂 Sandbox（**不走 warm pool**——spike 证实 PVC 与 warm pool 冲突，
  warm pool 只留给未来无状态预置层）；升级 = 换镜像重建，状态在卷；**升级时在途会话的
  drain/切换语义归 M15 RFC**（spec §8）。
- egress 白名单闭环（2026-07-07 拍板后收窄）：仅 ① 云 LLM API 域名 ② 平台 MCP/API 端点
  ③ agent-gateway 控制通道。不给 DB、不给内网横向、不给其余公网。

### D5 隔离模型 = 两个正交轴的组合（spike 结论采纳）

不是"按用户实例化 / 会话分区 / 令牌下发"三选一：

- **数据隔离轴**：常规数字员工 = 单 Agent 实例 + **用户会话/记忆强分区**——会话目录根由
  宿主钉死为 `/workspace/users/<user-id>/sessions`，路径不受模型控制（pi 库本身无 tenant
  边界，spike 实证）；记忆不跨用户。**落盘分区不等于隔离闭环（一审 M4）**：单实例是一个
  常驻进程，进程内内存态（pi 进程内对话上下文对象、任何缓存）在多用户消息复用同一实例时
  同样是跨用户面（spike §7.2 把"缓存/记忆串用户"列为本档主要坑）。口径分**两处物理位置**
  （二审 m-4）：**沙箱 pi 进程内** = 每消息处理后清理进程内对话上下文；**gateway 的
  introspection 缓存**（ADR-0004 §4.4，物理位置在 gateway、非沙箱内）= 按令牌主体分键、
  不跨主体复用。**进程内内存隔离难以证明时并入下方"升级为按用户实例化"的触发判据**。
- **授权轴**：逐消息委托令牌（D3）解决授权与撤销——它不解决记忆隔离，两轴缺一不可。
- **升级档**：高敏工具、"跨用户记忆隔离难以证明"、或"进程内内存隔离难以证明"的场景 ⇒
  按用户实例化。触发判据 = **工具风险级别**（非全体 Agent 一刀切）；初始敏感工具清单归
  M15 RFC。
- 持久记忆与 spec §14"会话上下文最小化"的张力，解法即上述分区：记忆按用户分区后，
  上下文注入面 = 单用户自己的历史，不产生跨用户聚合面。

### D6 云 LLM prompt 数据类别硬边界（拍板项②，机制在此定死）

机制（不待拍板即定）：

1. 每个 `agentTools` 工具声明其输出的**数据类别**（`dataClasses`，随 D7 工具元数据）；
2. agent-gateway/工具管道在把工具结果组装进 prompt 前，按**企业级白名单**过滤：不在
   白名单的类别拒绝进 prompt（工具直接拒绝执行或结果脱敏，按类别配置）；
3. 白名单变更是配置化管理动作，落审计；
4. 出网内容不落平台业务库（与 IM 隐私边界同姿态），但**出网事实**（何工具/何类别/何
   agent/何用户）进 `agent.*` 用量记录。

**边界诚实声明（勿夸大）**：本白名单只约束**平台工具取回**的数据进 prompt；**用户在 IM
消息里自带的内容不在此机制管辖内**（用户可粘贴任意数据，含表中标 ❌ 的类别）。用户自带
内容的风险由**会话上下文最小化**（spec §14 的另一半缓解——本 D6 只搬了"工具输出白名单"
这一半，须补引 §14 提示注入行）+ 双主体审计 + egress 白名单纵深兜底，细化归 M15 RFC。
故 §影响不表述为"数据出网有完整硬边界"，而是"**工具取回面**有类别硬边界、用户自带面靠
纵深防御"。

白名单初版（**须产品负责人拍板**，候选如下——默认从紧）：

| 数据类别 | 拍板（2026-07-07） | 说明 |
| --- | --- | --- |
| 组织架构（部门/姓名/职务） | ✅ 可发 | 内置助手查询类场景的最小必需 |
| 在位状态与登记记录 | ✅ 可发 | M15 首个场景 |
| 任务/日报元数据（标题/状态/期限） | ✅ 可发 | 不含正文 |
| 档案联系方式（手机/邮箱） | ✅ 可发 | **产品负责人拍板开**；属 PII、出网面较初版建议扩大，`agent.*` 用量记录须能按此类别回溯何 agent/何用户的调用 |
| 表单/审批正文、文件内容 | ❌ 默认不发 | M15 无场景；M19 重议 |
| 凭据/密钥/审计日志 | ❌ 永不 | 硬编码禁止，不入白名单机制 |

> 日程/会议/参与者类 M16 引入 calendar 时按本机制增行（默认 ❌，同联系方式姿态）；本表
> 只覆盖 M15 已有数据面，非完整全集。

### D7 平台能力供给 = 单源三投影（manifest `agentTools` 唯一定义源）

- 模块 manifest 声明 `agentTools`，每个工具绑定：`permissionCode`、`dataType`（数据范围
  语义）、`readOnly/write`、`confirmationPolicy`、`auditAction`、`dataClasses`（D6）。
- 三投影由同一声明编译：**MCP server**（gateway-api 聚合——manifest 组合宿主是 gateway-api
  而非 agent-gateway）/ **`work-cli`**（薄壳包公开 API，预装沙箱基础镜像，鉴权只读进程内
  短期注入令牌、**不持久化**）/ **AgentSkills 包**（`SKILL.md + references/ + scripts/`
  渐进加载，只组合命令、不复制 endpoint/权限/schema、不含 secret）。
- **生成快照测试**保证三投影同源不漂移（lark-cli 形态基准，spike §3.5/§7.3 采纳）。
- 授权与审计**继承** `@RequirePermissions` + scope 管道；工具 = 既有 service 薄适配器。
- 规范归属 `docs/module-contract.md`（manifest 扩展 + CLI/Skills 交付标准），随 M15 落。

### D8 写操作确认信任锚 = 平台锚定（spec 拍板记录为决策）

变更类工具的确认卡片只承载**平台深链**，用户携平台会话在平台侧完成确认——OpenIM 不进
写授权 TCB（回调签名只能证明消息来自 OpenIM Server，证明不了用户本人点了确认）。**防重放
语义定死（一审 m4，细节下沉 M15 RFC）**：服务端存储待确认操作的**规范化快照**（工具名 +
规范化参数 + 目标资源 id + 派生委托令牌 jti），确认深链只带不可猜的 confirm id；用户回传
时**服务端**比对快照一致 + 标记消费（单次有效），杜绝"参数被替换后重放"与"同一确认重复
提交"。确认动作落审计（双主体）。**IM 内联按钮直接确认**保持【预留】：启用条件 = 后续
ADR 论证把 OpenIM 纳入确认 TCB 的前提（端到端签名可验 + 用户身份绑定强度），本 ADR 不
开洞。

### D9 `agent.*` schema 归 agent-gateway，审计分层

- `agent.*` schema（实例定义/状态机/会话元数据/工具调用用量/出网记录）由
  `apps/agent-gateway` 拥有，独立迁移入口 `db:migrate:agent`——与 platform-api 拥有
  `platform.*` 同构；schema-per-module 纪律不破。
- **审计分层**：平台侧敏感写仍走 `platform.audit_logs`，增两物理列（对齐 D3 sessions 的
  可起草粒度——二审 M-2）：
  - `actor_kind varchar(16) NOT NULL DEFAULT 'human'`（CHECK `IN ('human','agent')`，存量
    行回填 `'human'`）；
  - `on_behalf_of_user_id uuid NULL REFERENCES employees(id)`（仅委托模式有值；D2(a) 让
    agent 也是 employees 行 ⇒ 外键自洽）；
  - 既有 `actor_user_id` **当前已可空**（`platform.schema.ts:193` 无 `.notNull()`）——agent
    行填 **agent 自身 employees id**、靠 `actor_kind='agent'` 辨识主体（映射 §D1 展示语义
    `actor=agent:<id>`）；委托行 `actor_user_id=agent id` + `on_behalf_of_user_id=委托人 id`。
  - 迁移方向 = 一次加两列 + 回填 `actor_kind='human'`，对存量无约束冲突、零停机。
  物理列名 vs §D1 展示语义勿混。此为 platform schema 变更，随 D2 同批过文档审查。agent 的
  **全量**工具调用流水（高频、含查询类）进 `agent.tool_invocations`，保留期短（用量与治理
  用途），不灌爆平台审计表。增长预算数字归 M15 RFC。
- pi 会话文件与记忆留沙箱持久卷（不进库）；卷的保留/删除/owner 离职处置见 D11。

### D10 IM provisioning 联合决策位的切分（与 ADR-0008 的接口）

本 ADR 定 Agent 侧契约：agent 注册/启用时经 `@work/im-provider` 申请 bot 账号（昵称/头像
取自 agent 定义，无档案）、回调白名单随实例状态**动态维护**（启用加白、停用摘除）、转发
契约携**收件 agent 标识**（M19 多数字员工路由）。OpenIM 侧怎么实现（admin API 面、账号
形态、回调配置）归 ADR-0008；两边以 im-provider 接口为界，任何一侧变更不穿透。

### D11 owner 生命周期联动（硬语义）

- 每个 agent 实例必有 owner（用户或组织管理位）；**owner 失效（离职/停用）⇒ 委托模式
  即刻不可用**（委托令牌级联吊销经 D3 的前置——用户侧会话吊销/禁用联动——实现后随之
  发生，非"天然"）+ 实例转 `suspended`。另注 `sessions.user_id ON DELETE CASCADE`：物理
  删除 employees 行会连带删其 session，故 owner 转移/agent 归档走**状态置位**（`archived`/
  转移 owner 外键），不走删行。
- 自主任职 agent 的 owner 转移是**离职流程检查项**（platform 侧离职面新增）；**无有效
  owner 的实例不得处于 running**——状态机守护，不是流程建议。
- 沙箱持久卷在实例 `archived` 后按保留期删除；owner 离职时卷内用户分区数据的处置
  （交接/删除）归 M15 RFC 细化，缺省 = 冻结待 owner 继任者裁决。

## 拍板项（2026-07-07 已定）

1. **agent 主体落位**（D2）= **`employees` 扩 `kind` 列** + repository 默认排除 + 守护
   测试；备选独立实体已论证为"重造半套权限系统"，未采纳。
2. **云 LLM prompt 数据类别白名单初版**（D6 表）= 组织架构 + 在位状态 + 任务/日报元数据
   + **档案联系方式**四类可发；表单/审批正文与文件内容默认不发（M19 重议）、凭据/密钥/
   审计日志永不。机制已定死，白名单内容随场景增删（M16 日程类按同机制增行、默认从紧）。

## 关键取舍

- **为什么委托令牌不用 JWT**：与 ADR-0004 同理且更强——级联吊销是委托语义的核心，
  引用令牌查表即吊销；JWT 需叠加黑名单反而复杂。逐消息 + 短 TTL 已把 introspection
  压力限制在单消息窗口内。
- **为什么 kind 列而非独立实体**：付"默认排除"的一次性代价（repository 过滤 + 守护
  测试），换权限/范围/审计/组织全栈零改动的复用；独立实体把代价摊进每一张权限表。
- **为什么单实例 + 分区是缺省而非按用户实例化**：几百人 × 人手一实例的 PVC/对象/升级
  成本不成比例（spike §7.2 成本行）；分区 + 逐消息令牌覆盖常规场景，高敏升级路径保留。
- **为什么确认锚在平台**：OpenIM 是可替换卫星（ADR-0001/0006），写授权 TCB 必须收在
  自有信任域内；深链多一跳换 TCB 不扩大，值。

## 与其它决策的关系

- **ADR-0004**：本 ADR 是其显式扩展——opaque + introspection + `/auth/me` 复用三个取舍
  全部沿用，扩展的是主体形态（`principalKind`/`onBehalfOf`）与 sessions 表列。
- **ADR-0006**：落实其 §4.3 立项清单全部条目；2026-07-07 LLM 拍板的数据边界义务由 D6
  承接。
- **ADR-0008（IM 集成边界，待产）**：D10 定义了接口切分。
- **security-baseline**：§4（委托/自主令牌、级联吊销、撤销窗口）、§5（agent 主体授权
  口径 + 默认排除原则）、§11（云 LLM API key、沙箱令牌注入姿态、控制通道凭据）三处正文
  增量随 M15 首切片**同批改文档**；**§16 变更门禁清单本身须新增两项**（二审 M-4：现 §16
  八项无一覆盖 D6/D2 的新维度）——『变更云 LLM prompt 可发送数据类别白名单』『引入/调整
  非人类主体（agent）在授权与审计基线的口径』，与 ADR-0006 已预告的 §5/§11 增量方向一致；
  §8 不涉及（agent 不碰业务 schema）。
- **M12（事件基建）**：agent bot 消息 = 回调直连专线，**不走 outbox/总线**（spec §7.5
  拍板，隐私边界）；agent 域内领域事件（实例状态变更等）若需要，按 M12 规范接入。
- **module-contract**：`agentTools` manifest 扩展 + work-cli/Skills 交付标准随 M15 增补。

## 影响

**正面**：Agent 长在统一权限/审计底盘上，不新造授权系统；隔离与授权两轴解耦后各自可
独立升级；三投影单源杜绝工具定义漂移；**工具取回面**的数据出网有类别级硬边界而非"开关
级"粗粒度（用户自带面靠纵深防御，D6）。

**代价与风险**：platform.employees/sessions/audit_logs 三处 schema 变更（一次文档审查
门禁打包过）；默认排除机制漏一面 = agent 被解析为**通知收件人**（部门负责人/角色两条
非 UI 路径，C1 命门）或出现在日报需报/名册等查询面（守护测试含"agent 挂负责人/持角色
不得被解析为收件人"一条 + 逐面清单缓解）；委托令牌吊销有两窗口叠加残余（D3，显式接受）；
agent-gateway 成为新的安全关键组件（控制通道持令牌流转，进 security-baseline 审查面）；
CRD 项目年轻（准入门槛 + 三档保底）；云 LLM 依赖（可用性/成本/边界，已登记 ADR-0006
风险表）。

## 实装时点

- 本 ADR 不要求即时代码改动；M15 RFC 依据本 ADR 展开实施规格（状态机细节、控制通道
  协议、敏感工具清单、审计增长预算、卷处置流程）。
- D2/D9 的 platform schema 变更随 M15 首切片落地，先过 doc-index §5 文档审查。
- 生产准入复测（D4）在 M15 部署切片执行，数字回填本 ADR 状态注记。
