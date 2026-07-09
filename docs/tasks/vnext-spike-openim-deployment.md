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
