# 顶层架构设计

## 1. 总览

```text
workbench-shell
  登录态 / 导航 / 菜单 / 权限 / 模块挂载 / 全局体验

platform-api
  用户 / 组织 / 角色 / 权限 / 应用注册 / 审计

im-adapter-api
  OpenIM 适配 / 用户同步 / 系统通知 / Webhook

modules/notification/api
  站内通知 / 未读 / 触发点配置 / 接收人解析 / 调度基建 / 通知渠道编排（经 gateway-api 装配）

realtime-gateway
  平台实时通道 / 站内通知推送 / 状态刷新

gateway-api
  当前：API 组合宿主，内嵌业务模块 + 边缘职责（前缀 / trace / 错误格式）
  服务拆分后（归 vNext）：纯边缘网关（反向代理 / 鉴权透传 / 限流 / API 版本）
  边界详见 docs/adr/0003-gateway-boundary.md

business modules
  presence / notification / approval / report

desktop clients
  Windows / Linux C/S client

infra
  PostgreSQL / Redis / Nginx / Object Storage / Message Bus
```

## 2. 前端架构

前端初期采用一个 Shell 应用，业务模块以本地模块方式挂载。

```text
apps/workbench-shell
  src/
    app/
    layout/
    module-registry/
    routes/
    auth/

modules/presence/web
  src/
    module.ts
    pages/
    api/
    components/
```

模块通过 manifest 接入 Shell：

```ts
export interface WorkModuleManifest {
  name: string;
  title: string;
  basePath: string;
  apiPrefix: string;
  menus: ModuleMenu[];
  permissions: PermissionDefinition[];
  routes: ModuleRoute[];
}
```

未来如果模块需要独立部署，Shell 的加载方式可以从：

```ts
import { presenceModule } from '@work/presence-web';
```

升级为：

```ts
const presenceModule = await loadRemoteModule('presence');
```

## 3. 后端架构

后端初期分为：

- `gateway-api`：当前作为 API 组合宿主内嵌业务模块；服务拆分后退化为纯边缘网关（拆分归 vNext，见 `docs/adr/0005-product-replan-roadmap.md`）。边界见 `docs/adr/0003-gateway-boundary.md`。
- `platform-api`：平台能力。组织部门、员工、角色、权限和审计均由 Platform Core 持有；业务模块不得复制组织树或绕过平台 API / 只读 port 直接维护人员组织数据。员工档案读写由 Platform Core 单一写收口按 `profile` 数据范围授权，业务模块只消费公开 API / port。近况记录归 `platform.status_logs`，同样按 `profile` 范围读写，不发布领域事件，前端在人员页聚合展示。人页聚合不在后端跨 schema 编排；前端分别调用 platform 固定档案 / forms 自定义记录 / presence 当前在位端点，各端点自行套用对应数据范围。
- `modules/*/api`：业务模块后端。

业务模块后端必须保持自己的 module、controller、service、repository、contract。

```text
modules/presence/api/src/
  presence.module.ts
  status/
  board/
  statistics/
```

## 3.1 身份认证架构

身份源默认是企业内部账号，由 `platform-api` 自持：

```text
platform.users
platform.local_identities
platform.departments
platform.roles
platform.permissions
platform.user_roles
```

登录方式：

```text
Web UI / C/S Client
  -> gateway-api
  -> platform-api/auth
  -> access token + refresh token
```

认证设计原则：

- 默认账号密码登录。
- 密码只保存强哈希结果，禁止明文或可逆加密。
- 支持密码策略、锁定策略、登录审计。
- OIDC/LDAP 仅作为未来可选适配器，不作为第一阶段依赖。
- 所有客户端使用同一套 token 与权限模型。

## 3.2 C/S 客户端架构

C/S 客户端作为独立客户端层，不复用 Web UI 运行时。

推荐技术：

```text
Qt 6.8 LTS C++ Client
  Windows 10+ x64
  Windows 11 x64
  Ubuntu x64, later phase
  HTTP API client
  Local config
  Optional SQLite draft cache
```

不推荐把 Web UI 包进桌面壳作为默认方案：

- Electron 23 起不支持 Windows 7/8/8.1，Electron 22 是最后一个支持旧 Windows 的主版本。
- WebView2/Edge 对 Windows 7 的官方支持已停留在旧版本，现代 Tauri 方案存在运行时与安全维护风险。
- Flutter 桌面开发环境面向 Windows 10/11，不适合作为 Windows 7 兼容目标。

因此，Windows 7 不进入原生 C/S 客户端目标平台。桌面端优先采用 Qt 6.8 LTS C++，并避免 Qt WebEngine。Windows 7 用户通过 Web UI 兼容模式访问核心功能。

首期客户端平台优先级：

```text
P0: Windows 10/11 x64
P1: Ubuntu x64
P2: 其他 Linux 发行版
```

性能要求：

- 启动速度、内存占用、低配机器可用性优先于 Web UI 复用。
- 初始性能基线已确认：冷启动 2 秒内进入登录页、空闲内存小于 120 MB、1000 人在位看板无明显卡顿。
- 优先使用 Qt Widgets 实现高频业务界面。
- 大列表、看板、审批待办必须使用分页、虚拟列表或增量加载。
- 网络请求必须异步，禁止阻塞 UI 线程。
- 本地缓存仅保存必要配置、token 与草稿数据，默认不做大规模离线同步。
- 桌面端渲染不得引入内嵌浏览器作为主界面。

## 3.3 Windows 7 Web UI 兼容模式

Windows 7 使用 Web UI，不提供原生 C/S 客户端。

兼容目标：

```text
Chrome 109
Edge 109
Firefox 115 ESR
```

策略：

