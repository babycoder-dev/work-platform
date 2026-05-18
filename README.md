# Work Platform

公司内部轻量级协作工作平台。

短期聚焦三个高频模块：

- 在位管理
- 审批
- 日/周工作汇报

长期预留：

- IM 即时通讯
- 多维表格
- 日历与事项
- Windows/Linux C/S 客户端
- OpenIM IM Provider 接入

## 架构策略

本项目采用“模块化工作台 + 微前端就绪”的渐进架构：

- 初期使用单仓库、统一工作台、模块化业务边界。
- 每个业务模块拥有独立的 `web`、`api`、`contract`。
- 所有模块通过 manifest、权限点、API prefix、领域事件接入平台。
- 后续当模块需要独立发布或团队自治时，可升级为远程微前端。
- Web UI 与 C/S 客户端复用同一套后端 API、权限体系和业务契约。
- 系统默认部署在企业内网，不依赖公网资源、CDN 或外部身份源。

## 关键目录

```text
apps/
  workbench-shell/
  gateway-api/
  platform-api/
  im-adapter-api/
  notification-api/
  realtime-gateway/

clients/
  desktop-qt/

modules/
  presence/
  approval/
  report/

packages/
  platform-sdk/
  http-client/
  errors/
  logger/
  ui/
  event-bus/
  notification-center/
  im-provider/
  platform-contract/

docs/
  doc-index.md
  constitution.md
  architecture.md
  foundation-blueprint.md
  security-baseline.md
  platform-core.md
  im-foundation.md
  development-workflow.md
  deployment.md
  github-cicd.md
  verification-log.md
  adr/
  module-contract.md
  desktop-client.md
  iteration-roadmap.md
  rfc/
```

## 默认技术栈

- Frontend: React + TypeScript + Vite
- Backend: NestJS + TypeScript
- Database: PostgreSQL
- Cache/Queue: Redis
- Desktop Client: Qt 6.8 LTS C++，首期目标 Windows 10+/Windows 11 x64
- Linux: 后续优先考虑 Ubuntu x64
- Windows 7: 使用 Web UI 兼容模式，不提供原生 C/S 客户端
- Workspace: pnpm workspace + Nx
- API Contract: OpenAPI + shared DTO/schema

## 第一阶段目标

先搭建平台基建，并用 `presence` 在位管理模块验证模块接入协议。

当前执行顺序以 `docs/foundation-blueprint.md` 为准：先完成 Platform Core 持久化、权限菜单审计闭环、Web Shell 可用基座，再进入完整业务模块开发。

文档阅读入口见 `docs/doc-index.md`。M1 Platform Core 持久化以 `docs/rfc/m1-platform-core-persistence.md` 和 `docs/security-baseline.md` 为执行约束。

## 常用命令

```bash
pnpm install
pnpm verify
pnpm docker:build
pnpm db:setup
```

`pnpm db:setup` 依赖 `DATABASE_URL`，会执行 PostgreSQL 迁移并写入平台基础 seed 数据。开发环境默认管理员为 `admin/admin123`；生产环境必须通过 `PLATFORM_BOOTSTRAP_ADMIN_PASSWORD` 显式注入初始密码。

`platform-api` 默认使用 PostgreSQL repository。需要无数据库的本地 API smoke 或单测 fixture 时，显式设置 `PLATFORM_REPOSITORY_DRIVER=memory`。
