# 顶层架构设计

## 1. 总览

```text
workbench-shell
  登录态 / 导航 / 菜单 / 权限 / 模块挂载 / 全局体验

platform-api
  用户 / 组织 / 角色 / 权限 / 应用注册 / 审计

im-adapter-api
  OpenIM 适配 / 用户同步 / 系统通知 / Webhook

notification-api
  站内通知 / 未读 / 通知渠道编排

realtime-gateway
  平台实时通道 / 站内通知推送 / 状态刷新

gateway-api
  统一入口 / 鉴权 / traceId / 转发 / 限流 / API 版本

business modules
  presence / approval / report

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

- `gateway-api`：统一入口。
- `platform-api`：平台能力。
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

notification.notifications

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

事件先用进程内 event bus 或 Redis Stream，占位接口保持稳定，未来可替换为消息队列。

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
