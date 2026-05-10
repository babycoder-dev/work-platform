# IM 基建设计

## 1. 定位

IM 基建分为两层：

```text
实时协作基础设施
  事件总线
  通知中心
  WebSocket Gateway
  在线状态
  未读数
  系统消息

完整 IM 产品能力
  单聊
  群聊
  消息历史
  文件消息
  已读回执
  搜索
  组织群
```

第一阶段优先做实时协作基础设施，并通过 OpenIMServer POC 验证未来完整 IM 的落地路径。

## 2. 组件

```text
apps/im-adapter-api
  平台与 OpenIM 的适配层

packages/im-provider
  IM Provider 抽象接口

OpenIMServer
  独立部署的 IM 服务端
```

## 3. 事件流

业务事件转系统通知：

```text
approval.instance.completed
  -> platform event bus
  -> notification service
  -> im-adapter-api
  -> OpenIM REST API
  -> 用户收到系统消息
```

用户同步：

```text
platform.users.created
  -> im-adapter-api
  -> OpenIM import/create user

platform.users.disabled
  -> im-adapter-api
  -> OpenIM block/disable user
```

Webhook 回调：

```text
OpenIM Webhook
  -> im-adapter-api
  -> audit log
  -> optional platform event
```

## 4. 边界

允许：

```text
platform-api -> im-adapter-api
notification service -> im-adapter-api
im-adapter-api -> OpenIM REST API
OpenIM Webhook -> im-adapter-api
```

禁止：

```text
business module -> OpenIM REST API
client -> OpenIM admin API
OpenIM -> platform database
OpenIM account -> platform primary identity
```

## 5. 第一阶段不做

- 不做完整聊天 UI。
- 不接入 AGPL 客户端 SDK。
- 不复制 OpenIM Demo 代码。
- 不把 OpenIM ChatServer 作为主账号系统。
- 不让业务模块直接感知 OpenIM。
