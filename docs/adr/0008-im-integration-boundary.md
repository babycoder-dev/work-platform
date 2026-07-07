# ADR-0008: IM 集成边界（对 ADR-0001 的显式修正）

## 状态

Proposed（待两轮独立评审 + 拍板）｜ 起草 2026-07-07 ｜ 依据 `docs/adr/0006-vnext-roadmap.md`
§4 子 ADR 立项第 2 条、`docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md` §7；实证
输入 `docs/research/openim-deployment-evaluation.md`（OpenIM 部署 spike，2026-07-07 已产出）。

> 编号说明：ADR-0007 已由 M12 RFC 钦定给"事件传输选型"（将随 M12-1 入库）；ADR-0009
> （Agent 身份、工具面与运行时编排）已 Accepted（2026-07-07）。本 ADR-0008 按 ADR-0006 §4
> 顺排承载"IM 集成边界"，是 **M13/M14 RFC 的前置**，并与 ADR-0009 在 agent bot 通道上分界
> （本 ADR 定 IM 侧，ADR-0009 D10 定 agent 侧，两边以 `@work/im-provider` 接口为界）。

> 本 ADR **对 Accepted 的 ADR-0001 作三处显式修正**（D1），并**放宽一条安全铁律**（D2：
> `modules/im/web` 前端直连 OpenIM，是 AGENTS.md §7 / constitution / security-baseline §10
> "业务模块不得直接调用 OpenIM"的唯一例外）——后者是 security-baseline §16 门禁范畴，随
> M13 首切片"先改文档再动代码"。AGPL 合规姿态不在本 ADR 重议（ADR-0006 已拍板：纯内部
> 使用、不商业化、AGPL 可依赖引用），本 ADR 只界定引用方式与边界。

> 一审（独立 sub-agent，2026-07-07）发现并已修订：**C1** D2"仅消息收发"是无实证乐观断言
> ——前端持的是 OpenIM **user token**（用户级、含建群/拉会话/改档），改为诚实界定 + M13 前置
> 实测能力清单 + 显式接受残余（§D2）；及 **M1** 短 TTL 与 spike 实测 90 天默认冲突、可否
> 参数化未验（§D4）、**M2** 撤销最坏时延漏消费延迟段且无上界（补三段公式对齐 ADR-0009 D3，
> §D4）、**M3** 短 TTL×高频换发×introspection 压力矛盾未展开（§D4）、**M4** architecture.md
> §5.1 拓扑 + 铁律第四副本双漏（补入修正清单）、**M5** 共享密钥泄露→伪造 bot 消息→喂 agent
> 执行的攻击链未防、丢了 spec §7.5"发送者 userID 绑定"（补 D7 第 4 条 + 信任边界 + agent 侧
> 最终防线，§D7）。minor（去连字符 UUID 大小写维度、透传归因指 ADR-0006 §3/spec §7、内容 vs
> 元数据字段级判据 + 禁 log content、四存储措辞对齐 spike、回指 spec §7、笔误）一并落修。

> 二审（换视角独立 sub-agent：安全实施负责人 + 修订验证者，2026-07-07）验证一审 6 命门修复
> "全部扎实落地、无新矛盾"；发现并已修订两条追问命门 + 三条完备性缺口：**C1** user token
> 用户级能力（一审 C1）撞 D5 部门群对账 = 用户私改→对账回滚→再改的拉锯 + 告警风暴（补部门群
> vs 自建群对账分野，§D5）；**M-1** "读敏感 + 经 agent IM 账号外发"绕过写确认 + prompt 白名单
> ，两个 ADR 在 agent 出站 IM 上互指都没盖（补出站授权定性 + ADR-0009 D6 须约束 IM 出站面，
> §D6）；**M-2** security-baseline §10 现第 4 条本含"或共享密钥"、须改写合并非新增并存 + 漏列
> 发送者绑定（修）；**M-3** 铁律副本误数为四处、实为五处（补 foundation-blueprint）；**M-4**
> 缺"拍板项"节——聊天留存 + AGPL bundle 分发定性两处业务/法务判断藏正文未升格（补拍板项节）。
> minor（三态对账表、doc-index 收录、ADR-0001 状态注记入 Accept 动作、im-provider 反向边界、
> architecture 边方向、user token 已签发未测能力的措辞）一并落修。二审结论：修完可交拍板。

## 背景

