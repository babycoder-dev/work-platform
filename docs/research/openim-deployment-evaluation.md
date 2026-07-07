# OpenIM 部署裁剪评估

> 服务里程碑：M13 IM Provider 集成前置 spike
>
> 任务包：`docs/tasks/vnext-spike-openim-deployment.md`
>
> 评估日期：2026-07-07

## 1. 评审对象与版本

本 spike 评估 OpenIM 作为独立 IM Provider 的最小部署形态。平台姿态沿用
`docs/adr/0001-openim-as-im-provider.md`：OpenIM 独立部署，平台仅通过
`apps/im-adapter-api` 走 REST/Webhook 接入，不让 OpenIM 接管平台账号、组织、角色或权限。

实测环境：

| 项目 | 取值 |
| --- | --- |
| 主机 | Windows + Docker Desktop Linux engine |
| Docker | `Docker version 28.3.2, build 578ccf6` |
| Docker Compose | `Docker Compose version v2.38.2-desktop.1` |
| Docker engine 资源 | 8 CPU，约 15.38 GiB memory |
| 官方 compose 仓库 | `openimsdk/openim-docker` |
| 官方 compose tag | `v3.8` |
| 官方 compose commit | `fb966382e41fc3ab01c55b8b0dd86bfbb4dc4ee2` |
| 最新 compose release 实查 | `v3.8`，GitHub release published `2026-03-09T11:20:17Z` |
| OpenIM Server 最新 release 实查 | `v3.8.3-patch.16`，GitHub release published `2026-03-19T07:24:53Z` |
| 本次实际镜像 | 官方 compose `.env` 固定的 `openim/openim-server:v3.8.3-patch.12` |

> 说明：官方 `openim-docker` 最新 compose tag `v3.8` 未随 OpenIM Server 最新 patch
> release 升到 `v3.8.3-patch.16`，其 `.env` 仍固定 `v3.8.3-patch.12`。本 spike 以
> 官方 compose tag 的固定组合为准，避免自行拼装版本。

官方默认服务与镜像：

| 服务 | 镜像 | 本次结论 | 许可证记录 |
| --- | --- | --- | --- |
| `openim-server` | `openim/openim-server:v3.8.3-patch.12` | M13 基线保留 | OpenIM Server 源码 Apache-2.0 |
| `openim-chat` | `openim/openim-chat:v1.8.4-patch.2` | 官方默认保留；未证明可裁 | 镜像 label / `openimsdk/chat` 为 Apache-2.0 |
| `mongo` | `mongo:7.0` | 保留 | MongoDB Server SSPL |
| `redis` | `redis:7.0.0` | 保留 | Redis 7.0 BSD-3-Clause |
| `kafka` | `bitnamilegacy/kafka:3.5.1` | 保留，开发可单副本 | Apache Kafka Apache-2.0；Bitnami legacy image |
| `etcd` | `bitnamilegacy/etcd:3.5.13` | 保留，开发可单节点 | etcd Apache-2.0；Bitnami legacy image |
| `minio` | `minio/minio:RELEASE.2024-01-11T07-46-16Z` | IM 媒体/文件场景保留 | MinIO AGPL-3.0 |
| `openim-web-front` | `openim/openim-web-front:release-v3.8.3` | M13 Provider 基线可不部署 | 镜像 label 为 GPL-3.0，source 指向 `openim-electron-enterprise` |
| `openim-admin-front` | `openim/openim-admin-front:release-v1.8.4-patch.2` | M13 Provider 基线可不部署 | 镜像 label 未声明 license；不纳入平台复用 |
| monitoring profile | Prometheus / Alertmanager / Grafana / Node exporter | 默认未启用，可接平台观测替代 | Prometheus/Alertmanager/Node exporter Apache-2.0；Grafana AGPL-3.0 |

许可证处理建议：

- 平台只把 OpenIM 当独立进程/镜像运行，不复制 OpenIM Server、Web、Admin、SDK 或镜像内文件进仓库。
- `openim-web-front` 与 `openim-admin-front` 不进入 M13 Provider 基线；特别是前者 image label
  指向 GPL-3.0 / enterprise 前端，不应作为平台 UI 代码来源。
- MinIO、Grafana 均有 AGPL-3.0 义务；如仅作为独立服务运行也应进入部署合规清单。

