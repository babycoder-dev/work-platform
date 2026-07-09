# 任务包：vNext spike —— Agent 运行时评估（M15 前置）

状态：Ready（**前置**：`docs/adr/0006-vnext-roadmap.md` 与 `docs/research/README.md`
随文档落地计划 Task 1/6 入库后方可开工）｜ 类型：研究型 spike（产出报告，不改产品代码）｜
依据 `docs/adr/0006-vnext-roadmap.md`（设计推演见
`docs/superpowers/specs/2026-07-05-vnext-roadmap-design.md` §3.3/§8）；报告规范见
`docs/research/README.md`。

## 1. 目标

为 M15"Agent 基座 v1（数字员工）"的两份上游文档——**Agent 身份、工具面与运行时编排子
ADR** 与 **M15 RFC**——产出实证输入。回答四个问题：

1. **pi harness 可嵌入性**：pi-ai / pi-agent-core 作为库嵌入我们 agent 运行时的真实边界在哪？
2. **Agent Sandbox CRD 成熟度**：k8s Agent Sandbox 能否承载"常驻实例 + 空闲缩零 + 秒级唤醒
   + 持久卷"的数字员工模型？
3. **隔离与令牌语义候选评估**：spec §8.3 决策位（按用户实例化 / 会话分区 / 令牌逐消息下发）
   在真实运行时里各自的实现成本与坑。
4. **work-cli 与 AgentSkills 形态基准**：lark-cli 的命令组织与 skills 格式，哪些直接照抄、
   哪些因我们有统一权限底盘而必须不同。

## 2. 范围

**做**：

- **pi-mono（earendil-works/pi）**：锁定当前 release 跑通——① pi-ai 双通道实测（Anthropic
  API + 任一本地 OpenAI 兼容端点；LLM spike 环境可用则共享，不可用则本地 Ollama 独立完成，
  两包解耦）；② pi-agent-core 注入 3 个自定义工具（模拟平台工具面：一读一写一确认），观察
  tool-call 循环、流式输出、错误处理；③ 会话持久化格式解剖（文件结构、能否按用户分区、
  体积增长、**是否把 API key/token 等鉴权材料写进落盘文件**——spec §8.3"令牌逐消息下发、
  不落卷"候选的直接证据）；④ 治理核查：移交 earendil-works 后的许可证现状（逐子包）、
  release 节奏、破坏性变更历史 → 版本锁定与 fork 逃生舱策略建议。
- **Kubernetes Agent Sandbox（SIG Apps）**：k3d/kind 起单机集群装 controller，实测——
  ① Sandbox CR 创建到可用的时延；② `shutdownTime/shutdownPolicy` 缩零行为；③ 缩零后唤醒
  时延（数字员工"被 @ 秒级唤醒"的可行性红线：p95 ≤ 5s，**采样 ≥ 20 次**，超出则评估常驻
  不缩零的资源代价）；④ PVC 持久工作区跨重建的保持；⑤ **令牌注入路径实测**：env/Secret
  注入 vs 运行中更新的可行性、缩零重建后令牌如何跟随——spec §8.3 三候选对比的核心证据；
  ⑥ **egress 白名单冒烟**：k3d 内 NetworkPolicy 对沙箱 Pod 的生效形态（M15 硬约束，顺手
  验证；受限则列 open question）；⑦ gVisor/Kata 强隔离运行时**文档级核实 + Linux VM 冒烟
  （若可得）**——本机 Windows/k3d 环境大概率跑不了 runsc，测不了如实列 open question，
  不烧时间盒；⑧ API 版本（alpha/beta？）与升级破坏面 → SandboxDriver 三档中 CRD 档的
  落地建议与版本锁定策略。
- **kagent（CNCF）**：文档级核实（不部署、不引入）——Agent-as-CRD 声明式姿态与 Agent
  Sandbox CRD 编排的关系一句话定论（互补/重叠/无关），半天内。
- **OpenClaw**：只读源码不引代码——gateway/session/sandbox 三个子系统的路径级解剖，提炼
  per-agent 沙箱作用域、会话落盘、多渠道桥接、提示注入防护的设计要点清单。
- **lark-cli（@larksuite/cli）**：命令域组织（11 域怎么切）、AgentSkills 包格式（frontmatter/
  脚本约定）、鉴权形态（token 从哪来）→ `work-cli` 与平台 Skills 包的形态基准 + "单源三投影"
  编译目标的差异清单（我们多权限点绑定）。
- **hermes-agent**：仅两项——① 渠道清单核实（飞书/企微渠道是否真实存在，spec §3.3 遗留
  待核实项）；② skills 自习得与持久记忆的机制概念解剖（M19 素材，不实测）。
- **资源基线**：单沙箱（pi 运行时 + 基础镜像）内存/磁盘占用、10 个并发沙箱的单机开销
  → 容量规划输入（`docs/deployment.md` vNext 容量规划章）。

**不做**：

- 不接平台真实 API/权限（模拟工具即可）；不做 IM 桥接（M13 之后才有通道）；不写任何进
  `apps/` `modules/` `packages/` 的代码；不评估闭源方案。

## 3. 执行步骤

1. 环境：本机 Docker + k3d（或 kind）；pi 用 npm 全局安装或仓内 scratch 目录，**不进产品
   仓依赖**。
2. 按 §2 顺序执行，pi 与 Sandbox CRD 两块为主（各约 40% 时间盒），OpenClaw/lark-cli/hermes
   合计约 20%。
3. 每块随做随记：版本号/commit、命令、观测数字、源码路径级结论。
4. 汇总写报告 `docs/research/agent-runtime-evaluation.md`（按 README 七章规范）。

## 4. 产出与验收断言

- [ ] 报告含 README 规范全部七章，评审对象全部带版本/commit 锚点。
- [ ] **关键数字实测在案**：Sandbox 创建时延、缩零后唤醒时延（p50/p95，≥20 次采样）、
      单沙箱内存基线、10 沙箱单机开销；唤醒时延与 5s 红线的判定结论明确。
- [ ] 报告产出后登记回 `docs/research/README.md` spike 表（状态改「已产出」）。
- [ ] **三个决策建议**直接可写进 Agent 子 ADR：① 编排选型（CRD 档可用性结论 + 版本锁定
      策略，或降级裸 Pod 档的触发条件）；② 隔离/令牌语义三候选的成本对比与推荐；③ work-cli
      + Skills 包的形态基准（含与 lark-cli 的差异清单）。
- [ ] pi 治理核查结论（逐子包许可证 + 版本锁定建议）与 hermes 渠道核实结论落档。
- [ ] 报告不含任何"需要拍板但未列候选与依据"的悬空句。

## 5. 风险与时间盒

- 时间盒：**5 个工作日等效**（研究型，超盒即带现有结论收口，缺口列为 open questions）。
- Agent Sandbox CRD 若在目标环境跑不起来（alpha 阶段常见）：如实记录，SandboxDriver 主线
  档降级为裸 Pod + 自管生命周期，报告给出该档的补做清单——这本身就是合格结论。
- 报告只支撑决策、不定义规则（权威性同 `docs/tasks/*.md`）。