ADR-0001（基建早期起草，Accepted，无日期标注）把 OpenIM 定为可插拔 IM Provider，立下四条约束沿用
至今：① 平台账号体系自持，OpenIM 不接管；② 业务模块不直接调用 OpenIM，只经 `im-adapter-api`
与 `@work/im-provider`；③ 第一阶段只验证服务端 REST/Webhook，**不集成 AGPL 客户端 SDK**；
④ Web/C-S 客户端接入 SDK 需单独 License 评估（Phase D）。彼时 `im-adapter-api` /
`im-provider` 只落了骨架（`ImProvider` 四方法 TODO、webhook controller 裸接收）。

vNext 把 IM 从"系统通知投递"升级为**一等协作面**（M13 基座 + M14 体验），并叠加两个 ADR-0001
未预见的新需求：**自建聊天 UI 需要前端直连 OpenIM 消息通道**，以及 **agent 数字员工需要经
IM 收发消息**（ADR-0009）。二者都触碰 ADR-0001 的原始约束，必须由本 ADR 显式修正、精确
划界，而不是让实现者在铁律与需求之间自行取舍。

OpenIM 部署 spike（`docs/research/openim-deployment-evaluation.md`）已实证：REST/Webhook 四
链路可跑通、**消息回调可行**（agent bot 专线设计成立），但也证否了 ADR-0001/spec §7 的两处
乐观假设——**OpenIM userID 拒绝连字符 UUID**、**webhook 无签名头**。本 ADR 据实证定边界。

## 决策

### D1 对 ADR-0001 的三处显式修正

ADR-0001 的账号自持、Provider 可替换、服务端经 `im-adapter-api` 三条**不变且强化**；以下三
条**修正**：

1. **Web SDK 接入方式**：ADR-0001"不集成 AGPL 客户端 SDK / 客户端 SDK 不默认进入"→ 修正为
   **OpenIM JS SDK 以 npm 依赖引入 `modules/im/web`，不复制源码、不 fork、不改**（运行时依赖
   引用，AGPL 义务按 ADR-0006 纯内部使用姿态承担）。这是把 ADR-0001 Phase D 从"预留待评估"
   **部分激活**为"Web SDK 依赖引用"（C/S 桌面客户端仍留 M20+ 预留桶，不在本 ADR）。
2. **agent bot 消息通道**：ADR-0001 的 webhook 语义是"接收后写审计日志"（Phase A）→ 扩展为
   **agent bot 回调直连专线**（D6）：发给 bot 的消息经回调白名单转发给 agent 消费端，内容
   **不落平台业务库**、不进审计/搜索。这是 ADR-0001 未预见的内容级回流通道，显式开洞并限死
   边界。
3. **身份映射**：ADR-0001"OpenIM 用户 ID 使用平台用户 ID **映射**"（本不排斥转换）被 **ADR-0006
   §3 / spec §7.1 具体化为"直接透传"**（`OpenIM userID = 平台 user id`）→ 本 ADR 据 spike 实证
   修正为**不可直接透传**（D3，userID 规则不兼容含连字符 UUID），须经确定性转换或映射表。

### D2 业务模块直连 OpenIM 铁律的唯一例外（安全边界，精确划界）

铁律原文（AGENTS.md §7 / constitution / security-baseline §10）：**"业务模块不得直接调用
OpenIM"**。本 ADR 立**唯一例外**，边界四条同时成立方生效，缺一即回落铁律：

1. **仅** `modules/im/web`（前端）——不是任何服务端、不是任何其他模块的 web；
2. **仅**用于聊天 UI 的 IM 原生能力（OpenIM JS SDK + websocket：发消息/收消息/会话列表/
   已读回执）——但**须诚实界定（一审 C1）**：前端持的是 OpenIM **user token**，其实际能力面
   = OpenIM 服务端对 user token 的授权面（**用户级**，很可能含建群/拉取本人所在任意会话/向
   其发消息/改本人资料等，**非仅消息收发**；spike 只测过 admin token、未测 user token 能力
   边界）。故"仅消息收发"是**前端行为约束、非服务端授权约束**，浏览器是不可信执行环境、
   约束不住攻击者。**M13 RFC 前置实测 user token 能力清单** + 评估 OpenIM 能否按能力收窄
   user token（禁建群/禁改档）；不能收窄则把"前端能以自己身份做 OpenIM 允许用户做的一切"
   登记为**显式接受的残余**，靠平台账号/组织自持（不以 OpenIM 侧建群/改档为组织真源）+ D4
   短 TTL + 撤销传播兜底（spike 已**签发过 user token** 但未以其实调建群/改档验证能力边界，
   `openim-deployment-evaluation.md` §2.3）；