## 2. 运行实证

### 2.1 启动过程

本次在仓库外目录 `E:\Work\_spikes\openim-deployment\openim-docker` 克隆官方 compose，
未把 OpenIM 源码、镜像内容或实验脚本提交进平台仓库。

启动命令：

```powershell
git clone --branch v3.8 --depth 1 https://github.com/openimsdk/openim-docker.git E:\Work\_spikes\openim-deployment\openim-docker
docker compose up -d
docker compose ps
```

首次整体 pull 曾在 Docker Hub 匿名 token 处出现 `unexpected EOF`，之后分镜像 pull
并重试成功。默认服务最终均启动，`openim-server` 与 `openim-chat` 进入 healthy。

启动后 Kafka 有短暂 topic race：

```text
kafka server: Request was for a topic or partition that does not exist on this broker
```

随后 topic 自动出现：

```text
__consumer_offsets
toMongo
toOfflinePush
toPush
toRedis
```

生产化建议预创建 topic 或把 Kafka readiness 纳入 OpenIM 启动顺序，否则冷启动时会有短暂错误日志。

### 2.2 资源基线

测量方法：

- 空载：所有默认服务 healthy 后，`docker stats --no-stream --format '{{json .}}'`
  每 10 秒采样 1 次，共 6 次。
- 50 并发模拟：先用 REST 注册 50 个用户，再用 Python `ThreadPoolExecutor(max_workers=50)`
  并发调用 `POST /msg/send_msg` 发送 50 条文本消息，同时每 1 秒采样 Docker stats，共 8 次。
- 磁盘：测试结束后统计 compose 数据目录 `components/*` 实际占用。

空载资源：

| 服务 | CPU 平均 | CPU 峰值 | 内存平均 | 内存峰值 |
| --- | ---: | ---: | ---: | ---: |
| `openim-server` | 14.16% | 16.23% | 414.1 MiB | 414.8 MiB |
| `openim-chat` | 0.21% | 0.29% | 149.6 MiB | 149.7 MiB |
| `mongo` | 0.97% | 1.63% | 273.7 MiB | 273.7 MiB |
| `kafka` | 5.71% | 6.87% | 511.8 MiB | 512.1 MiB |
| `redis` | 0.34% | 0.44% | 9.5 MiB | 9.5 MiB |
| `etcd` | 1.18% | 2.03% | 22.1 MiB | 22.1 MiB |
| `minio` | 0.09% | 0.40% | 102.2 MiB | 102.2 MiB |
| `openim-web-front` | 0.00% | 0.00% | 8.6 MiB | 8.6 MiB |
| `openim-admin-front` | 0.00% | 0.00% | 7.4 MiB | 7.4 MiB |

50 并发模拟结果：50/50 成功，总耗时约 21.63 秒。

| 服务 | CPU 平均 | CPU 峰值 | 内存平均 | 内存峰值 |
| --- | ---: | ---: | ---: | ---: |
| `openim-server` | 36.74% | 126.85% | 391.8 MiB | 411.2 MiB |
| `openim-chat` | 10.18% | 43.47% | 150.3 MiB | 153.0 MiB |
| `mongo` | 4.58% | 29.07% | 267.6 MiB | 273.2 MiB |
| `kafka` | 9.48% | 35.04% | 504.2 MiB | 504.4 MiB |
| `redis` | 2.13% | 14.91% | 9.2 MiB | 10.2 MiB |
| `etcd` | 1.12% | 2.51% | 21.7 MiB | 21.7 MiB |
| `minio` | 0.12% | 0.40% | 100.8 MiB | 100.8 MiB |
| `openim-web-front` | 0.00% | 0.00% | 8.6 MiB | 8.6 MiB |
| `openim-admin-front` | 0.00% | 0.00% | 7.4 MiB | 7.4 MiB |

磁盘占用：

| 路径 | 用途 | 测试后占用 |
| --- | --- | ---: |
| `components/kafka` | Kafka KRaft / topic log | 1660.12 MiB |
| `components/mongodb` | Mongo data | 302.51 MiB |
| `components/redis` | Redis data | 0.32 MiB |
| `components/mnt` | MinIO data | 0.02 MiB |
| `components/etcd` | etcd data | 0.00 MiB |

容量规划输入：

