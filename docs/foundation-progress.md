# 基建进度看板

本文档记录平台基建当前做到哪里、还剩什么、下一步做什么。它不替代 `foundation-blueprint.md` 和 RFC，只作为执行进度入口。

规则：

- 阶段范围和退出标准以 `docs/foundation-blueprint.md` 为准。
- M1 具体实现以 `docs/rfc/m1-platform-core-persistence.md` 为准。
- 每完成一个可交付切片，必须更新本文档和 `docs/verification-log.md`。
- 状态只使用：`Done`、`In Progress`、`Pending`、`Blocked`。

## 1. 总览

| 阶段 | 目标 | 状态 | 当前结论 |
| --- | --- | --- | --- |
| M0 架构基线 | 统一架构、文档、CI、Docker 基线 | Done | 可以支撑基建优先开发 |
| M1 平台核心持久化 | Platform Core 从内存实现升级为 PostgreSQL | Done | 默认 repository 已切换 PostgreSQL；内存实现已降级为测试/显式 fallback；M1 验收项已完成 |
| M2 权限、菜单、审计闭环 | 模块权限、菜单、审计统一接入 | Done | M2-4 已提交，CI 已通过；权限、菜单、审计链路可支撑 Shell 和模块接入 |
| M3 Web Shell 可用基座 | 登录态、权限菜单、模块挂载 | Done | M3-3 浏览器级 smoke 已完成；登录、权限菜单、模块挂载、404 和未登录保护路由均已验证 |
| M3.5 收口切片 | M4-1 启动前的基建闭环：manifest 单源、Gateway ADR、登录安全、scope resolver、Shell 路由、跨 schema 规则 | Done | M3.5-A 至 M3.5-G 全部完成；M3.5 退出，启动 M4-1 |
| M4 在位管理 MVP | 第一个业务模块验证平台基建 | In Progress | M4-2 API/权限/审计/事件已完成；下一步 M4-3 Web |
| M5 审批 MVP | 流程类业务验证 | Pending | 依赖 M4 与事件协作边界 |
| M6 日/周报 MVP | 组织层级汇总与数据范围验证 | Pending | 依赖 M2 数据范围能力 |
| M7 通知、实时、IM 基建 | notification、realtime、OpenIM adapter 可用 | Pending | 当前只保留边界 |
| M8 客户端与内网交付 | Docker 离线迁移、客户端打包、部署演练 | Pending | 当前只完成 Docker build 基线；服务镜像裁剪和部署 smoke 未完成 |

## 2. M0 架构基线

状态：Done

已完成：

- pnpm workspace + Nx 基础结构。
- React/Vite Web Shell 骨架。
- NestJS API 骨架。
- 统一错误格式、trace id、exception filter。
- 平台认证 guard、权限 guard、权限装饰器。
- Platform Core 内存 repository。
- GitHub Actions 基础 CI。
- Docker Compose 生产构建基线。
- `docs/constitution.md`、`docs/architecture.md`、`docs/foundation-blueprint.md`、ADR、M1 RFC、安全基线。
- 架构文档审查修订：里程碑口径、事件表归属、通知/IM 过渡策略、API 版本、Qt 授权、TLS、备份恢复和连接池边界已补齐。

剩余：

- 无 M0 阻塞项。

## 3. M1 平台核心持久化

状态：Done

目标：

- `platform-api` 默认使用 PostgreSQL repository。
- `platform` schema 可从空库迁移生成。
- seed 可幂等执行。
- 管理员可登录。
- 密码使用强 hash。
- session 可持久化验证。
- CI 覆盖数据库集成测试和数据库 E2E。