- 前端构建增加 legacy target。
- Web Shell 初始 Vite build target: `chrome109`、`edge109`、`firefox115`。
- 不使用必须依赖现代浏览器的新 API。
- 静态资源全部内网部署，不使用公网 CDN。
- 保留核心功能可用：登录、在位看板、状态登记、审批待办、日/周报填写。
- 高级实时能力、复杂表格、重交互页面可以对 Windows 7 降级。

C/S 客户端只实现高频操作：

- 登录与用户信息
- 在位看板与状态登记
- 审批待办与处理
- 日/周报填写与查看
- 通知提醒

复杂管理配置优先放在 Web UI。

## 4. 数据架构

PostgreSQL 初期使用一个实例，按 schema 隔离：

```text
platform.users
platform.local_identities
platform.departments
platform.roles
platform.permissions
platform.role_permissions
platform.user_roles
platform.audit_logs
platform.domain_events

notification.notification
notification.trigger_config
notification.schedule_config

presence.status_records
presence.status_types

approval.approval_instances
approval.approval_tasks

report.work_reports
report.report_summaries
```

模块只读写自己的 schema。需要组织、人员、权限时，通过 `platform-api` 或平台只读快照获取。

## 5. 通信机制

模块通信分三类：

```text
1. URL 导航
2. 公开 API
3. 领域事件
```

领域事件示例：

```text
presence.status.changed
approval.instance.completed
report.weekly.submitted
```

当前内嵌阶段使用 `@work/nest-common` 的全局 `EventBusModule` 提供单例 `EVENT_BUS`，presence /
files / forms / notification 共享同一进程内 `MemoryEventBus`。M7-2 已用
`presence.status.changed` → notification 订阅器证明跨模块事件可达；未来服务拆分时保留事件契约并替换为
Redis Stream / outbox / 消息队列。

notification 的接收人解析只通过 `@work/platform-contract` 暴露的进程内只读 `PLATFORM_ORG_PORT`
获取平台数据：`resolveDepartmentManager(enterpriseId,userId)` 与
`listUserIdsByRole(enterpriseId,roleCode)` 均由 platform-api 实现，只返回 user id，不开放 HTTP 端点，
不允许 notification 直接读 platform schema。

notification 模块承载调度基建：`NotificationModule` 装配一次 `ScheduleModule.forRoot()`，
`SchedulerBootstrapService` 启动时从 `notification.schedule_config` 读取 `cron` / `enabled` 并动态注册
`CronJob`，销毁时停止并删除本服务注册的 job。M7-3 已启用 `notification.heartbeat` 占位 job 证明框架可用；
`report.reminder.due` 与 `report.reminder.completed` 仅作为 M10 日报提醒接线点预留，默认 disabled。
当前调度是进程内单实例 best-effort；多副本部署时每个副本都会触发 cron，分布式锁 / leader 选举 / DB advisory
lock 属后续多副本调度协调预留。

notification 模块同时持有 SSE 推送端点：`GET /api/notification/stream` 由 Nest `@Sse()` 暴露，
经 gateway 全局 `PlatformAuthGuard` 鉴权，不单设功能权限。连接登记在进程内 `NotificationStreamRegistry`
（按 userId 支持多标签页），`NotificationService.create()` 落库后只推送 `{ type: 'notification.created' }`
最小信号；通知正文、未读数和列表仍以 REST API 为事实源。当前推送也是单实例直推，多副本 fan-out 通过
PostgreSQL `LISTEN/NOTIFY` 或 Redis pub/sub 预留。

Workbench Shell 通过 `@work/http-client.stream()` 消费该 SSE 端点：Bearer token 只放在
`Authorization` 头中，SSE 帧只作为重拉 REST 通知列表 / 未读数的信号，`keepalive` 与未知事件不触发刷新。
断线后 shell 回退 60 秒 REST 轮询并按 5/15/30 秒退避重连。顶栏铃铛与工作台“最新消息”卡片接
`GET /api/notification` / `GET /api/notification/unread-count`；触发点配置页落在
`modules/notification/web`，经 notification manifest + shell module registry 挂载到
`/notification/trigger-config`。

M8-3 起，员工档案被他人修改且实际字段有变化时，platform-api 从档案写收口发布
`profile.updated`；notification 订阅后直接给被改本人生成站内通知。该事件 payload 只携带 id 与
变更字段名，不携带档案字段值。

当前 `gateway-api` 是 API 组合宿主，`PlatformModule` 与 `NotificationModule` 共享进程内
`EVENT_BUS`。生产反向代理必须把 `/api/platform/*` 与其它 `/api/*` 一并路由到 gateway；
不得绕过 gateway 直连独立 `platform-api`，否则 `profile.updated` 无法跨进程到达 notification
订阅器。真正拆分服务前须先引入可靠的跨进程事件传输。

## 5.1 IM Provider

OpenIMServer 作为默认 IM Provider 独立部署，平台通过 `im-adapter-api` 接入。

```text
platform-api
  -> im-adapter-api
  -> OpenIM REST API

OpenIM Webhook
  -> im-adapter-api
  -> audit log / platform event
```

边界：

- OpenIM 不接管平台账号。
- 业务模块不直接调用 OpenIM。
- 客户端 SDK 接入需单独做 AGPL 合规评估。
- OpenIM 可替换，平台内部依赖 `ImProvider` 抽象。

## 6. 微前端演进策略

不是所有模块都需要独立远程化。

适合升级为远程微前端的条件：

- 独立团队维护。
- 独立发布频繁。
- 体积或复杂度明显高于普通模块。
- 需要与主工程使用不同技术栈。
- 要被多个系统复用。

未来优先考虑远程化：

- IM
- 多维表格
- 日历

审批、在位、日报初期保持本地模块化即可。