- 官方默认栈空载即接近 1.5 GiB RSS；去掉两个前端只少约 16 MiB，真正的内存主体是
  Kafka、OpenIM Server、Mongo、OpenIM Chat、MinIO。
- Kafka 即使少量消息也会因 topic/log segment 预分配占用约 1.6 GiB，不能只按业务消息体估算磁盘。
- M13 单机开发/小规模试点建议为 OpenIM 独立预留至少 2-3 GiB 内存与 20 GiB 数据盘；
  若启用媒体文件，MinIO bucket 容量应按附件增长单独规划。

### 2.3 REST 链路实测

所有请求均带 `operationID`，返回片段已脱敏 token 与消息 ID。

管理员 token：

```http
POST /auth/get_admin_token
Content-Type: application/json
operationID: rest-admin-token-<ts>

{"secret":"openIM123","userID":"imAdmin"}
```

```json
{"errCode":0,"errMsg":"","errDlt":"","data":{"token":"<redacted-admin-token>","expireTimeSeconds":7776000}}
```

建用户：

```http
POST /user/user_register
token: <redacted-admin-token>

{"users":[{"userID":"wpspikeu001","nickname":"Spike User 001","faceURL":""},{"userID":"wpspikeu002","nickname":"Spike User 002","faceURL":""},{"userID":"wpspikeu003","nickname":"Spike User 003","faceURL":""}]}
```

```json
{"errCode":0,"errMsg":"","errDlt":""}
```

注意：`wp-spike-u001` 这类带连字符的 userID 被拒绝：

```json
{"errCode":1001,"errMsg":"ArgsError","errDlt":"userID is legal"}
```

M13 的 OpenIM userID 映射不能直接使用含连字符的 UUID 字符串。

建群：

```http
POST /group/create_group
token: <redacted-admin-token>

{"ownerUserID":"wpspikeu001","adminUserIDs":["wpspikeu002"],"memberUserIDs":["wpspikeu003"],"groupInfo":{"groupID":"wpspikeg002","groupName":"WP Spike Group 002","groupType":2,"notification":"","introduction":"","faceURL":"","ex":"m13-spike"}}
```

```json
{"errCode":0,"errMsg":"","errDlt":"","data":{"groupInfo":{"groupID":"wpspikeg002","groupName":"WP Spike Group 002","ownerUserID":"wpspikeu001","memberCount":4}}}
```

发系统消息：

```http
POST /msg/send_msg
token: <redacted-admin-token>

{"sendID":"imAdmin","recvID":"wpspikeu001","senderNickname":"System","senderFaceURL":"","senderPlatformID":5,"content":{"content":"[spike] system message from imAdmin"},"contentType":101,"sessionType":1,"notOfflinePush":true,"offlinePushInfo":{"title":"spike","desc":"system message","ex":""}}
```

```json
{"errCode":0,"errMsg":"","errDlt":"","data":{"serverMsgID":"<redacted-server-msg-id>","clientMsgID":"<redacted-client-msg-id>","sendTime":1783421574299,"modify":null}}
```

签发用户 token：

```http
POST /auth/get_user_token
token: <redacted-admin-token>

{"platformID":5,"userID":"wpspikeu001"}
```

```json
{"errCode":0,"errMsg":"","errDlt":"","data":{"token":"<redacted-user-token>","expireTimeSeconds":7776000}}
```

### 2.4 Webhook 实测

默认 `/openim-server/config/webhooks.yml` 指向：

```yaml
url: http://127.0.0.1:10006/callbackExample
afterUserRegister:
  enable: false
afterCreateGroup:
  enable: false
afterSendSingleMsg:
  enable: false
afterSendGroupMsg:
  enable: false
```

本次把 URL 改为 `http://host.docker.internal:10006/callback`，启用
`afterUserRegister`、`afterCreateGroup`、`afterSendSingleMsg`、`afterSendGroupMsg`，
再重启 `openim-server`。宿主机 Python listener 只用于本次实验，监听
`0.0.0.0:10006` 并写入仓库外 JSONL。

账号生命周期事件：

```http
POST /callback/callbackAfterUserRegisterCommand
Operationid: wh-user-<ts>
```