### 3.1 已完成

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| Drizzle schema | Done | 已覆盖 platform core 表，并与手写 migration 外键对齐 |
| SQL migration | Done | `0000_init_platform.sql` 可初始化 `platform` schema |
| migration runner | Done | `pnpm db:migrate` 使用 `platform.schema_migrations` 记录执行状态 |
| seed runner | Done | `pnpm db:seed` 幂等初始化企业、部门、权限、角色、管理员 |
| bootstrap 配置 | Done | 生产环境必须显式设置管理员初始密码，禁止 `admin123` |
| 密码 hash 工具 | Done | 当前使用 Node 内置 `scrypt`，保留算法版本和参数 |
| Docker build context | Done | `.dockerignore` 已排除本地依赖、构建产物、环境文件和缓存 |
| Docker build | Done | `pnpm docker:build` 本地已通过 |
| PostgreSQL repository | Done | `PostgresPlatformRepository` 已实现现有 repository 接口 |
| DbModule / DbProvider | Done | `PlatformModule` 可通过 `PLATFORM_REPOSITORY_DRIVER=postgres` 使用 PostgreSQL |
| 登录持久化 | Done | PostgreSQL 模式下从 `local_identities` 校验 hash 密码 |
| session store | Done | PostgreSQL 模式下登录写入 `platform.sessions`，token 入库只保存 hash |
| PostgreSQL E2E smoke | Done | `RUN_POSTGRES_E2E=true` 时覆盖 seed 管理员登录和受保护接口访问 |
| CI PostgreSQL service | Done | GitHub Actions verify job 启动 PostgreSQL 17 并执行 `pnpm db:setup` |
| CI PostgreSQL E2E | Done | GitHub Actions verify job 执行 `pnpm test:e2e:postgres` |
| lockfile hard gate | Done | `pnpm-lock.yaml` 已生成，CI 和 Docker 构建已切换为 frozen lockfile |
| database error mapper | Done | PostgreSQL `23505`/`23503` 已映射为 `PLATFORM_DUPLICATE_RESOURCE`/`PLATFORM_REFERENCE_NOT_FOUND` |
| repository integration gate | Done | `pnpm test:db` 已加入 CI；本地真实 PostgreSQL 和远端 CI 均已通过 |
| default repository switch | Done | `platform-api` 默认使用 PostgreSQL；`memory` 必须显式设置 `PLATFORM_REPOSITORY_DRIVER=memory` |
| memory store fallback | Done | 内存实现保留为测试 fixture 和显式本地 fallback，不作为生产默认路径 |

### 3.2 正在做

| 切片 | 能力 | 状态 | 下一步 |
| --- | --- | --- | --- |
| 无 | Done | M1 代码、测试、CI、Docker build、文档和 smoke 规划已完成 |

### 3.3 未开始

| 切片 | 能力 | 状态 | 启动条件 |
| --- | --- | --- | --- |
| 无 | Done | M1 无剩余切片 |

### 3.4 M1 剩余交付清单

无。后续进入 M2 权限、菜单、审计闭环。

## 4. M2 权限、菜单、审计闭环

状态：Done

目标：

- 模块权限、菜单、审计统一接入 Platform Core。
- 业务模块不得绕过 Platform Core 自建权限、菜单或审计来源。
- 为 M3 Web Shell 和后续业务模块接入提供可验证的平台链路。

### 4.1 已完成

| 切片 | 能力 | 状态 | 说明 |
| --- | --- | --- | --- |
| M2-0 | M2 RFC | Done | `docs/rfc/m2-permission-menu-audit.md` 已定义权限、菜单、审计闭环范围 |
| M2-1 | 当前用户菜单 + 登录审计 | Done | `GET /api/platform/menus/my` 已按当前用户权限过滤菜单；登录成功写入 `platform.audit_logs` |
| M2-1 | 外部审查 P2 修复 | Done | disabled 角色不再贡献当前用户权限；登录审计已写入 traceId、ip、userAgent |
| M2-1 | 菜单 seed | Done | 平台首批菜单已随 seed 幂等写入 `platform.menus` |
| M2-1 | 测试覆盖 | Done | 已覆盖内存 E2E、PostgreSQL E2E、repository integration、lint/typecheck |
| M2-2 | module manifest seed 源头 | Done | `platform.module_manifests` 幂等写入；权限和菜单从 manifest 派生 |
| M2-2 | module manifest 只读 API | Done | `GET /api/platform/module-manifests` 由 `platform:permission:view` 保护 |
| M2-3 | 平台关键写操作审计覆盖 | Done | 部门、员工、角色写接口审计、单测、内存 E2E、PostgreSQL E2E 和 Docker build 已完成 |
| M2-4 | Web Shell 菜单消费 | Done | Shell 登录、`auth/me`、`menus/my` 导航、路由权限过滤、Workbench build、PostgreSQL E2E、Docker build 和 CI 已完成 |

