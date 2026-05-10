# OpenIM Deployment Placeholder

OpenIM 作为独立 IM Provider 部署，不将其源码或配置直接并入平台主仓库。

本目录只记录平台侧接入约定：

- OpenIMServer 由内网基础设施部署。
- `im-adapter-api` 通过 OpenIM REST API 调用管理能力。
- OpenIM Webhook 指向 `im-adapter-api`。
- 平台账号仍由 `platform-api` 持有。

## 必需配置

```text
OPENIM_API_BASE_URL=
OPENIM_ADMIN_USER_ID=
OPENIM_ADMIN_SECRET=
OPENIM_WEBHOOK_SECRET=
```

## POC 验收

- 管理员 token 获取成功。
- 平台用户同步到 OpenIM。
- 系统消息发送给指定用户。
- Webhook 可以被 `im-adapter-api` 接收。
- 失败请求有日志和 traceId。