3. **ws 经反代直连 OpenIM，不穿平台网关、不穿 realtime-gateway**（平台 SSE 管通知信号、IM ws
   管消息，两通道各司其职，`docs/rfc/m12-reliable-events-multiprocess.md` §15① realtime-gateway
   退役后 SSE 走 gateway 内 fan-out，与 IM ws 无关）；
4. **IM token 仅由 `im-adapter-api` 换发**（D4，短 TTL），前端不持 OpenIM 密码/admin secret，
   撤销传播（D4）覆盖该通道。

**例外不含**：任何模块的**服务端**调 OpenIM（仍只有 `im-adapter-api`）、任何**非 IM 内容**的
数据流、组织/权限/账号语义（仍平台自持）。措辞例外随本 ADR 登记进三份文档（见"对既有文档
的修正"）。

### D3 身份映射策略（spike 实证驱动）

OpenIM userID 不接受平台 UUID 主键（含连字符被拒，spike §2.3；OpenIM 原文 errDlt
`userID is legal`，措辞疑为 `illegal` 笔误）。决策：

- **主候选 = 去连字符 UUID**（32 hex，无状态、双向可逆——纯格式变换删 4 个连字符，可逆无
  碰撞成立，风险在长度/字符集/大小写而非碰撞）：`im-adapter-api` 在平台 UUID ↔ OpenIM userID
  间做确定性转换。**M13 RFC 须实测确认** OpenIM userID 的**长度上限、字符集、大小写敏感性**
  是否容纳 32 hex 全小写（spike 报错 `userID is legal` 只证含连字符被拒，未穷举这三项）。
- **兜底候选 = `im_user_id` 映射表**（若 32 hex 超长度限或字符集更窄）：im-adapter 自有最小
  schema 存平台 id ↔ OpenIM id 双向映射。
- 昵称/头像从档案同步（`profile.updated` 事件驱动，D5 同步链路）；**不设 OpenIM 密码**。
- **agent bot 账号**同走此映射（无档案，昵称/头像取自 agent 定义，ADR-0009 D10）。

选型细节（含 32 hex 实测结论）归 M13 RFC；本 ADR 定"不可透传 + 确定性转换优先于映射表"的
方向。

### D4 IM token 换发 + 撤销传播（对 ADR-0004 phantom-token 的补链路）

- **换发**：Web 端 IM token 仅经 `im-adapter-api` 的 token 换发端点——平台会话（phantom
  token，经 introspection 验明）→ im-adapter 调 OpenIM admin API 签发 user token → 下发前端。
  前端不接触 admin secret（只存 im-adapter 服务端密钥管理，security-baseline §11 新密钥类别，
  ADR-0009 已同列 `OpenIM admin secret`）。**⚠️ 短 TTL 的可行性未验证（一审 M1）**：spike
  实测 `get_user_token` 默认 `expireTimeSeconds=7776000`（**90 天**，同 admin token，
  `openim-deployment-evaluation.md` §2.3），且**未测 OpenIM 是否支持按请求指定短 TTL**。若
  不支持逐次指定，"短 TTL 兜底"在当前版本落空、只剩事件驱动强制下线单链路——**M13 RFC 前置
  验证 user token 可否参数化短 TTL，此为 M13 go 条件之一**；不可则评估替代（im-adapter 侧包
  短时效换发凭据、或缩短强制下线周期）。
- **撤销传播（硬要求，本 ADR 的安全命门）**：OpenIM ws **不穿平台网关**，phantom-token 的
  "即时撤销"语义（ADR-0004 / security-baseline §4.1、§4.4）对它**不自动生效**——平台吊销
  session 后，OpenIM 侧已签发的 user token 仍在其 TTL 内有效、ws 仍连着。故必须**显式补
  链路**：平台禁用用户/登出/会话失效 → 发平台事件 → `im-adapter-api` 消费（**M12 事件基建的
  消费者之一**，走 at-least-once）→ 经 OpenIM admin API 强制下线该用户 OpenIM 会话 + 吊销
  token。
