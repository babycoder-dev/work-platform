# ADR 0009: Agent 身份、工具面与运行时编排（数字员工）

## 状态

Proposed（待两轮独立评审 + 拍板）｜ 起草 2026-07-07 ｜ 依据 `docs/adr/0006-vnext-roadmap.md`
§4.3 立项（**对 ADR-0004 的显式扩展**，安全基线第二次大扩展）；实证输入
`docs/research/agent-runtime-evaluation.md`（2026-07-06 spike）；设计推演
`docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md` §8。

> 编号说明：ADR-0007 已由 M12 RFC 钦定给"事件传输选型"（随 M12-1 入库）；ADR-0008 按
> ADR-0006 §4 顺位保留给"IM 集成边界"（等 OpenIM spike 回流）。本 ADR 提前于 0008 起草
> 是刻意的：其全部输入已齐（agent-runtime spike + 2026-07-07 LLM 通道拍板），而 0008 还在
> 等 spike；两者的唯一交叠（agent 的 IM 账号 provisioning）以联合决策位切分（§D10）。

> 本 ADR 含 **两个拍板项**（§拍板项）：① agent 主体在 platform schema 的落位（建议
> `employees` 扩 `kind` 列 + 默认排除）；② 云 LLM prompt 可含数据类别白名单初版（业务
> 判断，必须产品负责人定）。其余决策为技术推荐，随评审定稿。

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
  agent 默认会出现在一切消费 employees 的面上（名册/看板/日报需报/组织树/统计/导出），
  必须配**默认排除机制**：platform repository 的员工查询面缺省过滤 `kind='human'`，需要
  agent 的面**显式 opt-in**（`includeAgents`）——"默认安全、显式纳入"，并以守护测试锁住
  （逐面纳入-排除清单归 M15/M19 RFC，原则在此定死）。agent 主体**不建 `local_identities`
  行** ⇒ 密码登录路径天然不存在，不需要额外封堵。
- (b) 独立 `agent.agents` 实体、platform.employees 不动：默认排除免费得到，但
  `user_roles`/scope resolver/审计外键都要支持第二种主体（多态外键或影子行）——等于
  重造半套权限系统，直接违背 ADR-0006"复用平台底盘而非另造 Agent 权限系统"的拍板。

建议 (a)。这是 platform schema 变更：过 doc-index §5 文档审查，security-baseline §16
"先改文档再动代码"门禁，随 M15 首切片落地。`agent.*` schema 仍然存在（D9），但存的是
**治理数据**（实例状态机/沙箱编排/用量），不是身份——身份只有一处真源。

### D3 委托令牌 = opaque 变体 + introspection 扩展（ADR-0004 的显式扩展）

- **形态沿 ADR-0004 不变**：opaque、存 `platform.sessions`、hash 落库——理由与 0004 相同
  且更强：级联吊销是委托令牌的硬语义，JWT 撤不掉。sessions 表扩列：
  `kind`（`user|agent_delegated|agent_autonomous`）、`agent_id`、`parent_session_id`
  （委托令牌指向派生它的用户会话）。
- **级联吊销**：用户登出/被禁用/会话失效 ⇒ 按 `parent_session_id` 级联删除全部派生委托
  令牌行；opaque + introspection 使吊销即时生效（缓存 TTL ≤ 60s 的窗口沿 0004 上限）。
- **逐消息下发、不落卷**（spike 实证采纳）：委托令牌经 agent-gateway 的**内存控制通道**
  随单条消息下发进沙箱，TTL 覆盖单次处理窗口、绑定消息（jti/single-use），处理完 ack 后
  内存清零；**不注入 Secret/env、不写持久卷**（spike 证明 env 不热更、volume 落盘且轮换
  粗）。断线/超时 = 令牌自然过期，不依赖沙箱配合。
- **introspection 扩展**：沿 0004"复用 `/auth/me` 不新建端点"的取舍——`CurrentUserDto`
  扩展为可辨识主体形态（`principalKind` + `onBehalfOf`），gateway `PlatformAuthGuard` 与
  scope 管道透传双主体；业务模块经既有 `@RequirePermissions` + scope 管道消费，**不为
  Agent 重写授权**。
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
  warm pool 只留给未来无状态预置层）；升级 = 换镜像重建，状态在卷。
- egress 白名单闭环（2026-07-07 拍板后收窄）：仅 ① 云 LLM API 域名 ② 平台 MCP/API 端点
  ③ agent-gateway 控制通道。不给 DB、不给内网横向、不给其余公网。

### D5 隔离模型 = 两个正交轴的组合（spike 结论采纳）

不是"按用户实例化 / 会话分区 / 令牌下发"三选一：

- **数据隔离轴**：常规数字员工 = 单 Agent 实例 + **用户会话/记忆强分区**——会话目录根由
  宿主钉死为 `/workspace/users/<user-id>/sessions`，路径不受模型控制（pi 库本身无 tenant
  边界，spike 实证）；记忆不跨用户。
- **授权轴**：逐消息委托令牌（D3）解决授权与撤销——它不解决记忆隔离，两轴缺一不可。
- **升级档**：高敏工具或"跨用户记忆隔离难以证明"的场景 ⇒ 按用户实例化。触发判据 =
  **工具风险级别**（非全体 Agent 一刀切）；初始敏感工具清单归 M15 RFC。
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

白名单初版（**须产品负责人拍板**，候选如下——默认从紧）：

