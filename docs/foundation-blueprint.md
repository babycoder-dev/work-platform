# 全局基建蓝图 v0.1

本文档定义项目从“可运行脚手架”演进到“可承载多个业务模块的平台”的基建路线。它优先回答三个问题：

- 哪些能力属于平台基建，必须先统一。
- 哪些能力可以延后，但现在必须预留边界。
- 每个阶段完成到什么程度，才允许进入下一阶段。

## 1. 总体判断

当前项目不应马上进入审批、在位、工作汇报的完整业务开发。更合理的路径是先把平台基建做到“业务模块可以稳定接入”的程度，再用在位管理作为第一个业务模块验证。

核心原则：

- 先稳定平台边界，再堆业务功能。
- 先统一认证、权限、组织、HTTP、事件、审计、数据库迁移，再做模块私有能力。
- 每个模块都必须能独立演进，但不能绕过平台基建。
- 所有阶段都必须通过 CI 与 Docker 构建，保证内网迁移部署可验证。

## 2. 分层目标架构

```text
clients
  workbench-shell     Web 工作台
  desktop-qt          Windows 10+/11 x64 原生客户端

edge
  gateway-api         统一入口、鉴权透传、trace、限流、API version

platform foundation
  nest-common         HTTP 基建、错误格式、trace、DTO 校验
  http-client         前端/C/S HTTP SDK
  logger              日志规范
  errors              错误模型
  event-bus           领域事件抽象
  notification-center 通知抽象；M7 前只提供契约和 no-op/事件落库边界，不承诺推送能力

platform core
  platform-api        企业、组织、员工、账号、角色、权限、菜单、审计、会话
  platform-contract   平台 API 契约
  platform-sdk        平台客户端 SDK

business modules
  presence            在位管理
  approval            审批
  report              日/周报

integrations
  im-adapter-api      OpenIM 适配、用户同步、Webhook
  realtime-gateway    WebSocket/SSE 实时通道

infra
  PostgreSQL          schema 隔离、迁移、seed
  Redis               session/cache/stream
  Docker Compose      开发与内网部署
  GitHub Actions      CI/CD
```

## 3. 平台能力地图

### 3.1 已经具备的基础

- pnpm workspace + Nx 基础结构。
- React/Vite Web Shell 骨架。
- NestJS API 骨架。
- 统一错误格式。
- trace id 中间件。
- API exception filter。
- 平台认证 guard。
- 权限 guard 与 `@RequirePermissions`。
- Platform Core 内存 repository。
- DTO 请求校验。
- GitHub Actions：lint、typecheck、unit、e2e、build、docker build。
- Docker Compose 生产构建验证。

### 3.2 进入业务模块前必须补齐

这些是 M1/M2 的硬门槛：

- PostgreSQL schema 与迁移机制。
- Platform Core repository 从内存实现替换为 PostgreSQL 实现。
- 初始管理员安装/seed 流程。
- 密码强哈希、密码策略、首次登录改密预留。
- 账号会话/session store，优先 Redis 或数据库持久化。
- 菜单与模块注册模型。
- 审计日志模型。
- 领域事件 outbox 或稳定事件表。
- 前端 `@work/http-client` 与 platform SDK 初版。
- Web Shell 登录态、权限菜单、模块挂载。

### 3.3 可延后但必须保留边界

- OpenIM 深度集成。
- WebSocket 实时消息。
- 多维表格。
- 日历事项。
- 模块远程微前端加载。
- 桌面端复杂业务界面。
- 高级数据权限表达式。

这些能力不能现在实现完整版本，但当前设计必须避免未来推倒重来。

## 4. 模块边界

平台模块与业务模块按以下规则依赖：

```text
business module api
  -> own contract
  -> platform-contract
  -> event-bus
  -> errors/logger/nest-common

business module web
  -> own contract
  -> platform-sdk
  -> http-client
  -> ui

business module
  -X-> another business module internals
  -X-> another business module database tables
  -X-> OpenIM directly
  -X-> Shell private state
```