- **撤销最坏时延 = 三段（对齐 ADR-0009 D3 的取长边诚实声明，一审 M2）**：事件传播（M12
  outbox→relay，秒级）+ **消费延迟（im-adapter 作 M12 at-least-once 消费者的残余窗口，事件
  未消费/延迟）** + OpenIM admin API 生效——**上界由 user token TTL 封顶**（撤销链路彻底失败
  时 token 存活到 TTL 尽头）。故 **user token TTL 上界 = 撤销 SLA 上界**：TTL 未定 + 90 天
  默认未排除（见换发）⇒ 最坏撤销窗口当前**无上界**（最坏可达 90 天）。M13 RFC 定 TTL 时须
  同时声明可接受的最坏撤销窗口。
- **短 TTL × 高频换发 × introspection 压力的权衡（一审 M3，M13 RFC 定量）**：TTL 越短 →
  前端越频繁向换发端点要新 token → 每次换发一次 platform introspection（验 phantom token）→
  introspection QPS 随 TTL 缩短放大；且 **IM token TTL 与 introspection 缓存 TTL（≤60s，
  ADR-0004 §4.4）的相对大小影响撤销即时性**（缓存命中期内换发读到旧身份，撤销再打折）。
  M13 RFC 定 TTL 须给出：预期在线用户数 × 换发频率的 introspection QPS 估算 + IM token TTL
  与缓存 TTL 的约束关系。

### D5 隐私边界 + 消息留存/归档策略

- **常规聊天内容不回流平台库**：不进平台审计、不进平台搜索。OpenIM Mongo 是消息事实库，
  平台**不镜像、不双写**。
- **webhook 默认只回流账号/群组生命周期事件**（用户注册、建群等，spike §2.4 实测载荷），
  用于同步对账（D-同步）；**消息级 webhook 默认关**，仅 agent bot 白名单例外（D6）。
- **内容级合规审计 / 搜索 / 归档 / 敏感词 = 预留**（ADR-0001 Phase E）：留接口位不实现；启用
  须走独立 ADR（触及"聊天内容是否落平台库"的隐私姿态翻案）。
- **同步 = 事件驱动 + 夜间对账**：platform 用户/部门事件 → im-adapter 消费 → OpenIM 用户与
  **部门群**增删；夜间全量对账 job 修漂移，调度能力来自 M12 抽壳的 `@work/scheduling`
  （不复用 notification 内部调度）。部门群成员资格以平台组织树为准。
- **对账边界（二审 C1，部门群 vs 用户自建群须分野）**：D2 承认前端 user token 是用户级、能
  私自建群/改群成员——与本条对账在"部门群"上会**拉锯**（用户改 → 对账回滚 → 用户再改 + 告警
  风暴）。故定分野：① **平台管理的部门群**——成员改动**只走 im-adapter admin API**，user token
  层面能否禁用户群管理权依赖 D2 的 M13 实测（能收窄则拉锯消失，是首选）；对账对部门群漂移按
  **静默纠正**处理（预期用户可能乱动，不逐次刷告警，仅漂移量超阈值才告警）；② **用户自建的
  非部门群**——明确**不在对账范围**（对账不得删用户自己的群，否则是数据破坏）。M13 RFC 落
  对账 job 时按此分野实现。

### D6 agent bot 回调专线（与 ADR-0009 D10 联合，本 ADR 定 IM 侧）

- **bot 账号**：平台注册专用 agent bot OpenIM 账号（走 D3 映射，无档案）；provisioning 与
  回调白名单**随 agent 注册/启用动态维护**（启用加白、停用摘除）——agent 侧触发归 ADR-0009
  D10，IM 侧执行（建号/加白/摘白）归本 ADR。
- **传输形态 = 回调直连专线**（spec §7.5 拍板，spike 证实可行）：OpenIM 消息回调 →
  `im-adapter-api` 校验（D7）→ 按**转发契约**直连推给 agent 消费端。**显式不是领域事件、不走
  outbox/总线**（内容走总线 = critical 事件行落 PG，违反"内容不落平台业务库"）；可靠性由回调
  重试 + 会话级对账兜底，与 M12 RFC §2 非目标一致。
- **回流范围白名单**：仅"发给 bot / @bot"的消息回流；其余聊天不回流。
- **转发契约预留收件 agent 标识**（M19 多数字员工各有 IM 账号后按收件方路由）；M13 交付以
  echo 探针验收，agent-gateway（M15）到位后接管消费端。
