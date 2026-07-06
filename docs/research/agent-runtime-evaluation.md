# Agent 运行时评估

> 性质：M15 前置研究型 spike；只提供 ADR/RFC 的实证输入，不定义产品规则。
> 执行日期：2026-07-06；环境：Windows 11 x64、Docker Desktop 28.3.2（8 vCPU、
> 15.4 GiB）、Node.js 24.15.0。

## 结论摘要

- **pi 可嵌入，但只应锁定公开库边界**：`pi-ai` 的 provider/stream 抽象与
  `pi-agent-core` 的工具循环足够薄；平台必须自持身份、授权、确认、审计、会话分区和
  SandboxDriver。实测 3 个模拟平台工具完成 5 次调用（含错误路径），异常会变成
  `isError=true` 的 tool result 后继续循环。
- **Agent Sandbox CRD 主线有条件可用**：`v0.5.0` controller 在 k3d/k3s 成功运行；
  Suspended -> Ready 共 20 次，p50 2.003s、p95 2.974s、最大 2.990s，明确通过 5s 红线。
  PVC marker 20/20 保持，Secret 更新和 NetworkPolicy egress 白名单均验证生效。仍须保留
  SandboxDriver 裸 Pod/Docker 两档，并在目标 Linux/k3s 与 gVisor/Kata 环境复测。
- **隔离/令牌推荐**：常规数字员工采用“单 Agent 实例、会话按用户分区、委托令牌逐消息经
  agent-gateway 内存控制通道下发且不落卷”；高敏工具或跨用户记忆难以证明隔离时，升级为
  按用户实例化。Secret/env 只适合实例级静态凭据，不适合逐消息委托令牌。
- **work-cli/Skills 推荐**：照搬 lark-cli 的 `域 -> 资源 -> 动作`、统一 JSON 输出、
  `SKILL.md + references/ + scripts/` 渐进加载形态；不照搬其本机 OAuth/token 存储。平台以
  manifest `agentTools` 为单源，生成 CLI/MCP/Skills 三投影，并把权限点、数据范围、写操作
  确认级别和审计 action 编入生成物。

## 1. 评审对象与版本

| 对象          | 锚点                                                                                | 许可证                                                                          | 活跃度/治理实证                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| pi            | npm `0.80.3`；源码 `6efc09b7eb609fdb85e7855eb05313e042d4d1fb`                       | `pi-ai`、`pi-agent-core`、`pi-coding-agent`、`pi-orchestrator`、`pi-tui` 均 MIT | 2026-07-06 仍有提交；仓库已迁至 `earendil-works/pi`。npm 包公开 API 与仓库 README 的兼容 helper 有一次实测漂移，必须 exact pin |
| Agent Sandbox | release `v0.5.0`（2026-06-24）；检查源码 `9239c0fc197c1a7f4601808c19481e2df527d3e8` | Apache-2.0                                                                      | SIG Apps 项目；`v0.5.0` 刚从 `v1alpha1` 迁至 `v1beta1`，含有状态迁移和 conversion webhook                                      |
| kagent        | `6ee77b70a2fdd3e5841c412dc3a33635e4898173`                                          | Apache-2.0                                                                      | CNCF Sandbox；CRD 为 `v1alpha2`，迭代快                                                                                        |
| OpenClaw      | `b3db79929f1c7f66d5471c6b654065292acd8fe6`                                          | 仓库 API 未给出 SPDX（`NOASSERTION`），搬代码前须逐文件复核                     | 2026-07-06 有提交；本次仅解剖，不引入代码                                                                                      |
| lark-cli      | `f0b6f35feeca56e8aed54e7fc6c44259630aae76`，包版本 `1.0.65`                         | MIT                                                                             | 27 个 skill 目录；官方 CLI 与 Skills 同仓维护                                                                                  |
| hermes-agent  | `7426c09beee73bdff94d916015bac71384f6bc92`                                          | MIT                                                                             | 2026-07-06 有提交；飞书和企微已作为插件存在                                                                                    |

版本证据：