```json
{"callbackCommand":"callbackAfterUserRegisterCommand","users":[{"userID":"wpspikeu011","nickname":"Spike User 011","faceURL":"","ex":"","createTime":0,"appMangerLevel":0,"globalRecvMsgOpt":0},{"userID":"wpspikeu012","nickname":"Spike User 012","faceURL":"","ex":"","createTime":0,"appMangerLevel":0,"globalRecvMsgOpt":0}]}
```

群组生命周期事件：

```http
POST /callback/callbackAfterCreateGroupCommand
Operationid: wh-group-<ts>
```

```json
{"callbackCommand":"callbackAfterCreateGroupCommand","groupID":"wpspikeg011","groupName":"WP Spike Group 011","ownerUserID":"wpspikeu011","memberCount":4,"initMemberList":[{"userID":"wpspikeu011","roleLevel":100},{"userID":"wpspikeu012","roleLevel":60},{"userID":"wpspikeu013","roleLevel":20},{"userID":"imAdmin","roleLevel":20}]}
```

单聊消息回调：

```http
POST /callback/callbackAfterSendSingleMsgCommand
Operationid: wh-single-<ts>
```

```json
{"sendID":"wpspikeu011","callbackCommand":"callbackAfterSendSingleMsgCommand","serverMsgID":"<redacted-server-msg-id>","clientMsgID":"<redacted-client-msg-id>","operationID":"wh-single-<ts>","sessionType":1,"msgFrom":200,"contentType":101,"content":"{\"content\":\"[spike] single webhook probe\"}","ex":"single-webhook","recvID":"wpspikeu012"}
```

群聊消息回调：

```http
POST /callback/callbackAfterSendGroupMsgCommand
Operationid: wh-groupmsg-<ts>
```

```json
{"sendID":"wpspikeu011","callbackCommand":"callbackAfterSendGroupMsgCommand","serverMsgID":"<redacted-server-msg-id>","clientMsgID":"<redacted-client-msg-id>","operationID":"wh-groupmsg-<ts>","sessionType":3,"msgFrom":200,"contentType":101,"content":"{\"content\":\"[spike] group webhook probe\"}","ex":"group-webhook","groupID":"wpspikeg011"}
```

消息回调结论：

- OpenIM 能在消息发送后回调单聊与群聊消息，载荷包含 `sendID`、`recvID` 或 `groupID`、
  `serverMsgID`、`clientMsgID`、`operationID`、`sessionType`、`contentType` 与 `content`。
- 该能力足够支撑 M13 agent bot 的消息回调专线原型：`im-adapter-api` 可以接收 OpenIM
  webhook，转成平台内部事件，再由 agent bot 消费。
- 本次抓包只看到 `Operationid` 一类业务头，未观察到签名头。M13 不应把 OpenIM webhook
  直接暴露到公网；至少需要内网 ACL、不可猜测路径、共享密钥或 OpenIM 签名能力核实后再放行。

### 2.5 备份/恢复初探

本次演练 Mongo 逻辑备份 + OpenIM 配置备份，备份文件保存在仓库外目录：
`E:\Work\_spikes\openim-deployment\backup-20260707-191040`。

备份命令：

```powershell
docker exec mongo bash -lc 'rm -rf /tmp/openim-mongodump && mongodump --host 127.0.0.1:27017 -u openIM -p openIM123 --authenticationDatabase openim_v3 --db openim_v3 --out /tmp/openim-mongodump'
docker cp mongo:/tmp/openim-mongodump E:\Work\_spikes\openim-deployment\backup-20260707-191040\mongo-dump
docker cp openim-server:/openim-server/config E:\Work\_spikes\openim-deployment\backup-20260707-191040\openim-server-config
docker cp openim-chat:/openim-chat/config E:\Work\_spikes\openim-deployment\backup-20260707-191040\openim-chat-config
```

恢复演练：

```bash
mongorestore --host 127.0.0.1:27017 -u root -p openIM123 --authenticationDatabase admin --db openim_restore /tmp/openim-mongodump/openim_v3
```

恢复结果：

```json
{"collections":34,"users":57,"msgs":54,"groups":2}
```

`mongorestore` 输出：

```text
411 document(s) restored successfully. 0 document(s) failed to restore.
```

最小备份策略：

