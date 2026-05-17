# 项目核心架构与开发宪法 v0.1

## 1. 项目目标

建设一个公司内部轻量级协作工作平台，短期替代或补充飞书中高频但不复杂的能力：

- 审批：请假、外出等简单行政流程。
- 在位管理：出差、外出调研、休假等状态登记，并提供统一看板。
- 日/周工作汇报：员工填写、逐级汇总、领导查看团队整体情况。

长期预留 IM、多维表格、日历与事项能力，但当前不实现。

系统必须支持企业内网无公网环境部署。身份源默认使用企业内部账号，不依赖飞书、企业微信、LDAP、互联网 OAuth 或外部 OIDC。

系统需要同时提供 Web UI 与 C/S 客户端。Windows 7 使用 Web UI 兼容模式，不提供原生 C/S 客户端；原生 C/S 客户端首期面向 Windows 10+/Windows 11 x64，Linux 后续优先考虑 Ubuntu x64。

## 2. 架构路线

项目采用“模块化工作台 + 微前端就绪”的渐进架构。

- 第一阶段：单仓库、统一工作台、模块化边界、统一平台 API。
- 第二阶段：业务模块保持独立目录、独立 contract、独立 API prefix、独立 schema。
- 第三阶段：当模块需要独立部署或团队自治时，可升级为远程微前端。

本项目不以“微前端运行时”为第一目标，而以“模块自治边界”为第一目标。

## 3. 技术栈

- 前端：React + TypeScript + Vite
- 后端：NestJS + TypeScript
- C/S 客户端：Qt 6.8 LTS C++，优先使用 Qt Widgets 或轻量 Qt Quick，避免依赖 Qt WebEngine。Qt 授权路线必须在客户端正式开发前完成 ADR：闭源内网交付需评估商业授权或 LGPL 动态链接义务，禁止在未审查的情况下静态链接 LGPL Qt。
- 数据库：PostgreSQL
- 缓存与轻队列：Redis
- 工作区：pnpm workspace + Nx
- API 契约：OpenAPI + 共享 DTO/schema
- 代码质量：ESLint + Prettier + TypeScript strict
- 提交规范：Conventional Commits

## 4. 核心原则

- Shell 只负责平台能力，不写业务逻辑。
- 业务模块不直接依赖其他业务模块的内部实现。
- 每个业务模块必须有 `web`、`api`、`contract`。
- C/S 客户端不得拥有独立业务规则，只能调用公开 API 或使用公开 contract。
- 每个业务模块必须声明 manifest、权限点、菜单、路由、事件、API prefix。
- 跨模块协作只能通过公开 API、领域事件、平台 SDK。
- IM 能力必须通过 `im-adapter-api` 与 `ImProvider` 抽象接入，业务模块不得直接调用 OpenIM。
- 数据库按 schema 隔离，禁止业务模块随意跨 schema join。
- AI 生成代码必须优先遵守本文件。

## 5. 内网部署原则

- 前端不得引用公网 CDN、外部字体、外部图标资源。
- 构建依赖必须支持内网镜像或离线包导入。
- Docker 镜像必须支持导入企业内部镜像仓库。
- 文档、安装包、数据库迁移脚本必须可在无公网环境执行。
- 认证、授权、审计、密码策略均由平台自持。

## 6. C/S 客户端原则

- C/S 客户端位于 `clients/desktop-qt`。
- C/S 客户端通过 `gateway-api` 访问平台能力。
- C/S 客户端与 Web UI 共享账号、权限、数据范围、API 契约。
- C/S 客户端不直接连接数据库。
- C/S 客户端首期只支持 64 位 Windows。
- Linux 客户端不是首期重点，后续优先支持 Ubuntu x64。
- Windows 7 只要求 Web UI 可用，不拖累原生客户端技术栈。
- C/S 客户端性能优先级高于界面技术统一，必须控制启动时间、内存占用和低配机器体验。
- 不将现代 Electron、Tauri 或 Flutter 作为 Windows 7 兼容客户端默认方案。

## 7. Windows 7 兼容策略

- Windows 7 用户使用 Web UI 访问系统。
- Web UI 提供 legacy build 或兼容构建目标，优先兼容 Chrome 109、Edge 109、Firefox 115 ESR 等旧系统可用浏览器。
- Windows 7 兼容只覆盖核心高频功能，不承诺所有高级交互一致。
- 不为 Windows 7 维护旧版 Electron、旧版 Qt 或旧版 WebView2 客户端。

## 8. 模块边界

允许的依赖：

```text
业务模块 -> 自己的 contract
业务模块 -> packages/platform-sdk
业务模块 -> packages/http-client
业务模块 -> packages/ui
业务模块 -> packages/errors
业务模块 -> packages/logger
```

禁止的依赖：

```text
presence -> approval/api/internal
approval -> report/web/internal
report -> presence/db
业务模块 -> Shell 内部状态
业务模块 -> 其他业务模块数据库表
```

## 9. 权限模型

权限分三类：

- 菜单权限：控制菜单是否展示。
- 操作权限：控制按钮、接口、动作。
- 数据范围权限：控制能看到哪些人的数据。

内置数据范围：

```text
self
department
department_tree
company
custom
```

## 10. 统一错误格式

所有 API 错误必须返回统一结构：

```json
{
  "success": false,
  "code": "PRESENCE_STATUS_CONFLICT",
  "message": "当前时间段已有状态登记",
  "traceId": "01HX...",
  "details": {}
}
```

## 11. HTTP 与 API 版本规范

前端禁止直接使用裸 `fetch` 或裸 `axios`。所有请求必须经由 `@work/http-client`。

对外稳定 API 必须有版本边界。首期约定：

- gateway-api 对外暴露 `/api/v1/...`。
- 当前开发期 `platform-api` 的 `/api/platform/...` 属于内部前缀，接入 gateway-api 后映射到 `/api/v1/platform/...`。
- 已发布版本不得做破坏性变更；破坏性变更必须新开版本或提供兼容层。
- Web UI、C/S 客户端和业务模块不得硬编码未发布的服务内部地址。

请求头约定：

```text
Authorization: Bearer <token>
X-Trace-Id: <trace-id>
X-Tenant-Id: <tenant-id> 可选
```

## 12. Git 规范

分支：

```text
main
feat/*
fix/*
chore/*
docs/*
release/*
```

提交必须使用 Conventional Commits：

```text
feat: add presence module manifest
fix: correct permission data scope
chore: configure eslint boundary rules
docs: add architecture constitution
```

## 13. 里程碑验收口径

本文件不单独定义“第一阶段”。所有阶段验收以 `docs/foundation-blueprint.md` 的 M0-M8 为准，避免文档口径漂移。

近期硬门槛：

- M1：平台核心持久化。必须完成 PostgreSQL schema、迁移、seed、密码 hash、持久化 session、PostgreSQL repository、数据库 E2E 与 CI 门禁。
- M2：权限、菜单、审计闭环。必须完成 module manifest 持久化、菜单与权限注册、数据范围接口、审计日志 service。
- M3：Web Shell 可用基座。必须完成登录态、当前用户、权限菜单、模块挂载、统一 HTTP client、401/403/500 处理。

审批、在位管理、日/周报等业务模块只有在依赖的基建里程碑达标后，才允许进入可交付开发。