- [pi 仓库与包清单](https://github.com/earendil-works/pi/tree/6efc09b7eb609fdb85e7855eb05313e042d4d1fb/packages)
- [Agent Sandbox v0.5.0](https://github.com/kubernetes-sigs/agent-sandbox/tree/v0.5.0)
- [kagent 锚点](https://github.com/kagent-dev/kagent/tree/6ee77b70a2fdd3e5841c412dc3a33635e4898173)
- [OpenClaw 锚点](https://github.com/openclaw/openclaw/tree/b3db79929f1c7f66d5471c6b654065292acd8fe6)
- [lark-cli Skills](https://github.com/larksuite/cli/tree/f0b6f35feeca56e8aed54e7fc6c44259630aae76/skills)
- [Hermes 平台插件](https://github.com/NousResearch/hermes-agent/tree/7426c09beee73bdff94d916015bac71384f6bc92/plugins/platforms)

治理建议：pi 只允许 exact version + lockfile；升级机器人不得自动合并，必须跑 provider、
tool-loop、session-redaction 契约测试并复核全部子包许可证。保留以当前 MIT tag 建内部 fork 的
逃生舱；`agent-gateway` 不 import pi 内部路径。

## 2. 运行实证

### 2.1 pi harness

所有工具安装和脚本位于仓外
`%TEMP%\work-platform-agent-runtime-spike\pi-harness`，产品仓未引入依赖。

```powershell
npm install --ignore-scripts
node .\harness.mjs
```

环境未提供 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 或 Ollama，故 Anthropic 真请求和本地真实
模型请求未执行；这两项不能伪装为通过。本次用 pi 官方 faux provider 验证库嵌入和工具循环，
供应商协议实测列入 open questions。

实测结果（`@earendil-works/pi-ai`/`pi-agent-core` 0.80.3）：

| 项目       | 结果                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------ |
| 自定义工具 | `platform_read`、`platform_write`、`platform_confirm` 均成功注入                           |
| 调用循环   | 3 次正常调用 + 1 次参数转换调用 + 1 次抛错调用                                             |
| 流式事件   | 3 个 agent run、8 个 turn、33 个 `message_update`                                          |
| 参数处理   | 数字 `42` 被 TypeBox 转成字符串 `"42"`，不是拒绝；平台 contract 必须自行决定 strict/coerce |
| 工具异常   | `simulated permission denial` 被标记 `isError=true`，模型收到错误后继续给出收口回复        |
| 会话样本   | 16 条消息，JSON 4,697 bytes；未发现 API key、Authorization、Bearer 字样                    |

pi 将凭据和会话分开：coding-agent 使用 `auth.json`，会话是 append-only JSONL；新
`pi-agent-core` harness 的 JSONL repo 也只持久化 session entry。工具实现不会被序列化，
host 必须在恢复时重新注册。可按 `sessionsRoot/<编码 cwd>/时间_sessionId.jsonl` 做物理分区，
但**库本身没有 user/tenant 强制边界**，M15 必须把目录根固定为
`/workspace/users/<user-id>/sessions`，禁止模型控制该路径。

### 2.2 资源基线

先在 Windows host 启动只 import `pi-ai`、`pi-agent-core` 并构造 Agent 的 Node 进程：

| 样本                  |    Working Set |                  磁盘 |
| --------------------- | -------------: | --------------------: |
| 1 个空闲 runtime      |       71.4 MiB |     npm 依赖 82.0 MiB |
| 10 个独立空闲 runtime | 712.4 MiB 合计 | 共享依赖仍为 82.0 MiB |

随后构建 `node:24-alpine + pi-ai/pi-agent-core 0.80.3` 基础镜像并导入 k3d：

| 样本                      | Kubernetes metrics | 进程自报 RSS | 节点/磁盘                                         |
| ------------------------- | -----------------: | -----------: | ------------------------------------------------- |
| 单个空闲 pi runtime Pod   |    25 MiB / 1m CPU |     73.1 MiB | 镜像 71.7 MB                                      |
| 10 个空闲 pi runtime Pods |  250 MiB / 10m CPU |            - | k3d node 从 965.7 MiB 增至 1.244 GiB，约 +308 MiB |

Kubernetes working set 与 Node `process.memoryUsage().rss` 的定义不同，容量规划以 cgroup/
`kubectl top` 为调度输入，以进程 RSS 作诊断输入。建议初始 request **64 MiB**、limit
**128 MiB**，再用真实会话、Skills 和工具子进程校准；几百实例仍应启用空闲缩零。

### 2.3 Agent Sandbox CRD

目标命令：

```powershell
k3d v5.9.0 cluster create agent-spike `
  --image rancher/k3s:v1.35.5-k3s1 --wait --timeout 240s
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.5.0/manifest.yaml
```

环境排障：

1. 第一次创建已拉取 `k3d-tools:5.9.0` 和 k3s 镜像，但 Docker API 在创建 server container
   时 180 秒超时并由 k3d 回滚。
2. 用户随后说明 Docker Desktop 被手动关闭。第二次命令实际留下了 `agent-spike` 集群对象，
   但 `server-0`/`serverlb`/`tools` 容器随引擎关闭而以 137/143 退出，集群显示 `0/1`
   server ready。
3. 集群容器恢复后，宿主 kubeconfig 写入
   `https://host.docker.internal:50538`，而本机把该域名解析为不可达地址。复制 kubeconfig
   到 scratch 并只把 server 改为 `https://127.0.0.1:50538` 后，集群立即可用。此前超时是
   Docker 生命周期与 kubeconfig 地址问题，不是 CRD 性能问题。

实测使用 `v0.5.0`、k3s `v1.35.5+k3s1`、`busybox:1.36`；计时从发出
`operatingMode: Running` patch 前开始，到 `kubectl wait --for=condition=Ready` 返回结束，
包含 kubectl/API 往返和 controller 调和开销：

| 指标                    | 样本数 |     p50 |     p95 |    最大 | 5s 红线                |
| ----------------------- | -----: | ------: | ------: | ------: | ---------------------- |
| 首次创建至 Ready        |      1 | 57.681s | 57.681s | 57.681s | 不适用：包含首次拉镜像 |
| Suspended 至 Ready 唤醒 |     20 |  2.003s |  2.974s |  2.990s | **通过**               |

20 次原始毫秒值：

```text
2034, 2003, 1964, 2961, 2960, 2990, 2960, 2973, 1970, 1973,
2921, 2973, 1988, 1975, 2974, 1961, 1976, 1948, 1960, 2914
```

功能实测：

- PVC：写入 `marker-20260706`，20 次缩零/唤醒后 20/20 读回；PVC 在 Suspended 时保持 Bound。
- 令牌：Suspended 期间 Secret 从 v1 更新到 v2，新 Pod 的 env 和 Secret volume 均为 v2；
  Running 时更新到 v3，volume 投影最终变为 v3，而 env 仍为 v2。因此 env 需要重建，
  volume 可热更新但应用必须 watch/reload。
- egress：应用只允许到 `allowed-endpoint:8080` 的 NetworkPolicy 后，白名单服务返回
  `allowed`，`https://example.com` 被阻断。
- 生命周期：`shutdownTime + shutdownPolicy: Retain` 到期后 Pod 删除，Sandbox CR 保留，
  condition 为 `Ready=False:SandboxExpired`。字段在 v1beta1 spec 根层 inline，不是
  `spec.lifecycle`。

### 2.4 强隔离降级核实

本机 Windows + Docker Desktop 未提供 `runsc` RuntimeClass，也没有 Kata 所需的 Linux
containerd/KVM nested virtualization，按任务包不硬测。官方示例确认两者都通过
`runtimeClassName` 接入；gVisor 示例用 kind，Kata 要求 Linux、containerd 和 nested
virtualization。[官方 gVisor/Kata 指南](https://agent-sandbox.sigs.k8s.io/docs/guides/gvisor/)

## 3. 关键子系统解剖

### 3.1 Agent Sandbox

- `api/v1beta1/sandbox_types.go`：`operatingMode=Running|Suspended`、lifecycle
  `shutdownTime/shutdownPolicy`、Pod template 与 PVC。
- `controllers/sandbox_controller.go`：调和 Pod/PVC、到时删除底层资源。
- `docs/api-migration-guide.md`：`v0.5.0` 将 `replicas 0/1` 改为
  `operatingMode Suspended/Running`；SandboxClaim 迁移依赖 conversion webhook 和
  shadow warm pool。这是明确的破坏面。
- Template 的 managed NetworkPolicy 默认阻断 ingress，并阻断内部 IP/metadata、允许公网；
  Work Platform 需要自定义 egress，不能采用其“允许公网”默认值。
- PVC 会迫使 Claim cold start，warm pool 不能直接同时解决“每 Agent 独立持久卷”和最快分配。

令牌路径结论（源码/机制级，非本机运行实测）：

| 路径                        | 运行中更新                                    | 缩零重建        | 泄露/轮换风险                | 适用                     |
| --------------------------- | --------------------------------------------- | --------------- | ---------------------------- | ------------------------ |
| env + Secret `secretKeyRef` | Secret 更新不会改变现有进程 env，需重建       | 新 Pod 读新值   | 令牌在进程环境存活；轮换粗   | 实例级静态服务凭据       |
| Secret volume               | kubelet 可更新投影文件，但应用需 watch/reload | 新 Pod 读新值   | 文件落容器可读层，仍非逐消息 | 可轮换的实例级凭据       |
| gateway 控制通道逐消息      | 立即生效/过期                                 | 不依赖 Pod 重建 | 只在内存短驻；控制面复杂     | **用户委托令牌（推荐）** |

### 3.2 pi

- `packages/ai/src/providers/*`：provider 拥有 model、auth 和 stream；支持 per-request key。
- `packages/agent/src/agent-loop.ts`：工具 schema、调用、错误 tool result 与后续 turn。
- `packages/agent/src/harness/session/jsonl-{repo,storage}.ts`：append-only JSONL。
- `packages/coding-agent/src/core/{auth-storage,session-manager}.ts`：`auth.json` 与 session JSONL
  分离。
- `packages/agent/docs/durable-harness.md`：provider stream 不可恢复；非幂等工具在崩溃后
  默认不得自动重放。平台写工具必须有 idempotency key。

实测发现 npm 0.80.3 不导出 README 兼容示例中的 `registerFauxProvider`，实际公开导出为
`fauxProvider`。这证明不能跟 main 文档漂移，必须以 exact npm artifact 的 `.d.ts` 为准。

### 3.3 kagent

`docs/architecture/crds-and-types.md` 和 `go/api/v1alpha2/*` 表明 kagent 的 Agent CRD描述
模型、指令、工具、memory 与运行框架；`SandboxAgent`/`AgentHarness`进一步管理 agent
runtime。Agent Sandbox CRD 描述的是有状态单 Pod 的隔离、存储和生命周期。

一句话定论：**概念上互补、实现上部分重叠**——kagent 管“Agent 是什么/如何运行”，Agent
Sandbox 管“运行它的隔离工作负载”；但 kagent 已有 SandboxAgent/AgentHarness，会与我们的
pi harness + agent-gateway 编排层重叠，因此只借鉴声明式姿态，不引入。

### 3.4 OpenClaw

路径级结论：

- `docs/gateway/security/index.md`：Gateway 是单 operator trust boundary；`sessionKey` 只是
  路由键，不是授权令牌。
- session 支持 `per-channel-peer` 等发送者分区，但官方明确这不是 hostile multi-tenant
  host boundary。
- sandbox 默认建议 agent scope，更严可用 session scope；共享 scope 会共用容器/工作区。
- 外部内容使用 untrusted-content marker，并剥离常见 ChatML/Llama/Gemma 等特殊 token，
  防止伪造 system/assistant 边界；但官方仍要求工具策略、审批、sandbox 和 allowlist。

[OpenClaw 安全与隔离说明](https://github.com/openclaw/openclaw/blob/b3db79929f1c7f66d5471c6b654065292acd8fe6/docs/gateway/security/index.md)

可借鉴：Gateway 路由拓扑、sender/session key 规范、外部内容包裹与特殊 token 清洗。不能照搬：
单 operator 信任模型；Work Platform 是企业多主体，授权必须由 platform-api token 与审计
强制，而不是 session key。

### 3.5 lark-cli / AgentSkills

- Go/Cobra 命令树按业务域组织；`+动作` 是面向 agent 的高阶 shortcut，底层命令仍可直接用。
- `skills/<name>/SKILL.md` frontmatter 至少含 `name/version/description`，可带
  `metadata.requires.bins` 和 `cliHelp`；大细节下沉 `references/`，脚本和资源邻近技能。
- 本锚点有 27 个 skill 目录，既含域技能（IM、Calendar、Docs、Base），也含 workflow 技能。
- `lark-shared` 集中认证、安全和全局参数；user access token 与 tenant access token 根据
  `--as user|bot` 选择。

work-cli 基准：

```text
work <domain> <resource> <verb> [--json]
work <domain> +<agent-shortcut> [--json]
```

照搬项：域切分、稳定 JSON、分页 token、幂等/确认提示、shared skill、渐进读取 references。
差异项：不做交互式 OAuth 真源，不把长期 token 放 CLI 配置；每条生成命令绑定
`permissionCode + dataType + auditAction + confirmationPolicy`，令牌只从进程内短期注入读取。

### 3.6 hermes-agent

commit tree 中存在：

- `plugins/platforms/feishu/{adapter.py,plugin.yaml}`；
- `plugins/platforms/wecom/{adapter.py,callback_adapter.py,plugin.yaml}`；
- 对应 Feishu/WeCom 测试与用户文档。

因此 spec §3.3 遗留项结论为：**飞书、企微渠道真实存在，但为插件，不是“仅路线图”**。

技能/记忆概念：`agent/skill_{commands,preprocessing,bundles}.py` 负责技能发现、预处理和 bundle；
`agent/memory_{manager,provider}.py` 提供持久记忆抽象；gateway 有 memory monitor。可供 M19
借鉴“经验 -> 候选 skill -> 审核/整理 -> 持久库”的闭环，但自主生成技能属于供应链写入，
必须经签名、权限差异审查和人工发布，不能直接进入生产 sandbox。

## 4. 可搬运清单

本 spike 不搬第三方代码；以下是可搬的**设计块**：

| 来源          | 设计块                                                     | 缝合点                                                                      |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| pi            | provider/stream、tool loop、JSONL session repo             | 外包 Work Platform model config；包住 strict schema、idempotency、redaction |
| Agent Sandbox | SandboxDriver CRD adapter、Running/Suspended、PVC 生命周期 | 先以裸 Pod contract 定接口，CRD 过门槛后替换 driver                         |
| OpenClaw      | Gateway 路由、session key、untrusted content wrapping      | 改为 enterprise actor、platform token、审计双主体                           |
| lark-cli      | 命令域、JSON 输出、SKILL.md/references/scripts             | 由 `agentTools` 生成并嵌权限/范围/确认元数据                                |
| hermes        | skill curator / memory provider 概念                       | 延后 M19，增加审批和签名链                                                  |

## 5. 需自研清单

1. `agent.*` 实例、owner、状态机、用户会话索引。
2. SandboxDriver 三档及 lifecycle/drain/idempotent reconcile。
3. platform-api 委托令牌签发、级联吊销、agent 自主主体令牌。
4. agent-gateway 内存控制通道：逐消息 token、TTL、single-use/jti、ack 后清零。
5. 会话目录的 tenant/user 强制分区、加密、保留/删除和 owner 离职处理。
6. manifest `agentTools` 编译器及 MCP/work-cli/Skills 一致性测试。
7. 写操作平台深链确认、防重放、审计 `actor + onBehalfOf`。
8. egress allowlist（LLM、gateway-api/MCP、agent-gateway）及 DNS/IP 变化处理。

## 6. 风险与 open questions

| 风险/缺口                 | 影响                           | 处置                                                       |
| ------------------------- | ------------------------------ | ---------------------------------------------------------- |
| 唤醒数据来自单机 k3d/runc | 不能代表生产 k3s/gVisor/Kata   | 目标 Linux 节点复测，持续门槛 p95 <= 5s                    |
| PVC 与 warm pool 冲突     | 持久 Agent 可能总是 cold start | 直接 Sandbox + PVC；warm pool 仅无状态/预置层              |
| v0.5.0 API 破坏性迁移     | 升级可卡死 claim               | exact pin；CRD/objects 备份；升级前跑 bootstrap dry-run    |
| Secret/env 轮换粗         | 委托 token 撤销窗口过大        | 逐消息控制通道，不进 Secret/PVC                            |
| pi API/文档漂移           | 编译或运行破坏                 | exact pin + artifact contract tests + fork 逃生舱          |
| pi/provider 真请求未测    | 云/内网协议兼容未闭环          | 有密钥环境补 Anthropic；LLM spike 端点补 OpenAI-compatible |
| OpenClaw 单用户信任模型   | 误用会跨用户泄露               | 只借拓扑，不借授权模型                                     |
| Skills 可执行脚本供应链   | 自习得可能变成持久后门         | 只读挂载、签名、审核、版本化发布                           |
| gVisor/Kata 未冒烟        | 强隔离性能/兼容未知            | Linux VM 专测；Kata 需 nested virtualization               |

需在 Agent 身份 ADR 拍板但候选和依据已齐：

1. 是否对“敏感工具集”强制按用户实例化；建议由工具风险级别触发，而非所有 Agent 一刀切。
2. 控制通道采用 streaming gRPC 还是 mTLS WebSocket；二者都必须支持 message-bound token、
   ack、TTL、断线清理。建议先 gRPC bidi，因类型和 backpressure 更清晰。
3. CRD 何时转主线：本机 20 次样本已过线；生产准入仍要求目标 Linux/k3s 上 30 次唤醒
   p95 <= 5s，并完成 gVisor/Kata 取舍与一次 v0.4.x -> v0.5.0 演练。

## 7. 对 M15 ADR/RFC 的建议

### 7.1 编排选型

M15 首版将 `SandboxDriver` 定为稳定边界：

- **默认**：Agent Sandbox v0.5.0 CRD exact pin；
- **fallback**：裸 Pod + PVC + Service + NetworkPolicy，自管 Running/Suspended 和回收；
- **开发**：Docker driver。

本机 20 次唤醒 p95 2.974s，支持 CRD 档作为 M15 主线。结论限于 k3d/runc；目标 Linux、
强隔离 runtime 或真实 pi 镜像显著变大时，必须以相同脚本重跑，p95 超过 5s 即切裸 Pod
fallback 或评估常驻资源成本。

### 7.2 隔离与令牌三候选

| 候选             | 实现成本                         | 资源成本                      | 隔离强度                     | 主要坑                                 | 建议                     |
| ---------------- | -------------------------------- | ----------------------------- | ---------------------------- | -------------------------------------- | ------------------------ |
| 按用户实例化     | 高：实例/PVC/升级/配额乘用户数   | 高，空闲缩零仍有 PVC/对象成本 | 最强、最易证明               | 大量实例；共享 Agent 记忆重复          | 高敏工具/监管场景        |
| 单实例、会话分区 | 中：强制 user key、目录/内存隔离 | 低                            | 取决于实现                   | session key 误当 auth、缓存/记忆串用户 | **常规默认的一半**       |
| 令牌逐消息下发   | 中高：控制通道、TTL、ack/吊销    | 低                            | 解决授权，不单独解决记忆隔离 | token 被日志/异常/PVC 捕获             | **与会话分区组合为默认** |

最终推荐不是三选一，而是两个正交轴的组合：**单 Agent 实例 + 用户会话/记忆强分区**解决
数据隔离，**逐消息短期委托令牌**解决授权与撤销；高敏实例再升级为按用户实例化。

### 7.3 work-cli 与 Skills

M15 RFC 应规定：

1. manifest `agentTools` 是唯一真源；
2. 生成的 work-cli 命令稳定输出 JSON，错误沿平台统一 envelope；
3. Skills 只组合命令，不复制 endpoint、permission 或 schema；
4. 每个工具声明权限点、dataType、read/write、confirmation policy、audit action；
5. CLI 不持久化委托 token；Skills 包不得含 secret；
6. `SKILL.md` 只放路由与关键约束，长参考和确定性脚本分别放 `references/`、`scripts/`；
7. 生成快照测试保证 MCP/CLI/Skills 三投影同源不漂移。

这组结论可直接作为“Agent 身份、工具面与运行时编排”子 ADR 的候选比较，以及 M15 RFC 的
性能门槛、driver fallback 和工具包规范输入。