- **内容 vs 元数据的字段级判据（一审 m3，细化归 M13/M15 RFC）**：消息 `content`（正文）**不落
  平台业务库**；会话元数据（`serverMsgID/sessionType/contentType/时间戳/收件 agent 标识`）可进
  `agent.*`（M15 建 schema）；`sendID↔bot` 会话映射属社交图谱、按内容级隐私处理，不入 `agent.*`
  明文。**im-adapter 转发链路禁止 log 消息 `content`**（审计只记 `serverMsgID` + 转发结果，不记
  正文），与 security-baseline §13"日志不得含完整请求体"一致——否则转发这一跳会把内容落日志、
  违反"不落库"承诺。
- **agent 出站 IM 的授权定性（二审 M-1，入站/出站对称，勿只讲入站）**：以上讲的是**入站**
  （发给 bot 的消息回流给 agent）；**agent 经自身 IM 账号发消息（出站）**同在 IM 侧、也归本
  ADR 传输面，但其**授权定性 = 一类平台工具**，`readOnly/write` + `confirmationPolicy` +
  `dataClasses` 定义归 ADR-0009 D7 工具面，本 ADR 只提供 IM 传输。**须点名的攻击链**："读敏感
  数据（只读工具、在委托权限内）+ 经 agent IM 账号外发到群"这条 read-then-exfil **既不触发
  ADR-0009 D8 写确认（读不是写），外发目标又非云 LLM（不触发 ADR-0009 D6 的 prompt 白名单
  ——D6 只 gate 进 prompt、不 gate IM 出站）**。故**兜底须由 ADR-0009 D6 数据类别白名单同时
  约束 IM 出站面（非仅 LLM prompt 面）**——"读到的敏感类别不得经 IM 外发"与 prompt 白名单
  同源，此接力点归 M15 RFC 落，本 ADR 在此显式登记，勿让实施者漏防。

### D7 webhook 安全入口（spike 实证驱动，security-baseline §10 增量）

spike 实证 OpenIM v3.8.3 webhook **无签名头**——ADR-0001/spec §7 原"webhook 校验签名"前提
在当前版本**不成立**。决策（纵深防御，不依赖单一手段）：

1. **不公网暴露**：OpenIM webhook 只能打到 `im-adapter-api` 的**内网地址** + 网络 ACL；
2. **共享密钥 / 不可猜路径**：im-adapter 校验共享密钥或路径密钥（配置化，进密钥管理）；
3. **幂等 + 重放防护**：按 `serverMsgID` / `operationID` 去重（spike 实证载荷含此二字段）；
4. **发送者真实性绑定（一审 M5，spec §7.5 原设计"发送者 userID 绑定"，勿在搬运中丢）**：
   转发给 agent 前，im-adapter 必须校验回调 `sendID` 与会话上下文自洽（该 sendID 确在该 bot
   的会话中），并按 `serverMsgID` 回查 OpenIM 核对消息存在性——**不得仅凭密钥通过就转发**；
5. **签名待启用**：OpenIM 后续版本若提供 webhook 签名，**升级即启用**（强化第 2 条，非替代）。

**共享密钥的信任边界（一审 M5，须诚实）**：共享密钥只证明调用方**持密**，**不证明消息真实
来自 OpenIM Server、更不证明发送者身份**——比 ADR-0009 D8 假设的"有签名"还弱一档（签名至少
证明来自 OpenIM Server）。故防"密钥泄露 → 伪造 agent bot 消息 → 喂数字员工执行"这条攻击链
（后果 = 以任意用户身份驱动数字员工按 ADR-0009 委托权限行事）的**最终防线不在 webhook 层**，
而在 agent 侧：ADR-0009 委托令牌 ∩ 工具白名单限权 + 写操作平台锚定确认（其 D8）把伪造指令
挡在授权写之前。webhook 层的 ACL + 密钥 + 发送者绑定 + 幂等是**纵深的第一道、非唯一道**；
spike §7.5 明令"agent bot 不直接接 webhook，必须经平台层过滤/限流/权限判断"在此落为第 4 条
+ agent 侧最终防线。本条同时是 D6 agent bot 专线的入口安全，二者共用 im-adapter webhook
接收面。

### D8 部署形态（引用 spike，落地归 M13 RFC）