- 必备：OpenIM Mongo 逻辑备份、`openim-server` / `openim-chat` 配置、部署 `.env` 与镜像 tag/digest 清单。
- 启用媒体/文件后必备：MinIO bucket 数据与 bucket policy/credential。
- Redis 更偏在线状态/cache，但官方配置已开启持久化目录；是否恢复 Redis 需要按 OpenIM
  会话状态与在线状态要求单独定级。
- Kafka 承担消息异步投递管道。若要求零丢消息，备份窗口应先停写或进入维护模式，并明确
  Kafka topic retention 与未消费消息恢复策略；否则可按“Mongo 为最终消息库，Kafka 可重建”处理。

## 3. 关键子系统解剖

阅读对象：

| 路径/配置 | 结论 |
| --- | --- |
| `internal/api/router.go` | REST 路由包含 `/auth/get_admin_token`、`/auth/get_user_token`、`/user/user_register`、`/group/create_group`、`/msg/send_msg`。token 白名单只覆盖管理员取 token 与 token 解析等少量接口。 |
| `internal/api/auth.go` | 管理员 token 与用户 token 均走 OpenIM Auth RPC，平台侧应由 `im-adapter-api` 封装，不把 OpenIM token 发散到业务模块。 |
| `internal/api/msg.go` | `send_msg` 要求调用者是 app manager；支持 text、picture、voice、video、file、custom、OA notification 等 content type。M13 系统消息可走该接口或后续评估 `send_business_notification`。 |
| `pkg/common/storage/cache/redis/user.go` | 用户信息查询依赖 Redis cache 路径；停 Redis 后管理员 token 链路在用户信息读取处失败。 |
| `/openim-server/config/webhooks.yml` | Webhook 默认关闭；按 callback command 粒度开关，URL 为全局配置。 |
| `/openim-server/config/kafka.yml` | 默认 topic 包括 `toRedis`、`toMongo`、`toPush`、`toOfflinePush`。 |
| `/openim-server/config/mongodb.yml` | 默认 database 为 `openim_v3`，`maxPoolSize: 100`。 |
| `/openim-server/config/redis.yml` | 默认 standalone Redis，`db: 0`，`poolSize: 100`，密码 `openIM123`。 |
| `/openim-server/config/minio.yml` | 明确依赖 S3/MinIO bucket；未发现本地盘替代 provider 配置。 |

REST 适配要点：

- OpenIM REST 返回格式是 `errCode/errMsg/errDlt/data`，平台 HTTP 错误格式必须由
  `im-adapter-api` 转换成统一 `{success, code, message, traceId, details}`。
- OpenIM `userID` 规则比平台 UUID 更窄；平台需要稳定映射，例如去连字符 UUID、短 ID
  映射表或 `im_user_id` 字段，不能直接透传平台主键。
- OpenIM admin secret 与 admin token 属于 provider secret，只能存在 `im-adapter-api`
  服务端密钥管理中。

## 4. 可搬运清单

本 spike 不建议搬运 OpenIM 代码或前端，只搬运部署/接口设计结论：

| 可搬运项 | 搬运方式 | 缝合点 |
| --- | --- | --- |
| 官方 compose 的服务拆分 | 写成独立 `deploy/openim-provider` 或运维 runbook，不并入平台主 compose 默认路径 | `docs/deployment.md` 后续容量规划；M13 RFC |
| REST admin/user/group/msg 调用顺序 | 封装成 `packages/im-provider` 的 provider adapter contract | `apps/im-adapter-api` |
| Webhook command 粒度 | 映射为平台内部事件类型 | notification/realtime/event pipeline |
| OpenIM userID 约束 | 落为平台账号到 OpenIM ID 的映射策略 | platform-core identity / im-adapter |
| 备份脚本骨架 | 形成 OpenIM provider 运维 runbook | deployment / ops docs |

不搬运项：

- 不复制 OpenIM Server 源码。
- 不复制 OpenIM Web/Admin 前端。
- 不复制 OpenIM SDK，尤其不引入客户端 SDK 合规风险。
- 不把官方镜像内配置文件提交进仓库；只记录需要设置的配置项。

## 5. 需自研清单

