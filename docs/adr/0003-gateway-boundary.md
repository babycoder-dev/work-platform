# ADR 0003: Gateway 边界与业务模块承载形态

## 状态

Accepted

## 背景

`apps/gateway-api` 当前通过 `imports: [PresenceModule]` 把业务模块作为 NestJS module 直接内嵌进 gateway-api 进程运行。`platform-api` 则是独立进程。

但 `docs/architecture.md` 把 gateway-api 描述为"统一入口 / 鉴权 / 转发 / 限流"，暗示它是一个反向代理边缘层。这与实现不一致：当前的 gateway-api 既是边缘入口，又是业务模块的运行宿主。

M4 即将引入第一个真实业务模块 presence，M5/M6 会再引入 approval 和 report。如果不先固定 gateway 的边界形态，会持续出现两个问题：

- 文档与实现长期漂移，新成员 onboarding 困惑。
- M5/M6 每接入一个业务模块，都要重新争论"现在是否应该拆成独立服务"。

本 ADR 固定 gateway 在各阶段的承载形态和拆分时点。

## 决策

### 1. M4–M6：gateway-api 作为 API 组合宿主

M4–M6 期间，业务模块（presence、approval、report）以 NestJS module 形式内嵌在 gateway-api 进程中运行。gateway-api 同时承担边缘职责：统一 `/api` 前缀、trace id、统一错误格式。

这是一种"模块化单体"承载形态：物理上单进程，逻辑上每个业务模块仍保持独立边界。

### 2. platform-api 保持独立进程

platform-api 不并入 gateway-api。理由：

- 数据边界：只有 platform-api 持有 `platform` schema 的写权限和数据库连接。
- 安全边界：认证、会话、审计集中在 platform-api。

这条边界在 M4–M6 与 M7 都不变。

### 3. M7：拆为独立业务服务 + 纯边缘网关

进入 M7（通知、实时、IM 基建）时，统一把内嵌的业务模块拆为独立进程，gateway-api 退化为纯边缘网关：反向代理、鉴权透传、限流、对外 API 版本映射。

### 4. 拆分触发条件：硬绑定 M7 里程碑

M4–M6 一律内嵌，不因单个模块的局部理由提前拆分。进入 M7 时统一拆。

## 关键取舍

### 为什么 M4–M6 内嵌，而不是一开始就微服务

- `constitution.md` 与 `foundation-blueprint.md` 已确立"模块自治边界优先，不以微服务运行时为第一目标"。
- 系统默认内网部署、低流量、小团队，过早引入多进程分布式只增加运维和调试成本。
- 模块边界由 contract、manifest、数据库 schema 保证，不依赖进程隔离。

### 为什么硬绑 M7，而不是按信号提前拆

- 按信号（独立发布需求、团队自治）提前拆，会让本 ADR 的边界变模糊，且 M5/M6 每次接入模块都要重新评估。
- M7 是 `foundation-blueprint.md` 已定义的里程碑，本来就要引入 notification-api、realtime-gateway 等独立进程和消息通道。在 M7 一次性完成业务服务拆分，代价最低、时点最清晰。

### 内嵌不等于可以走捷径

即使业务模块与 gateway-api 同进程运行，仍必须遵守 `constitution.md` 第 8 节的依赖规则：

- 业务模块之间不得直接 import 对方的内部实现。
- 业务模块之间通过公开 API、领域事件、platform-sdk 协作。
- 内嵌只是部署形态，不放松任何模块边界约束。

## 与其它决策的关系

- 跨进程、跨模块的鉴权机制不在本 ADR 范围内，由 ADR-0004（Phantom Token 跨进程认证）单独决定。
- 对外 API 版本：`constitution.md` 第 11 节已确定 gateway-api 对外暴露 `/api/v1/...`。M4–M6 内嵌阶段，服务内部前缀 `/api/<module>` 暂不强制映射到 `/api/v1`；`/api/v1` 对外映射在 M7 gateway-api 成为独立边缘层时一并落地。这与 `docs/rfc/m4-presence-mvp.md` §6 的约定一致。

## 影响

### 正向

- M4–M6 部署运维简单：进程少、配置少、故障面小，契合内网交付。
- 业务模块的 contract、manifest、schema 边界已经清晰，M7 拆分时业务代码基本不动，只改装配与部署。

### 代价

- gateway-api 进程会随 M5/M6 接入模块而变重。
- M7 拆分是一次明确的、需要规划的工作量：进程切分、鉴权透传、Docker Compose 调整。

### 文档影响

- `docs/architecture.md` 中 gateway 的描述需修正，明确"M4–M6 为 API 组合宿主，M7 起为纯边缘网关"。
- `docs/foundation-blueprint.md` 第 2 节的 edge 层描述保持不变，但 gateway 的实际承载形态以本 ADR 为准。
- 本 ADR 为 `docs/foundation-blueprint.md` 的 M7 里程碑新增一项交付：把内嵌的业务模块拆分为独立服务、gateway-api 退化为纯边缘网关。M7 交付清单需同步补充该项。