业务模块需要平台信息时，只允许三种方式：

- 调用 platform-api 公开 API。
- 读取平台提供的只读快照或 SDK。
- 订阅平台领域事件。

## 5. 数据边界

PostgreSQL 采用单实例、多 schema：

```text
platform.*
presence.*
approval.*
report.*
notification.*
integration.*
```

规则：

- `platform` schema 只由 platform-api 写入。
- 业务模块只写自己的 schema。
- 业务模块不得跨 schema 随意 join。
- 必须跨模块统计时，优先通过查询 API、只读快照、事件投影表实现。
- 所有 schema 变更必须走迁移脚本。

首期平台核心表：

```text
platform.enterprises
platform.departments
platform.employees
platform.local_identities
platform.roles
platform.permissions
platform.role_permissions
platform.user_roles
platform.sessions
platform.module_manifests
platform.menus
platform.audit_logs
platform.domain_events
```

`platform.domain_events` 的归属明确为：M1 建表和 schema 契约，M2 才激活写入、outbox 投递和消费语义。M1 不要求业务事件完整落库。

跨 schema 数据访问的具体落地规则（业务模块允许的数据流通道、SQL 与 import 红线、典型场景模板、platform 出口扩出流程）见 `docs/module-contract.md §7.1`。本节只定义抽象规则；模块作者写代码时以 `module-contract.md §7.1` 为准。

## 6. 接口与错误边界

所有新增 HTTP API 必须同时满足：

- 对外稳定路由必须经 gateway-api 暴露为 `/api/v1/...`；服务内部前缀不得被客户端长期依赖。
- request body 使用 DTO，并通过统一校验。
- response 使用 contract 中的 DTO。
- 失败响应统一为 `ErrorResponse`。
- 受保护接口必须声明权限。
- 写操作必须记录审计日志或明确说明为什么暂不记录。
- E2E 至少覆盖成功路径、未登录、无权限、非法入参。

统一错误格式：

```json
{
  "success": false,
  "code": "HTTP_400",
  "message": "validation message",
  "traceId": "trace-id",
  "details": {}
}
```

## 7. 事件与通知边界

事件先采用轻量实现，但接口必须稳定。

事件命名：

```text
platform.employee.created
platform.user.roles.assigned
presence.status.changed
approval.instance.completed
report.weekly.submitted
notification.created
```

阶段策略：

- M1：进程内 event bus + 事件类型定义 + `platform.domain_events` 表结构。
- M2：激活 domain_events/outbox 写入、投递边界和消费幂等约束。
- M3：Redis Stream 或消息队列适配。
- M4-M6：业务模块只发布可追踪事件，不交付真实通知推送。
- M7：notification-api、notification-center、realtime-gateway 与 IM adapter 形成通知和实时推送闭环。

业务模块只能发布自己的领域事件，不能直接调用其他业务模块内部 service。

M7 前的通知过渡策略：

- 业务模块只发布领域事件，不直接发站内信、IM 或 WebSocket 推送。
- `notification-center` 可以提供契约、no-op 实现或把待通知事件写入事件表。
- M4-M6 如出现“提醒”需求，只要求事件可追踪；真实站内通知、实时推送、IM 分发统一到 M7 交付。

## 8. IM 边界

OpenIM 可以作为默认 IM Provider，但不能成为平台基础账号系统。

规则：

- 平台账号、组织、权限仍由 platform-api 维护。
- OpenIM 用户同步由 im-adapter-api 完成。
- 业务模块不直接调用 OpenIM REST API。
- 客户端 SDK 接入必须单独做 AGPL 合规评估。
- 平台内部只依赖 `ImProvider` 抽象。

IM 第一阶段只需要完成：

- Provider interface。
- OpenIM REST/Webhook POC。
- 用户同步任务边界。
- 系统通知到 IM 的适配边界。