| 数据类别 | 建议 | 说明 |
| --- | --- | --- |
| 组织架构（部门/姓名/职务） | ✅ 可发 | 内置助手查询类场景的最小必需 |
| 在位状态与登记记录 | ✅ 可发 | M15 首个场景 |
| 任务/日报元数据（标题/状态/期限） | ✅ 可发 | 不含正文 |
| 档案联系方式（手机/邮箱） | ❌ 默认不发 | 场景不需要；需要时单独开 |
| 表单/审批正文、文件内容 | ❌ 默认不发 | M15 无场景；M19 重议 |
| 凭据/密钥/审计日志 | ❌ 永不 | 硬编码禁止，不入白名单机制 |

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
写授权 TCB（回调签名只能证明消息来自 OpenIM Server，证明不了用户本人点了确认）。确认
动作落审计（双主体）、防重放（确认 token 绑定操作快照 + 单次有效）。**IM 内联按钮直接
确认**保持【预留】：启用条件 = 后续 ADR 论证把 OpenIM 纳入确认 TCB 的前提（端到端签名
可验 + 用户身份绑定强度），本 ADR 不开洞。

### D9 `agent.*` schema 归 agent-gateway，审计分层

- `agent.*` schema（实例定义/状态机/会话元数据/工具调用用量/出网记录）由
  `apps/agent-gateway` 拥有，独立迁移入口 `db:migrate:agent`——与 platform-api 拥有
  `platform.*` 同构；schema-per-module 纪律不破。
- **审计分层**：平台侧敏感写仍走 `platform.audit_logs`（增列 `on_behalf_of_user_id` +
  `actor_kind`——platform schema 变更，随 D2 同批过文档审查）；agent 的**全量**工具调用
  流水（高频、含查询类）进 `agent.tool_invocations`，保留期短（用量与治理用途），不灌爆
  平台审计表。增长预算数字归 M15 RFC。
- pi 会话文件与记忆留沙箱持久卷（不进库）；卷的保留/删除/owner 离职处置见 D11。

### D10 IM provisioning 联合决策位的切分（与 ADR-0008 的接口）

本 ADR 定 Agent 侧契约：agent 注册/启用时经 `@work/im-provider` 申请 bot 账号（昵称/头像
取自 agent 定义，无档案）、回调白名单随实例状态**动态维护**（启用加白、停用摘除）、转发
契约携**收件 agent 标识**（M19 多数字员工路由）。OpenIM 侧怎么实现（admin API 面、账号
形态、回调配置）归 ADR-0008；两边以 im-provider 接口为界，任何一侧变更不穿透。

### D11 owner 生命周期联动（硬语义）

- 每个 agent 实例必有 owner（用户或组织管理位）；**owner 失效（离职/停用）⇒ 委托模式
  即刻不可用**（委托令牌级联吊销随用户会话失效天然发生，D3）+ 实例转 `suspended`。
- 自主任职 agent 的 owner 转移是**离职流程检查项**（platform 侧离职面新增）；**无有效
  owner 的实例不得处于 running**——状态机守护，不是流程建议。
- 沙箱持久卷在实例 `archived` 后按保留期删除；owner 离职时卷内用户分区数据的处置
  （交接/删除）归 M15 RFC 细化，缺省 = 冻结待 owner 继任者裁决。

## 拍板项

1. **agent 主体落位**（D2）：建议 `employees` 扩 `kind` 列 + repository 默认排除 +
   守护测试；备选独立实体已论证为"重造半套权限系统"，不推荐。
2. **云 LLM prompt 数据类别白名单初版**（D6 表）：机制已定死，白名单内容是业务判断——
   默认从紧的候选表在上，请逐行确认或改。

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
  口径 + 默认排除原则）、§11（云 LLM API key、沙箱令牌注入姿态、控制通道凭据）三处增量
  随 M15 首切片**同批改文档**（§16 门禁）；§8 不涉及（agent 不碰业务 schema）。
- **M12（事件基建）**：agent bot 消息 = 回调直连专线，**不走 outbox/总线**（spec §7.5
  拍板，隐私边界）；agent 域内领域事件（实例状态变更等）若需要，按 M12 规范接入。
- **module-contract**：`agentTools` manifest 扩展 + work-cli/Skills 交付标准随 M15 增补。

## 影响

**正面**：Agent 长在统一权限/审计底盘上，不新造授权系统；隔离与授权两轴解耦后各自可
独立升级；三投影单源杜绝工具定义漂移；数据出网有类别级硬边界而非"开关级"粗粒度。

**代价与风险**：platform.employees/sessions/audit_logs 三处 schema 变更（一次文档审查
门禁打包过）；默认排除机制漏一面 = agent 出现在日报需报/名册（守护测试 + 逐面清单
缓解）；agent-gateway 成为新的安全关键组件（控制通道持令牌流转，进 security-baseline
审查面）；CRD 项目年轻（准入门槛 + 三档保底）；云 LLM 依赖（可用性/成本/边界，已登记
ADR-0006 风险表）。

## 实装时点

- 本 ADR 不要求即时代码改动；M15 RFC 依据本 ADR 展开实施规格（状态机细节、控制通道
  协议、敏感工具清单、审计增长预算、卷处置流程）。
- D2/D9 的 platform schema 变更随 M15 首切片落地，先过 doc-index §5 文档审查。
- 生产准入复测（D4）在 M15 部署切片执行，数字回填本 ADR 状态注记。