### 4.2 正在做

| 切片 | 能力 | 状态 | 下一步 |
| --- | --- | --- | --- |
| M2-2 | 交付闭环 | Done | 本地 `pnpm verify`、PostgreSQL 集成/E2E、Docker build、代码审查、CI 已完成 |
| 无 | Done | M2 无剩余切片 |

### 4.3 未开始

| 切片 | 能力 | 状态 | 启动条件 |
| --- | --- | --- | --- |
| 无 | Done | M2 已退出 |

## 5. M3 Web Shell 可用基座

状态：Done

目标：

- Shell 可通过 Platform Core 完成登录态恢复。
- Shell 导航只由平台菜单驱动。
- 已注册模块可按权限加载。
- 未实现、无权限、未知路径、模块加载失败等状态可被清晰区分。

### 5.1 已完成

| 切片 | 能力 | 状态 | 说明 |
| --- | --- | --- | --- |
| M3-0 | 登录态 + 平台菜单 | Done | 随 M2-4 完成；Shell 已消费 `auth/me` 和 `menus/my` |
| M3-1 | Shell 页面状态收口 | Done | 首页、待接入菜单、无权限直达、未知路径、模块加载失败均有明确状态；本地 verify 和 Docker build 已通过 |
| M3-2 | 平台管理页面占位/入口体验 | Done | `@work/platform-web` 已挂载组织架构、员工管理、角色权限占位页面；`pnpm verify` 和 Docker build 已通过 |
| M3-3 | 浏览器级 smoke 验证 | Done | 已通过真实浏览器验证登录、平台菜单导航、在位看板挂载、未知路径和未登录保护路由 |

### 5.2 正在做

| 切片 | 能力 | 状态 | 下一步 |
| --- | --- | --- | --- |
| 无 | Done | M3 已退出 |

### 5.3 未开始

| 切片 | 能力 | 状态 | 启动条件 |
| --- | --- | --- | --- |
| 无 | Done | M3 无剩余切片 |

## 6. 当前下一步

当前建议执行：

```text
M4-3: presence Web 页面
```

上一切片任务包：`docs/tasks/m4-2-presence-api-permission-audit.md`。

M4-2 完成结果：

- `PresenceStatusService` 已重写为真实 service，注入 `PRESENCE_REPOSITORY` + `PLATFORM_SCOPE_SERVICE` + `PLATFORM_AUDIT_SERVICE` + `EVENT_BUS`。
- `gateway-api` 进程通过 `APP_GUARD` 全局挂载 `PlatformAuthGuard` + `PermissionGuard`；presence controllers 用 `@RequirePermissions(...)` 声明权限码。
- `PLATFORM_AUDIT_SERVICE` 与 `PLATFORM_SCOPE_SERVICE` 通过 `packages/platform-contract` 暴露 token + interface；`apps/platform-api/src/audit/platform-audit.service.ts` 新建。
- `PermissionGuard`、`@RequirePermissions`、`@Public` 已物理迁到 `packages/nest-common/src/auth/`，platform-api 内部 controller 全部更新 import 路径。
- `presence.status.changed` 事件通过 `@work/event-bus.MemoryEventBus` 发布（M7 升级 Redis Stream 时只换 provider）。
- M4-1 偏离遗留全部清理：DTO 4 字段改回必填、in-memory dead code 清除、mock service 完全替换。
- E2E 覆盖 401 / 403 / 成功 / 冲突。
- `docs/module-contract.md §7.1.6` 已校正 `PlatformScopeService` 注入方式与 `PlatformAuditService` 落地。
- verification-log 锚点：`M4-2 Presence API Permission Audit`。

下一步启动 `M4-3: presence Web 页面`，把看板与登记表单接入真实 API。

### 6.1 M3.5 收口切片