M7 前如业务模块遇到 IM 需求，只能声明事件和通知意图，不允许临时直连 OpenIM。

## 9. 客户端边界

### 9.1 Web Shell

Web Shell 负责：

- 登录态。
- 导航。
- 权限菜单。
- 模块注册。
- 全局布局。
- 全局错误与 loading。

Web Shell 不负责：

- 业务模块内部状态。
- 业务模块表单逻辑。
- 业务模块私有 API 适配。

### 9.2 Desktop Qt

Qt 客户端首期只面向 Windows 10+/11 x64。

规则：

- 不直连数据库。
- 不复制业务规则。
- 不内嵌 WebView 作为主界面。
- 通过 gateway-api 和 platform SDK 访问后端。
- 本地只保存配置、token、少量草稿。

Windows 7 只保证 Web UI 核心功能可用。

声明 Windows 7 Web UI 兼容前，必须补充 Vite legacy/browserslist 配置，并至少验证 Chrome 109、Edge 109 或 Firefox 115 ESR 中的核心登录与业务路径。

## 10. 里程碑

### M0：架构基线

目标：统一规则，避免局部开发失控。

完成标准：

- `constitution.md`、`architecture.md`、本文档、ADR 同步。
- 所有新增任务能映射到明确里程碑。
- CI 绿色。

当前状态：基本完成，本文档补齐后进入 M1。

### M1：平台核心持久化

目标：Platform Core 从内存实现升级为可部署实现。

交付：

- 数据库迁移工具选型与配置。
- `pnpm-lock.yaml` 提交并通过 CI frozen lockfile 安装验证。
- `platform` schema 初版。
- PostgreSQL repository。
- seed 初始企业、部门、权限、角色、管理员。
- 密码 hash。
- session store。
- token/session 密钥来源、生产环境缺失即失败、轮换预案。
- repository 单元测试。
- platform-api E2E 覆盖数据库实现。

退出标准：

- 删除或降级内存 store 为测试专用。
- `pnpm-lock.yaml` 已提交，CI 使用 frozen lockfile 安装。
- Docker Compose 启动后可登录管理员。
- CI 包含数据库 E2E。

### M2：权限、菜单、审计闭环

目标：业务模块接入时不再自行实现权限和菜单。

交付：

- module manifest 持久化。
- 菜单表与权限点注册。
- 数据范围解析接口。
- 审计日志 service。
- Web Shell 权限菜单。
- 平台管理 API 最小集。

退出标准：

- 一个模块只提交 manifest 即可出现在 Shell 菜单。
- API、菜单、按钮权限走同一套权限点。
- 写操作有审计记录。

### M3：Web Shell 可用基座

目标：形成可日常使用的主入口。

交付：

- 登录页。
- 当前用户信息。
- 权限菜单。
- 模块路由挂载。
- 统一 HTTP client。
- token 续期或过期处理策略。
- 统一 401/403/500 展示。

退出标准：

- 在位模块能按 manifest 接入。
- 普通员工和管理员看到不同菜单。

### M4：在位管理 MVP

目标：用第一个业务模块验证平台基建。

交付：

- 状态类型。
- 状态登记。
- 全员/部门看板。
- 数据范围过滤。
- 状态变更事件。
- Web 页面。
- API + contract + E2E。

退出标准：

- 一个真实部门可试用。
- 权限、审计、事件、菜单全部走平台基建。

### M5：审批 MVP

目标：验证流程类业务和跨模块事件。

交付：

- 请假/外出审批。
- 简单流程配置。
- 待办任务。
- 审批通过后可触发在位状态。
- 审批事件。

退出标准：

- 审批模块不直接写 presence 表。
- 通过事件或公开 API 完成协作。

### M6：日/周报 MVP

目标：验证组织层级汇总和数据范围。

交付：

- 日报/周报填写。
- 直属领导查看。
- 部门汇总。
- 未提交提醒事件。

退出标准：

- 数据范围对员工、主管、部门负责人可验证。

### M7：通知、实时、IM 基建

