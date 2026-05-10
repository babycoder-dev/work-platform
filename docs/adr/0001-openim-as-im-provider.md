# ADR 0001: 使用 OpenIM 作为可插拔 IM Provider

## 状态

Accepted

## 背景

平台长期需要 IM、实时通知、在线状态、系统消息等协作能力。自研完整 IM 链路成本较高，且短期重点仍是平台基建、企业账号、权限、审批、在位管理、工作汇报。

OpenIM 提供可私有化部署的 IM 服务端、REST API、Webhook、消息同步、群组与会话能力，适合作为 IM 基础设施接入。

## 决策

采用 OpenIMServer 作为默认 IM Provider，但不将 OpenIM 代码直接并入本仓库，不 Fork，不让 OpenIM 接管平台账号、组织、角色、权限。

新增 `im-adapter-api` 作为平台与 OpenIM 之间的适配层。

```text
platform-api
  企业 / 员工 / 组织 / 角色 / 权限 / 登录

im-adapter-api
  用户同步
  token 换取
  系统通知投递
  OpenIM REST API 封装
  OpenIM Webhook 接收
  Provider 抽象

openim-server
  IM 消息核心链路
  会话 / 群组 / 离线消息 / 消息同步
```

## 原则

- 平台账号体系仍由 `platform-api` 持有。
- OpenIM 用户 ID 使用平台用户 ID 映射，不反向成为主身份源。
- 业务模块不直接调用 OpenIM，只调用平台事件、通知服务或 `im-adapter-api`。
- C/S 客户端与 Web UI 是否接入 OpenIM SDK，需要单独做 License 与技术评估。
- 第一阶段只验证服务端 REST API 与 Webhook，不集成 AGPL 客户端 SDK。
- OpenIM 可以替换，平台内部使用 `ImProvider` 抽象。

## License 约束

根据 OpenIM 官方文档：

- OpenIMServer: Apache-2.0
- ChatServer: Apache-2.0
- OpenIMClientSDK: AGPL-3.0
- Demo / Sample UI: AGPL-3.0

因此：

- 服务端可作为独立基础设施部署并通过 REST/Webhook 接入。
- 客户端 SDK 不能默认进入闭源客户端代码，需要开源合规确认。
- 示例 UI 不复制、不改造、不直接并入本项目。

## 初始 POC

第一轮 POC 只做五件事：

1. 内网部署 OpenIMServer。
2. 平台创建用户后，通过 `im-adapter-api` 同步 OpenIM 用户。
3. `im-adapter-api` 获取 OpenIM 管理员 token。
4. 平台事件转为 OpenIM 系统消息发送给指定用户。
5. `im-adapter-api` 接收 OpenIM Webhook 并写入审计日志。

## 后续演进

```text
Phase A: 系统通知
Phase B: 单聊/群聊
Phase C: 组织群自动维护
Phase D: Web/C/S 客户端 IM SDK 合规接入
Phase E: 搜索、归档、审计、敏感词
```

## 影响

收益：

- 快速获得成熟 IM 服务端能力。
- 避免平台团队短期自研复杂消息链路。
- 保持账号、权限、组织模型自主。
- 后续替换 IM Provider 的成本可控。

代价：

- 部署复杂度增加。
- 需要维护 OpenIM 与平台账号同步一致性。
- 客户端 SDK 有 AGPL 合规评估成本。
- OpenIM 数据模型与平台组织权限之间需要适配层。