| 切片 | 能力 | 状态 | 说明 |
| --- | --- | --- | --- |
| M3.5-A | 让模块 manifest 由各 contract 包统一供给 | Done | 2026-05-21 完成；业务模块平台侧 manifest 已迁回各 contract 包；详见 verification-log `M3.5-A Manifest Single Source` |
| M3.5-B | ADR-0003 Gateway 边界 | Done | 2026-05-22 完成；ADR-0003 固定 gateway M4–M6 内嵌、M7 拆分；详见 verification-log `M3.5-B Gateway Boundary ADR` |
| M3.5-B2 | ADR-0004 跨进程鉴权（Phantom Token） | Done | 2026-05-23 完成；ADR-0004 确立 Phantom Token、introspection 复用 `/auth/me`；详见 verification-log `M3.5-B2 Phantom Token ADR` |
| M3.5-C | 登录失败审计 + 锁定策略落地 | Done | 2026-05-23 完成；5 次失败锁定 15 分钟、登录失败审计闭合；详见 verification-log `M3.5-C Login Failure Audit and Lockout` |
| M3.5-D | 首次登录改密 + 管理员重置密码端点 | Done | 2026-05-23 完成；两个改密端点 + must_change_password 双表同步；详见 verification-log `M3.5-D Password Change and Reset` |
| M3.5-E | Platform 数据范围 resolver | Done | 2026-05-24 完成；PlatformScopeService + employees 列表接入 scope；详见 verification-log `M3.5-E Platform Scope Service` |
| M3.5-F | Shell 引入 react-router-dom@6，路由拆组件 | Done | 2026-05-24 完成；BrowserRouter + 动态模块路由 + 拆 RequirePermission/UnknownPathView；详见 verification-log `M3.5-F Shell Router` |
| M3.5-G | 跨 schema 数据访问规则文档化 | Done | 2026-05-25 完成；module-contract.md §7.1 + foundation-blueprint §5 末尾指向；详见 verification-log `M3.5-G Cross-schema Data Access Rules` |

## 7. 当前阻塞项

| 阻塞项 | 状态 | 处理 |
| --- | --- | --- |
| 无 | Done | 当前没有阻塞 M3.5-B 的基础设施问题 |

## 8. M4 在位管理 MVP

状态：In Progress

目标：

- 第一个业务模块从占位页面进入真实持久化能力。
- 验证业务模块使用 Platform Core 登录态、权限、菜单、审计和数据范围。
- 保持 presence 独立 contract/API/Web/repository/schema 边界。

### 8.1 已完成

| 切片 | 能力 | 状态 | 说明 |
| --- | --- | --- | --- |
| M4-0 | RFC 与术语设计 | Done | `docs/rfc/m4-presence-mvp.md` 已定义状态模型、API、权限、数据范围、审计、事件、schema 和切片计划；`docs/domain-glossary.md` 已补齐核心术语 |
| M4-1 | contract、schema、repository | Done | 2026-05-25 完成；`PresenceStatusRecordDto` 补齐字段、`presence` schema + migration runner、`PresenceRepository` + Postgres/Memory 双实现；详见 verification-log `M4-1 Presence Contract Schema Repository` |
| 2026-05-25 | M4-2 | presence API 接入 Platform Auth + Permission Guard + PlatformScopeService + PlatformAuditService + EventBus；M4-1 偏离全部清理；§7.1.6 校正 |

### 8.2 正在做

| 切片 | 能力 | 状态 | 下一步 |
| --- | --- | --- | --- |
| 无 | Done | 等待启动 M4-3 |

### 8.3 未开始

| 切片 | 能力 | 状态 | 启动条件 |
| --- | --- | --- | --- |
| M4-3 | Web 看板与登记表单 | Pending | M4-2 API 可用 |
| M4-4 | 交付验证 | Pending | M4-3 完成 |

## 9. M8 前置交付风险

| 切片 | 风险 | 状态 | 处理 |
| --- | --- | --- | --- |
| M8-1 | Node 服务镜像包含全量 monorepo 源码 | Pending | M8 前收敛为服务级构建产物或裁剪镜像；如企业提前要求源码隔离，则提前启动 |