| 能力 | 自研原因 |
| --- | --- |
| `im-adapter-api` REST 封装 | 统一鉴权、错误格式、traceId、审计与 OpenIM token 隔离。 |
| 平台账号到 OpenIM userID 映射 | OpenIM userID 不接受直接 UUID 形态，且不能让 OpenIM 接管账号。 |
| Webhook 安全入口 | 本次未观察到签名头；平台必须自建内网入口、共享密钥/签名校验、幂等与重放防护。 |
| 消息回调到 agent bot 的事件路由 | OpenIM 只负责回调，平台要决定哪些会话/消息触发 agent、如何限流、如何审计。 |
| 组织/群组同步策略 | OpenIM 群不是平台组织/权限源；群创建、成员同步、角色映射需由平台编排。 |
| 统一运维备份策略 | Mongo、MinIO、Kafka、Redis 的恢复语义不同，需要平台自己的 runbook。 |
| 容量与部署 profile | 单机开发、内测试点、生产 HA 的拓扑必须由平台定义，不能直接照搬 demo compose。 |

## 6. 风险清单

| 风险 | 等级 | 证据 | 缓解 |
| --- | --- | --- | --- |
| Kafka 不可去除 | 高 | 停 Kafka 后 `send_msg` 返回 broker lookup 失败 | M13 基线保留 Kafka；单机可单 broker，生产预创建 topic 并监控 lag |
| Redis 不可去除且默认 DB 0 | 高 | 停 Redis 后管理员 token 链路在用户信息 cache 读取处失败 | 默认独立 Redis；若共享平台 Redis，必须 DB/ACL/key prefix/连接池隔离并压测 |
| Webhook 未见签名头 | 高 | listener 捕获 header 未包含签名类字段 | 不公网暴露；由 `im-adapter-api` 加内网 ACL、共享密钥、幂等与审计 |
| OpenIM userID 规则不兼容 UUID | 中 | `wp-spike-u001` 被拒绝为 `userID is legal` | 平台维护 OpenIM ID 映射 |
| Kafka 磁盘预分配明显 | 中 | 少量消息后 `components/kafka` 约 1.6 GiB | 数据盘按 topic segment/retention 规划，不按消息体估算 |
| 前端镜像 license 不适合复用 | 中 | web-front label GPL-3.0；admin-front license label 缺失 | M13 不部署/不复用 OpenIM 前端 |
| MinIO AGPL 与现平台 files 不同 | 中 | 当前平台部署基线是本地 files volume，不是 S3 | OpenIM 媒体独立 MinIO；未来平台 S3 化后再评估共享 |
| 官方 compose patch 滞后 | 低 | compose v3.8 固定 server patch12，server 最新为 patch16 | M13 RFC 固定整套版本并建立升级演练 |

## 7. 对 RFC 的建议

### 7.1 组件裁剪逐项结论

| 组件/问题 | 结论 | 依据 |
| --- | --- | --- |
| Kafka 可否单副本 | 可单副本，仅限开发/小规模试点 | 官方 compose 使用单 broker KRaft，REST/Webhook 实测可跑通。 |
| Kafka 可否去除 | 不可裁 | 停 Kafka 后 `send_msg` 直接失败，错误为无可用 broker。 |
| MinIO 可否复用平台 files | 当前不可共享 | `docs/deployment.md` 的平台 files 是本地文件卷，OpenIM 配置需要 S3/MinIO bucket。 |
| MinIO 可否改本地盘 | 未证明可行，不建议 | 官方配置未提供本地盘 object provider；停 MinIO 只证明文本消息可发，不能覆盖图片/文件/语音。 |
| MinIO 可否共享未来对象存储 | 可共享基础设施，不共享 bucket/credential | 若平台后续引入 S3-compatible MinIO，可同集群独立 bucket、access key、生命周期策略。 |
| Mongo 最小副本形态 | 单机 standalone 可作为最小形态 | 官方 compose 为 standalone Mongo 7.0，全部 REST/Webhook/备份恢复实测通过。 |
| Mongo 可否去除 | 不可裁 | OpenIM 用户、群、消息最终状态在 Mongo；备份恢复也以 Mongo 为核心。 |
| Redis 可否共享平台 Redis | 默认不共享；严格隔离后可再评估 | OpenIM 默认 DB 0、poolSize 100，停 Redis 会影响 auth/user cache；平台 Redis 还承担 session/cache/stream。 |
| Redis 可否去除 | 不可裁 | 停 Redis 后管理员 token 链路失败。 |
| OpenIM Web/Admin 前端 | M13 Provider 基线可裁 | 平台不复用 OpenIM UI；REST/Webhook 链路不依赖这两个前端。 |
| Monitoring profile | 可裁或接平台观测 | 官方默认 profile 未启用；Grafana AGPL 也增加合规面。 |