OpenIM 全家桶（server/chat/mongo/redis/kafka/etcd/minio）以**独立 compose provider**部署
（spike §7.2 推荐拓扑），**不并入平台主 compose 默认启动路径**；不部署 OpenIM Web/Admin
前端（license 不适合复用）、不引入客户端 SDK 的 monitoring 前端栈。存储组件（一审 m4，措辞
对齐 spike §7.1）：**Kafka/Mongo/Redis 经实证不可裁**（各有"停 X 后 send_msg/token 失败"），
**MinIO 未证明可用本地盘替代**（媒体场景须保留），**etcd 官方拓扑默认必备**（开发档单节点）
——四者 M13 基线均保留，仅开发档单副本。资源基线（空载 ~1.5 GiB、建议预留 2–3 GiB + 20 GiB 盘）+
备份矩阵进 `docs/deployment.md` 与 M13 runbook。本 ADR 只锚定"独立 provider、不进主 compose
默认路径"的边界，拓扑/版本/备份细节归 M13 RFC。

## 关键取舍

- **前端直连 OpenIM vs 全程经 im-adapter 代理**：选前端直连（D2）。理由：IM 消息是高频实时
  双向流，全程经 im-adapter 反代 ws 会让 im-adapter 成为消息热路径瓶颈且重造 OpenIM 已有的
  ws 能力；直连 + 短 TTL token + 撤销传播（D4）在"性能/复杂度"与"安全"间取平衡。代价 = 放宽
  一条铁律 + 撤销传播必须显式补链路（不能白嫖 phantom-token 的即时撤销）+ **前端获得 OpenIM
  user token 的用户级能力面（D2，非仅消息收发），平台须靠账号/组织自持消化这层放宽**。
- **去连字符 UUID vs 映射表**（D3）：优先无状态转换，避免 im-adapter 维护一张必须与平台账号
  强一致的映射表（一致性负担 + 又一处漂移源）；仅在字符集/长度实测不通过时才落表。
- **webhook 无签名的纵深兜底 vs 等 OpenIM 出签名**（D7）：选纵深兜底。理由：签名是 OpenIM
  的 roadmap 不可控项，M13 不能阻塞在它上；内网 ACL + 共享密钥 + 幂等已足够支撑内网信任模型，
  签名到位后作强化叠加。
- **消息内容不落库 vs 合规审计**（D5）：本期选不落库（隐私优先 + 存储/合规成本）；合规审计
  留预留位，启用是隐私姿态翻案、走独立 ADR。

## 与其它决策的关系

- **ADR-0001（被本 ADR 修正）**：账号自持/Provider 可替换/服务端经 im-adapter 三条强化不变；
  Web SDK 接入、agent bot 通道、身份映射三处修正（D1）；Phase D 部分激活（Web SDK 依赖引用），
  Phase E（归档/搜索/审计/敏感词）仍预留。
- **ADR-0004（phantom-token）**：D4 撤销传播是对其"即时撤销"承诺在 OpenIM ws 通道的**补链路**
  ——phantom-token 对不穿网关的 OpenIM ws 不自动生效，须事件驱动强制下线 + 短 TTL 兜底。
- **ADR-0009（agent 身份，Accepted）**：D6 agent bot 通道是 ADR-0009 D10 的 IM 侧对手方，
  两边以 `@work/im-provider` 接口为界；ADR-0009 D8 已据 spike 记入"OpenIM 无回调签名"强化其
  "OpenIM 不入写授权 TCB"论证。
- **M12 RFC（事件基建，Accepted）**：D4 撤销传播、D5 同步都是 M12 的**跨进程消费者**（im-adapter
  是 M12 的第一个非 notification 消费宿主，无自有业务 schema 时的幂等/死信约定见 M12 §8.6）；
  agent bot 专线**显式不走** M12 outbox/总线（D6，与 M12 §2 非目标一致）。
- **`@work/im-provider` 契约扩展**：现有 `syncUser/disableUser/sendSystemMessage/handleWebhook`
  四方法需扩 token 换发、强制下线（撤销）、bot 账号 provisioning/加白摘白、回调转发——契约
  形状归 M13 RFC；本 ADR 定职责边界（这些能力都在 im-adapter 服务端，不外泄给业务模块）。
  **反向边界（二审 minor）**：D2 前端直连的能力（收发消息/会话列表/已读回执经 JS SDK 直连
  OpenIM）**不进 im-provider 服务端契约**——im-provider 只收服务端能力（同步/token/bot/转发），
  M13 起草契约时勿把前端直连能力误塞进服务端契约。
- **spec §7（设计推演来源）**：本 ADR 是 spec §7（`2026-07-05-vnext-roadmap-design.md` §7）的
  决策收口——其拍板（回调直连专线 §7.5、Web SDK npm 引入 §7.3、身份映射/webhook 无签名的
  spike 修正）在此固化为 ADR。

