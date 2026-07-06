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
| Agent 运行时评估（pi/OpenClaw 拓扑 + Agent Sandbox CRD 实测 + kagent 姿态文档级核实 + lark-cli 的 CLI/Skills 形态解剖） | M15 | `docs/tasks/vnext-spike-agent-runtime.md` | `agent-runtime-evaluation.md`（待产出） |
| ~~内网 LLM 推理基线评估~~ | M15 | `docs/tasks/vnext-spike-llm-inference.md` | **已取消**（2026-07-07 拍板：采购线上 API，见 ADR-0006 状态节增补拍板；残留义务改道见任务包状态行） |
| Teable 解剖（DDL 层/公式/视图/协同） | M17-M18 | `docs/tasks/vnext-spike-teable-anatomy.md` | `teable-anatomy.md`（待产出） |

> OpenIM spike 须产出资源占用实测，汇总为 `docs/deployment.md`"vNext
> 部署基线与容量规划"的输入（单机堆叠 vs 拆机的判断依据）。（原并列的 LLM spike
> 已随 2026-07-07 拍板取消，容量规划不再含 GPU 档。）