目标：让平台具备协作系统的实时能力。

交付：

- notification-api 可用。
- realtime-gateway 可用。
- OpenIM adapter 初版。
- 系统通知可进入站内通知和 IM。
- 内嵌业务模块（presence/approval/report）拆分为独立服务，gateway-api 退化为纯边缘网关。详见 `docs/adr/0003-gateway-boundary.md`。

退出标准：

- 业务模块只发布事件，不直接处理 IM 推送。

### M8：客户端与内网交付

目标：形成可迁移到企业内网的交付包。

交付：

- Docker 镜像构建与导出说明。
- 数据库迁移执行说明。
- Windows x64 客户端打包。
- Web legacy 构建验证。
- 安装、升级、回滚文档。

退出标准：

- 在无公网环境中完成部署演练。

## 11. 当前推荐下一步

下一步应进入 M1，不应继续扩业务页面。

M1 实施细节以 `docs/rfc/m1-platform-core-persistence.md` 为准；认证、密码、session、审计和密钥要求以 `docs/security-baseline.md` 为准。

优先级：

1. 选定数据库迁移工具。
2. 建立 platform schema。
3. 实现 PostgreSQL repository。
4. 增加 seed 与数据库 E2E。
5. 替换开发期明文密码与内存 session。

推荐迁移工具：

- 首选：Drizzle Kit + drizzle-orm。
- 理由：TypeScript 一体化、迁移可读、适合 NestJS、比 Prisma 更轻，内网部署时 runtime 依赖更少。
- 约束：锁定 Drizzle 相关版本，迁移脚本必须提交，不能只依赖自动同步或生产环境 schema sync。

## 12. 质量门禁

每个完成单元必须满足：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
docker compose -f infra/docker-compose.prod.yml build
```

本机网络不可用时，以 GitHub Actions 为准，但必须记录本机失败原因。

## 13. 风险清单

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 过早开发业务模块 | 后续权限、审计、菜单返工 | M1/M2 完成前只允许做验证型业务 |
| 内存 store 继续扩大 | 切库成本升高 | M1 替换为 PostgreSQL repository |
| 权限只做接口，不做菜单 | Web Shell 无法精确控制入口 | M2 做菜单与权限注册 |
| OpenIM 直接侵入业务 | IM 难替换，合规风险扩大 | 只通过 im-adapter-api 和 ImProvider |
| 桌面端复制业务规则 | 多端行为不一致 | 桌面端只调用公开 API |
| 无 lockfile | 依赖不可复现，内网离线部署不可验证 | M1 退出前提交 `pnpm-lock.yaml`，CI 改为 frozen lockfile |
| CI 只测构建不测部署 | 内网迁移不可控 | 保留 docker build，后续增加部署冒烟测试 |
| Drizzle Kit API 快速迭代 | 迁移生成行为漂移 | 锁定版本，提交 SQL 迁移，CI 执行迁移验证 |
| 无备份恢复演练 | 内网数据故障不可恢复 | M8 前补 PostgreSQL 备份、恢复、回滚演练 |
| 内网未启用 TLS | token 与敏感数据可被监听 | gateway/Nginx 使用企业 CA 或自签 CA 终止 HTTPS |
| 数据库连接池失控 | 低配内网服务器连接耗尽 | 每个服务显式配置 pool 上限，默认从 5-10 起步并压测调整 |

## 14. 架构检查清单

新增任何模块或基建前，必须回答：

- 是否属于平台基建、业务模块、客户端、集成层之一。
- 是否需要新增 contract。
- 是否需要新增权限点。
- 是否需要新增菜单项。
- 是否需要审计日志。
- 是否需要领域事件。
- 是否需要数据库迁移。
- 是否影响 Docker 内网部署。
- 是否影响 API 版本兼容。
- 是否影响备份、恢复、TLS 或密钥管理。
- 是否需要 Web 与桌面端共享能力。
- 是否有单元测试和 E2E。