## 对既有文档的修正

- **ADR-0001**：D1 三处修正 + Phase D 部分激活，随本 ADR Accepted 记入 ADR-0001 状态注记
  （"部分被 ADR-0008 修正"）。
- **AGENTS.md §7**：加 D2 例外措辞——"业务模块不得直接调用 OpenIM，**唯一例外 =
  `modules/im/web` 前端经 OpenIM JS SDK + 反代 ws 收发 IM 消息**（边界见 ADR-0008 D2）；服务端
  仍只有 `im-adapter-api` 调 OpenIM"。
- **constitution**（"IM 能力必须通过 `im-adapter-api` 与 `ImProvider` 抽象接入，业务模块不得
  直接调用 OpenIM"一句）：加同款例外脚注。
- **security-baseline §10（IM 安全）**：增量——① Web IM token 经 im-adapter 短 TTL 换发、前端
  不持 admin secret；② 撤销传播链路（事件驱动强制下线 + 短 TTL 兜底）；③ **改写现第 4 条**
  "Webhook 必须校验签名或共享密钥"为"webhook 入口须内网 ACL + 共享密钥/不可猜路径 + 幂等/
  重放 + **发送者真实性绑定（D7 第 4 条，勿掉队）**；OpenIM 当前版本无签名头、签名分支不可得，
  待其提供后作强化叠加（非替代）"——注意旧条本含"或共享密钥"后路、非纯"必须签名"，故是**改写
  合并**不是新增并存；④ `modules/im/web` 前端直连例外的边界。**security-baseline §16 门禁**
  （"变更 token/session 存储方式 / 引入 OpenIM SDK"两项已覆盖本 ADR），随 M13 首切片"先改
  文档再动代码"。
- **architecture.md §5.1（IM Provider，一审 M4）**：① 拓扑图补三条边——前端 → 反代 → OpenIM
  ws 直连（不穿网关）、token 换发（前端向 im-adapter 请求 → im-adapter 调 OpenIM admin 签发 →
  回下发，**两跳**）、agent bot 回调专线（现图只有 `platform-api → im-adapter → OpenIM REST`
  与 `Webhook → im-adapter`）；② §5.1 重复的铁律句"业务模块不直接调用 OpenIM"加同款 D2 例外
  脚注。随 M13 首切片改。
- **foundation-blueprint.md（二审 M-3）**：其 IM Provider 规则清单"业务模块不直接调用 OpenIM
  REST API"（`:239`）是该铁律的**第五处副本**——铁律共**五处**（AGENTS.md §7 / constitution /
  security-baseline §10 / architecture §5.1 / foundation-blueprint），本 ADR 前面误数为四处，
  实为五；此处同加 D2 例外脚注，随 M13 首切片改。
- **`docs/deployment.md`**：D8 独立 provider 拓扑 + 资源基线 + 备份矩阵（引 spike），M13 落地。

## 影响

**正面**：IM 从骨架升为一等协作面且边界清晰；三处对 ADR-0001 的修正显式成文，实现者不再在
铁律与需求间自行取舍；铁律例外精确到"仅 im/web 前端、仅消息通道、ws 不穿网关、token 短 TTL
换发"四条同时成立，放宽面最小；spike 实证的两处坑（userID 不兼容、webhook 无签名）在 ADR 层
就有对策，不留给实现踩。

**代价与风险**：① 撤销传播是显式补链路（非白嫖 phantom-token），撤销最坏时延 = 事件传播 +
消费延迟 + admin API，**上界由 user token TTL 封顶**（D4），TTL 未定则窗口无上界——短 TTL
兜底的可行性本身待 M13 实测（登记为已接受残余，M13 RFC 定 TTL 与最坏撤销窗口）；② 前端直连
放宽一条安全铁律，前端得 user token 用户级能力面（D2），
im/web 成为安全关注面（进 security-baseline 审查）；③ OpenIM 无 webhook 签名，内网信任模型下
靠 ACL + 共享密钥兜底，公网暴露即失效（部署硬约束）；④ 身份映射的 32 hex 长度上限未实测
（M13 RFC 前置验证，兜底映射表）；⑤ OpenIM 全家桶首次引入非 PG 存储，部署/备份复杂度上升
（spike 已量化，归 M13）。

## 实装时点