### 7.2 推荐部署形态

M13 RFC 建议定义独立 `openim-provider` compose 拓扑，不并入平台主 compose 的默认启动路径：

```text
openim-provider
├─ openim-server
├─ openim-chat
├─ mongo        # standalone for dev/small pilot; HA profile later
├─ redis        # isolated instance, not platform Redis by default
├─ kafka        # single broker KRaft for dev/small pilot
├─ etcd         # single node for dev/small pilot
└─ minio        # dedicated bucket for OpenIM media/files

platform
└─ apps/im-adapter-api
   ├─ calls OpenIM REST over private network
   ├─ owns OpenIM admin secret/token lifecycle
   └─ receives OpenIM webhook on private callback URL
```

不建议在 M13 默认部署：

- `openim-web-front`
- `openim-admin-front`
- OpenIM 客户端 SDK
- OpenIM monitoring profile 中的 Grafana stack

### 7.3 资源基线表

| 场景 | 内存输入 | CPU 输入 | 磁盘输入 |
| --- | --- | --- | --- |
| 空载默认栈 | 约 1.5 GiB | `openim-server` 与 Kafka 有持续背景 CPU | Kafka 约 1.6 GiB，Mongo 约 0.3 GiB |
| 50 并发文本消息 | `openim-server` 峰值约 411 MiB，Kafka 约 504 MiB | `openim-server` 峰值 126.85%，Kafka 峰值 35.04%，Mongo 峰值 29.07% | 文本消息对 MinIO 增长极小，Kafka 仍是主要基础占用 |
| M13 开发/试点建议 | OpenIM 独立预留 2-3 GiB memory | 至少 2 vCPU，推荐 4 vCPU 以上 | 至少 20 GiB 数据盘；启用媒体后按 MinIO bucket 单独扩容 |

### 7.4 备份策略建议

M13 RFC 至少写入以下 runbook：

1. 固定 OpenIM compose tag、镜像 tag、镜像 digest 与配置校验和。
2. 维护窗口内停止写入或让 `im-adapter-api` 暂停写操作。
3. `mongodump` OpenIM Mongo 数据库。
4. 备份 `openim-server` / `openim-chat` 配置与 `.env`。
5. 启用媒体后备份 MinIO bucket 数据与 credential/policy。
6. 明确 Redis 与 Kafka 的恢复等级：若不恢复，说明会丢失哪些在线状态、队列中消息或推送任务。
7. 每个版本升级前做一次 `mongorestore` 到临时库的恢复演练。

### 7.5 Webhook 能力结论

消息回调可行，且足以支撑 ADR-0009 D10 与 M13 spec §7 的 agent bot 回调专线：

- 单聊消息：`callbackAfterSendSingleMsgCommand` 已实测。
- 群聊消息：`callbackAfterSendGroupMsgCommand` 已实测。
- 生命周期：用户注册、建群事件已实测。
- 关键字段：`sendID`、`recvID/groupID`、`serverMsgID`、`clientMsgID`、`operationID`、
  `sessionType`、`contentType`、`content` 均可拿到。

RFC 必须同时写入安全边界：

- OpenIM webhook 只能打到 `im-adapter-api` 的内网地址。
- `im-adapter-api` 必须做幂等、重放保护、traceId 贯通与审计。
- 若 OpenIM 后续版本提供 webhook 签名，应启用签名校验；否则平台自行加共享密钥/路径密钥。
- agent bot 不直接接 OpenIM webhook，必须经平台事件层过滤、限流和权限判断。

### 7.6 RFC go/no-go

建议 M13 进入 RFC：Go。

条件：

- OpenIM 作为独立 provider，不进入平台账号/权限核心。
- 不复用 OpenIM 前端或客户端 SDK。
- M13 首版只承诺 REST/Webhook provider adapter，不承诺 OpenIM HA 生产拓扑。
- 默认部署使用独立 Redis、Mongo、Kafka、MinIO；共享平台 Redis/MinIO 必须另开部署 RFC 或运维变更。