**ADR-0006 §4 立项第 2 条清单三态对账**（闭合立项、防漏项）：

| 立项项 | 状态 | 落点 |
| --- | --- | --- |
| Web SDK 依赖引用 | 已决方向 + 移交 M14 | D1.1；实装 + Chrome 109 实测 M14 RFC |
| agent bot 通道 | 已决 + 移交 M13 | D1.2 / D6；im-adapter 侧实装 M13 |
| token 换发 / 撤销传播 | 已决方向 + 移交 M13 | D4；TTL 与最坏窗口 M13 定 |
| IM 消息留存 / 归档策略 | 已决（不落库）+ 拍板确认 | D5 / 拍板项 1；接口预留位 M13 |
| AGENTS.md §7 / constitution 措辞例外 | 已决 + 移交 M13 首切片改文档 | D2 / 对既有文档的修正 |
| Chrome 109 × SDK 实测 | 移交 M14 | M14 RFC 检查项 |

**Accept 即办（本 ADR Accepted 时同步，非留给 M13）**：
- 记 **ADR-0001 状态注记**"部分被 ADR-0008 修正"（改注记非改结论，doc-index §1 允许）；
- **doc-index §7** 加一行收录本 ADR（对齐 ADR-0009 Accept 时的登记惯例）。

本 ADR 是 **M13/M14 RFC 的前置**，Accepted 后：
- **M13 RFC** 落地：身份映射选型（含 32 hex 实测）、token 换发/撤销传播机制、同步 + 夜间对账、
  agent bot 专线 + webhook 安全入口、`@work/im-provider` 契约扩展、独立 provider 部署 + 备份
  runbook；im-adapter 作为 M12 消费者的幂等/死信落地。
- **M14 RFC** 落地：`modules/im/web` 自建聊天 UI + OpenIM JS SDK npm 接入 + **Chrome 109 ×
  JS SDK 实测**（wasm / SharedArrayBuffer / 跨源隔离响应头在企业反代下能否跑通），跑不通则
  显式豁免"IM 不入 Win7 核心功能清单"并同步 constitution §7 与 architecture §3.3——**此检查项
  归 M14 RFC，不在本 ADR**。
- security-baseline §10 增量 + AGENTS.md §7 / constitution 例外措辞随 M13 首切片同批改文档。

## 拍板项（待产品负责人定）

本 ADR 多数为技术边界与对 ADR-0001 的修正，但有两处**业务/合规判断**须产品负责人拍板（与
ADR-0009 拍板项同量级，勿留在正文漏签）：

1. **聊天内容留存策略**（D5）：本 ADR 选"常规聊天内容不回流平台库、合规审计留预留位、启用走
   独立 ADR"。这是**隐私/合规业务判断**（企业是否需要聊天审计留存、监管是否要求），非工程
   取舍。默认建议 = 不落库（隐私优先 + 存储/合规成本）；若企业/监管要求内容级审计，须翻此
   默认并起独立 ADR。
2. **AGPL 组件进前端 bundle 的分发定性**（D1.1）：ADR-0006 已拍"纯内部使用、AGPL 可依赖引用"，
   但"OpenIM JS SDK（AGPL-3.0）打进 `modules/im/web` 前端构建产物、分发给企业内网用户浏览器"
   是否触发 AGPL 的 conveying/distribution 义务，是**法务判断**（spec §3.2 当年只做工程姿态、
   未做法务定性）。须法务一次性背书"内网 bundle 分发在纯内部姿态下的 AGPL 义务边界"，M14
   （Web SDK 实装）前完成；若已背书，注明出处即闭合。

（其余如身份映射选型、TTL 取值、user token 能力收窄均为技术决策，随 M13 RFC 定，不在拍板项。）

## 备选方案（已否）

- **全程经 im-adapter 反代 IM ws**（不放宽铁律）：im-adapter 成消息热路径、重造 OpenIM ws
  能力、性能瓶颈——否，见关键取舍。
- **OpenIM 接管账号/群组作为组织真源**：违反 ADR-0001 账号自持 + constitution，账号/组织真源
  必须平台——否。
- **等 OpenIM 提供 webhook 签名再开 agent bot 通道**：签名是不可控 roadmap 项，会阻塞 M13；
  内网纵深兜底已够——否（D7）。
- **聊天内容回流平台库做全文搜索/审计**：隐私姿态翻案 + 存储成本，本期不做，留预留位——否
  （D5）。
