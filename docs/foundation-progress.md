# 基建进度看板

本文档记录平台基建当前做到哪里、还剩什么、下一步做什么。它不替代 `foundation-blueprint.md` 和 RFC，只作为执行进度入口。

规则：

- 阶段范围和退出标准以 `docs/foundation-blueprint.md` 为准。
- M1 具体实现以 `docs/rfc/m1-platform-core-persistence.md` 为准。
- 每完成一个可交付切片，必须更新本文档和 `docs/verification-log.md`。
- 状态只使用：`Done`、`In Progress`、`Pending`、`Blocked`。

## 1. 总览

| 阶段                        | 目标                                                                                                    | 状态    | 当前结论                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| M0 架构基线                 | 统一架构、文档、CI、Docker 基线                                                                         | Done    | 可以支撑基建优先开发                                                                                         |
| M1 平台核心持久化           | Platform Core 从内存实现升级为 PostgreSQL                                                               | Done    | 默认 repository 已切换 PostgreSQL；内存实现已降级为测试/显式 fallback；M1 验收项已完成                       |
| M2 权限、菜单、审计闭环     | 模块权限、菜单、审计统一接入                                                                            | Done    | M2-4 已提交，CI 已通过；权限、菜单、审计链路可支撑 Shell 和模块接入                                          |
| M3 Web Shell 可用基座       | 登录态、权限菜单、模块挂载                                                                              | Done    | M3-3 浏览器级 smoke 已完成；登录、权限菜单、模块挂载、404 和未登录保护路由均已验证                           |
| M3.5 收口切片               | M4-1 启动前的基建闭环：manifest 单源、Gateway ADR、登录安全、scope resolver、Shell 路由、跨 schema 规则 | Done    | M3.5-A 至 M3.5-G 全部完成；M3.5 退出，启动 M4-1                                                              |
| M4 在位管理 MVP             | 第一个业务模块验证平台基建                                                                              | Done    | M4-4 交付验证已完成；presence 模块进入维护态                                                                 |
| M5 权限与角色管理           | 功能权限 + 数据权限按类型 + 角色管理 UI                                                                 | Done    | 角色管理 + 按类型数据范围 + UI 已交付，门禁就绪                                                              |
| M6 动态表单 mini + 文件存储 | 固定槽位类型化字段 + 内网文件存储                                                                       | Done    | 后端 + 前端地基 + 工作台首页已交付；forms 配置/填报 UI 迁 M8，M7 通知 + 调度已交付                           |
| M7 通知 + 定时任务调度      | 自研站内通知 + 调度                                                                                     | Done    | 通知（落库/已读未读/事件驱动生成/接收人可配）+ 调度基建 + SSE + 前端铃铛/卡片/触发点配置 UI 已交付，门禁就绪 |
| UI 收口切片（M8 前）        | 地基三屏照设计稿像素级还原 + 设计还原度门禁                                                             | Pending | 任务包 `docs/tasks/ui-foundation-fidelity.md` 已二审定稿；UI-1→(UI-2‖UI-3)→UI-4；M8 后端可并行               |
| M8 人员 / 组织 / 档案       | 以人为中心的组织管理基座                                                                                | Pending | RFC 已 Accepted（拍板：近况记录归 `platform.status_logs`）；M8-1 任务包已二审定稿；依赖 M5/M6/M7             |
| M9 在位状态 v2              | 在位作为人员管理切面，UX 一体                                                                           | Pending | 在 M4 presence 基础上扩展                                                                                    |
| M10 日报                    | 组织层级汇总与数据范围                                                                                  | Pending | 依赖 M6/M7                                                                                                   |
| M11 审批工作流              | 流程类业务 + 跨模块事件                                                                                 | Pending | 简单串签流 + 节点通知 + 联动在位                                                                             |
| vNext                       | 多维表格+自动化、周报、桌面端、外部 IM、内网交付强化                                                    | Pending | 远期愿景，含老 M8 交付内容                                                                                   |

> M5 起为 2026-05 重规划后的里程碑，详见 `docs/adr/0005-product-replan-roadmap.md` 与
> `docs/product-requirements.md`。老 M5–M8（审批优先/日报/通知-实时-IM/客户端交付）已作废。

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

| 能力                        | 状态 | 说明                                                                                             |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| Drizzle schema              | Done | 已覆盖 platform core 表，并与手写 migration 外键对齐                                             |
| SQL migration               | Done | `0000_init_platform.sql` 可初始化 `platform` schema                                              |
| migration runner            | Done | `pnpm db:migrate` 使用 `platform.schema_migrations` 记录执行状态                                 |
| seed runner                 | Done | `pnpm db:seed` 幂等初始化企业、部门、权限、角色、管理员                                          |
| bootstrap 配置              | Done | 生产环境必须显式设置管理员初始密码，禁止 `admin123`                                              |
| 密码 hash 工具              | Done | 当前使用 Node 内置 `scrypt`，保留算法版本和参数                                                  |
| Docker build context        | Done | `.dockerignore` 已排除本地依赖、构建产物、环境文件和缓存                                         |
| Docker build                | Done | `pnpm docker:build` 本地已通过                                                                   |
| PostgreSQL repository       | Done | `PostgresPlatformRepository` 已实现现有 repository 接口                                          |
| DbModule / DbProvider       | Done | `PlatformModule` 可通过 `PLATFORM_REPOSITORY_DRIVER=postgres` 使用 PostgreSQL                    |
| 登录持久化                  | Done | PostgreSQL 模式下从 `local_identities` 校验 hash 密码                                            |
| session store               | Done | PostgreSQL 模式下登录写入 `platform.sessions`，token 入库只保存 hash                             |
| PostgreSQL E2E smoke        | Done | `RUN_POSTGRES_E2E=true` 时覆盖 seed 管理员登录和受保护接口访问                                   |
| CI PostgreSQL service       | Done | GitHub Actions verify job 启动 PostgreSQL 17 并执行 `pnpm db:setup`                              |
| CI PostgreSQL E2E           | Done | GitHub Actions verify job 执行 `pnpm test:e2e:postgres`                                          |
| lockfile hard gate          | Done | `pnpm-lock.yaml` 已生成，CI 和 Docker 构建已切换为 frozen lockfile                               |
| database error mapper       | Done | PostgreSQL `23505`/`23503` 已映射为 `PLATFORM_DUPLICATE_RESOURCE`/`PLATFORM_REFERENCE_NOT_FOUND` |
| repository integration gate | Done | `pnpm test:db` 已加入 CI；本地真实 PostgreSQL 和远端 CI 均已通过                                 |
| default repository switch   | Done | `platform-api` 默认使用 PostgreSQL；`memory` 必须显式设置 `PLATFORM_REPOSITORY_DRIVER=memory`    |
| memory store fallback       | Done | 内存实现保留为测试 fixture 和显式本地 fallback，不作为生产默认路径                               |

### 3.2 正在做

| 切片 | 能力 | 状态                                                     | 下一步 |
| ---- | ---- | -------------------------------------------------------- | ------ |
| 无   | Done | M1 代码、测试、CI、Docker build、文档和 smoke 规划已完成 |

### 3.3 未开始

| 切片 | 能力 | 状态          | 启动条件 |
| ---- | ---- | ------------- | -------- |
| 无   | Done | M1 无剩余切片 |

### 3.4 M1 剩余交付清单

无。后续进入 M2 权限、菜单、审计闭环。

## 4. M2 权限、菜单、审计闭环

状态：Done

目标：

- 模块权限、菜单、审计统一接入 Platform Core。
- 业务模块不得绕过 Platform Core 自建权限、菜单或审计来源。
- 为 M3 Web Shell 和后续业务模块接入提供可验证的平台链路。

### 4.1 已完成

| 切片 | 能力                      | 状态 | 说明                                                                                                             |
| ---- | ------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| M2-0 | M2 RFC                    | Done | `docs/rfc/m2-permission-menu-audit.md` 已定义权限、菜单、审计闭环范围                                            |
| M2-1 | 当前用户菜单 + 登录审计   | Done | `GET /api/platform/menus/my` 已按当前用户权限过滤菜单；登录成功写入 `platform.audit_logs`                        |
| M2-1 | 外部审查 P2 修复          | Done | disabled 角色不再贡献当前用户权限；登录审计已写入 traceId、ip、userAgent                                         |
| M2-1 | 菜单 seed                 | Done | 平台首批菜单已随 seed 幂等写入 `platform.menus`                                                                  |
| M2-1 | 测试覆盖                  | Done | 已覆盖内存 E2E、PostgreSQL E2E、repository integration、lint/typecheck                                           |
| M2-2 | module manifest seed 源头 | Done | `platform.module_manifests` 幂等写入；权限和菜单从 manifest 派生                                                 |
| M2-2 | module manifest 只读 API  | Done | `GET /api/platform/module-manifests` 由 `platform:permission:view` 保护                                          |
| M2-3 | 平台关键写操作审计覆盖    | Done | 部门、员工、角色写接口审计、单测、内存 E2E、PostgreSQL E2E 和 Docker build 已完成                                |
| M2-4 | Web Shell 菜单消费        | Done | Shell 登录、`auth/me`、`menus/my` 导航、路由权限过滤、Workbench build、PostgreSQL E2E、Docker build 和 CI 已完成 |

### 4.2 正在做

| 切片 | 能力     | 状态          | 下一步                                                                     |
| ---- | -------- | ------------- | -------------------------------------------------------------------------- |
| M2-2 | 交付闭环 | Done          | 本地 `pnpm verify`、PostgreSQL 集成/E2E、Docker build、代码审查、CI 已完成 |
| 无   | Done     | M2 无剩余切片 |

### 4.3 未开始

| 切片 | 能力 | 状态      | 启动条件 |
| ---- | ---- | --------- | -------- |
| 无   | Done | M2 已退出 |

## 5. M3 Web Shell 可用基座

状态：Done

目标：

- Shell 可通过 Platform Core 完成登录态恢复。
- Shell 导航只由平台菜单驱动。
- 已注册模块可按权限加载。
- 未实现、无权限、未知路径、模块加载失败等状态可被清晰区分。

### 5.1 已完成

| 切片 | 能力                      | 状态 | 说明                                                                                                  |
| ---- | ------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| M3-0 | 登录态 + 平台菜单         | Done | 随 M2-4 完成；Shell 已消费 `auth/me` 和 `menus/my`                                                    |
| M3-1 | Shell 页面状态收口        | Done | 首页、待接入菜单、无权限直达、未知路径、模块加载失败均有明确状态；本地 verify 和 Docker build 已通过  |
| M3-2 | 平台管理页面占位/入口体验 | Done | `@work/platform-web` 已挂载组织架构、员工管理、角色权限占位页面；`pnpm verify` 和 Docker build 已通过 |
| M3-3 | 浏览器级 smoke 验证       | Done | 已通过真实浏览器验证登录、平台菜单导航、在位看板挂载、未知路径和未登录保护路由                        |

### 5.2 正在做

| 切片 | 能力 | 状态      | 下一步 |
| ---- | ---- | --------- | ------ |
| 无   | Done | M3 已退出 |

### 5.3 未开始

| 切片 | 能力 | 状态          | 启动条件 |
| ---- | ---- | ------------- | -------- |
| 无   | Done | M3 无剩余切片 |

## 6. 当前下一步

> **2026-05 已重规划。** M5 起的里程碑改为“权限与角色管理 → 动态表单+文件 → 通知+调度 →
> 人员/档案 → 在位 v2 → 日报 → 审批”，详见 `docs/adr/0005-product-replan-roadmap.md` 与
> `docs/product-requirements.md`。老“M5 审批 MVP”定位已作废。

当前建议执行：

```text
UI 收口切片（M8 前，地基三屏像素级还原 + 还原度门禁）
  └ 任务包 docs/tasks/ui-foundation-fidelity.md（已二审定稿，可交 Codex）
M8: 人员 / 组织 / 档案（RFC docs/rfc/m8-people-org-profile.md 已 Accepted，
    近况记录归属已拍板 = platform.status_logs；M8 后端切片可与 UI 收口并行）
  └ M8-1 部门管理任务包 docs/tasks/m8-1-department-management.md（已二审定稿，可交 Codex；
      OrgService 增删改/移动/设负责人 + 占用删除 409 + 双实现，无 DDL 迁移，合并前过 security-reviewer）
  └ 后续：M8-2a 档案读写后端 → M8-2b 首登向导 → M8-3 profile.updated → M8-4 近况 → M8-5 自定义字段聚合 → M8-6 交付验证
```

M6-0 RFC 已 Accepted，M6-1 已交付 `modules/forms` / `modules/files` 的 contract + api 骨架、
schema 迁移、repository 双实现、manifest / seed、gateway 装配和根脚本。M6-2 已交付本地磁盘
Files provider、上传 API、staged 生命周期、TTL 清理、配额 / 限流 / 磁盘阈值治理、Docker volume
与部署备份文档。M6-3 已交付 Forms definition API、record service / port、快照记录、文件字段与
人员字段。M6-4 后端交付验证已完成。M6-W 已交付前端地基（token + `@work/ui` 组件库）、
应用外壳、登录页重构和工作台首页。M6 整段退出。**M7-0 RFC 已 Accepted**
（`docs/rfc/m7-notification-scheduler.md`，两轮独立评审通过）：通知做成 `modules/notification` 共享模块、
事件驱动 + 接收人可配、SSE 单实例推送、`@nestjs/schedule` 调度、删除 `apps/notification-api`；
本期只接通 `presence.status.changed`→部门负责人一条 live 链路，①②④触发点留预留接线。
M7-1 模块骨架已完成；M7-2 已接通 presence.status.changed → 部门负责人通知 live 链路；
M7-3 已交付 `@nestjs/schedule` 调度基建、`notification.schedule_config`、心跳占位 job 与
①② 日报提醒预留接线点。M7-4 已拆分为后端 SSE 管道（M7-4a）与前端消费（M7-4b）：
M7-4a 已交付 `GET /api/notification/stream`、进程内连接注册表和 `create()` 最小信号推送；
M7-4b 已交付 `@work/http-client.stream()`、shell 铃铛 / 工作台通知卡片、断线回退轮询和
`modules/notification/web` 触发点配置页。M7-5 通知 + 调度交付验证门禁已完成，M7 整段退出。
下一步进入 M8（人员 / 组织 / 档案），M8 依赖的 M5/M6/M7 基建已就位。

上一切片任务包：`docs/tasks/m5-4-delivery-verification.md`。

M4-4 完成结果：

- 加 `pnpm verify:full` 双 script（`verify` 保持快路径不变；`verify:full` 串 `test:db` + `test:e2e:postgres`，要求本地 docker postgres 起着）。
- 修 `modules/presence/api/src/presence.e2e-spec.ts` 的 env gate（`RUN_POSTGRES_INTEGRATION` → `RUN_POSTGRES_E2E`），关闭 CI test:e2e:postgres job 把 presence e2e silently skip 的潜在 bug。
- 新建 `docs/runbooks/` 目录与首个 runbook `docs/runbooks/presence-mvp-smoke.md`，覆盖 docker postgres 起停、`pnpm db:setup`、`pnpm verify:full`、`pnpm docker:build`、28P01 故障树、6 步浏览器 smoke 全流程。
- 同步 `docs/doc-index.md` §1 / §3 / §7 收纳 `docs/runbooks/*.md`。
- M4 整段 Done；presence 模块进入维护态（后续优化进 M5+ 切片的 follow-up 或独立小切片）。
- verification-log 锚点：`M4-4 Presence MVP Delivery Verification`。

M5 已退出：M5-1 至 M5-4 全部完成。M6-0 RFC 已 Accepted，M6-1 共享后端基建骨架、M6-2
本地磁盘 Files provider + 上传 API、M6-3 Forms API + 快照记录 + 文件 / 人员字段、M6-4 后端
交付验证、M6-W 前端地基 + 工作台首页均已完成。M7-0 RFC 已 Accepted，M7-1 通知模块骨架、
M7-2 事件订阅 + RecipientResolver + platform 读端口已完成；M7-3 调度基建已完成，M7-4a SSE 后端已完成，
M7-4b 前端接入已完成，M7-5 交付验证已完成；下一步进入 M8（人员 / 组织 / 档案）；
forms UI 迁 M8。
注：2026-05 重规划后“审批 MVP”定位已作废，审批改为 M11；里程碑详见
`docs/adr/0005-product-replan-roadmap.md`。

### 6.1 M3.5 收口切片

| 切片    | 能力                                      | 状态 | 说明                                                                                                                                                 |
| ------- | ----------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3.5-A  | 让模块 manifest 由各 contract 包统一供给  | Done | 2026-05-21 完成；业务模块平台侧 manifest 已迁回各 contract 包；详见 verification-log `M3.5-A Manifest Single Source`                                 |
| M3.5-B  | ADR-0003 Gateway 边界                     | Done | 2026-05-22 完成；原 ADR-0003 固定 gateway M4–M6 内嵌、老 M7 拆分；ADR-0005 已把拆分推迟至 vNext；详见 verification-log `M3.5-B Gateway Boundary ADR` |
| M3.5-B2 | ADR-0004 跨进程鉴权（Phantom Token）      | Done | 2026-05-23 完成；ADR-0004 确立 Phantom Token、introspection 复用 `/auth/me`；详见 verification-log `M3.5-B2 Phantom Token ADR`                       |
| M3.5-C  | 登录失败审计 + 锁定策略落地               | Done | 2026-05-23 完成；5 次失败锁定 15 分钟、登录失败审计闭合；详见 verification-log `M3.5-C Login Failure Audit and Lockout`                              |
| M3.5-D  | 首次登录改密 + 管理员重置密码端点         | Done | 2026-05-23 完成；两个改密端点 + must_change_password 双表同步；详见 verification-log `M3.5-D Password Change and Reset`                              |
| M3.5-E  | Platform 数据范围 resolver                | Done | 2026-05-24 完成；PlatformScopeService + employees 列表接入 scope；详见 verification-log `M3.5-E Platform Scope Service`                              |
| M3.5-F  | Shell 引入 react-router-dom@6，路由拆组件 | Done | 2026-05-24 完成；BrowserRouter + 动态模块路由 + 拆 RequirePermission/UnknownPathView；详见 verification-log `M3.5-F Shell Router`                    |
| M3.5-G  | 跨 schema 数据访问规则文档化              | Done | 2026-05-25 完成；module-contract.md §7.1 + foundation-blueprint §5 末尾指向；详见 verification-log `M3.5-G Cross-schema Data Access Rules`           |

### 6.2 M5 权限与角色管理切片

| 切片 | 能力                                   | 状态 | 说明                                                                                    |
| ---- | -------------------------------------- | ---- | --------------------------------------------------------------------------------------- |
| M5-0 | RFC                                    | Done | 2026-05-31 完成；`docs/rfc/m5-roles-permissions-admin.md`                               |
| M5-1 | 数据模型 + 按类型数据范围 + Scope 改造 | Done | 2026-05-31 完成；详见 verification-log `M5-1 RBAC Data Model and Scope`                 |
| M5-2 | 角色管理 API（CRUD + 分配 + 审计）     | Done | 2026-05-31 完成；详见 verification-log `M5-2 Role Management API`                       |
| M5-3 | Web 角色管理 UI                        | Done | 2026-06-01 完成；详见 verification-log `M5-3 Role Management Web`                       |
| M5-4 | 交付验证                               | Done | 2026-06-01 完成；详见 verification-log `M5-4 Roles & Permissions Delivery Verification` |

### 6.3 M6 动态表单 mini + 文件存储切片

| 切片 | 能力                                   | 状态 | 说明                                                                                                         |
| ---- | -------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| M6-0 | RFC                                    | Done | 2026-06-03 Accepted；详见 verification-log `M6-0 Dynamic Forms Mini And File Storage Proposed RFC`           |
| M6-1 | contract + schema + repository         | Done | 2026-06-03 完成；详见 verification-log `M6-1 Forms And Files Shared Backend Foundation`                      |
| M6-2 | 本地磁盘 Files provider + 上传 API     | Done | 2026-06-05 完成；详见 verification-log `M6-2 Local Disk Files Provider Upload API Lifecycle Abuse Controls`  |
| M6-3 | Forms API + 快照记录 + 文件 / 人员字段 | Done | 2026-06-05 完成；详见 verification-log `M6-3 Forms Definition And Record API`                                |
| M6-4 | 后端交付验证                           | Done | 2026-06-06 完成；详见 verification-log `M6-4 Forms & Files Backend Delivery Verification`                    |
| M6-W | 前端地基 + 应用外壳 + 工作台首页       | Done | 2026-06-06 完成；详见 verification-log `M6-W Frontend Foundation & Workbench Home`；forms 配置/填报 UI 迁 M8 |

### 6.4 M7 通知 + 定时任务调度切片

| 切片  | 能力                                    | 状态 | 说明                                                                                                                 |
| ----- | --------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| M7-0  | RFC                                     | Done | 2026-06-07 Accepted；`docs/rfc/m7-notification-scheduler.md`                                                         |
| M7-1  | 通知模块骨架 + 站内通知最小闭环         | Done | 2026-06-07 完成；详见 verification-log `M7-1 Notification Module Skeleton`                                           |
| M7-2  | 事件订阅 + 接收人解析 + platform 读端口 | Done | 2026-06-14 完成；详见 verification-log `M7-2 Event Subscription + Recipient Resolver + Platform Org Port`            |
| M7-3  | 调度基建                                | Done | 2026-06-15 完成；详见 verification-log `M7-3 Scheduler Infrastructure`，日报具体逻辑仍预留 M10                       |
| M7-4a | SSE 推送后端端点 + 进程内连接注册表     | Done | 2026-06-15 完成；详见 verification-log `M7-4a Notification SSE Backend`；REST 仍为事实源，SSE 只推最小信号           |
| M7-4b | 前端铃铛 / 工作台卡片 + SSE 消费        | Done | 2026-06-16 完成；详见 verification-log `M7-4b Notification Frontend`；断线回退 REST 轮询，触发点配置 UI 已落位       |
| M7-5  | 通知 + 调度交付验证门禁                 | Done | 2026-06-17 完成；详见 verification-log `M7-5 Notification & Scheduler Delivery Verification`；M7 整段退出，下一步 M8 |

## 7. 当前阻塞项

| 阻塞项 | 状态 | 处理                               |
| ------ | ---- | ---------------------------------- |
| 无     | Done | 当前没有阻塞 M3.5-B 的基础设施问题 |

### 7.1 已知安全 Follow-up

| 风险                                                                                                        | 状态    | 处理                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| [High follow-up] 员工 `updateStatus(:id/status)` / `resetPassword(:id/password)` 仍需按认证租户校验目标员工 | Pending | 单租户部署下暂无现实攻击面；启用多租户前必须修复。归入 M8 人员 / 组织 / 档案，或提前拆专门安全切片。 |

## 8. M4 在位管理 MVP

状态：Done

目标：

- 第一个业务模块从占位页面进入真实持久化能力。
- 验证业务模块使用 Platform Core 登录态、权限、菜单、审计和数据范围。
- 保持 presence 独立 contract/API/Web/repository/schema 边界。

### 8.1 已完成

| 切片       | 能力                         | 状态                                                                                                                                        | 说明                                                                                                                                                                                                                     |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M4-0       | RFC 与术语设计               | Done                                                                                                                                        | `docs/rfc/m4-presence-mvp.md` 已定义状态模型、API、权限、数据范围、审计、事件、schema 和切片计划；`docs/domain-glossary.md` 已补齐核心术语                                                                               |
| M4-1       | contract、schema、repository | Done                                                                                                                                        | 2026-05-25 完成；`PresenceStatusRecordDto` 补齐字段、`presence` schema + migration runner、`PresenceRepository` + Postgres/Memory 双实现；详见 verification-log `M4-1 Presence Contract Schema Repository`               |
| 2026-05-25 | M4-2                         | presence API 接入 Platform Auth + Permission Guard + PlatformScopeService + PlatformAuditService + EventBus；M4-1 偏离全部清理；§7.1.6 校正 |
| M4-3       | presence Web 页面            | Done                                                                                                                                        | 看板与登记接入真实 API                                                                                                                                                                                                   |
| M4-4       | 交付验证                     | Done                                                                                                                                        | 2026-05-27 完成；verify:full / test:db / test:e2e:postgres / docker build / 浏览器 smoke 6 步全过；runbook 沉淀在 `docs/runbooks/presence-mvp-smoke.md`；详见 verification-log `M4-4 Presence MVP Delivery Verification` |

### 8.2 正在做

| 切片 | 能力 | 状态      | 下一步 |
| ---- | ---- | --------- | ------ |
| 无   | Done | M4 已退出 | —      |

### 8.3 未开始

| 切片 | 能力 | 状态          | 启动条件 |
| ---- | ---- | ------------- | -------- |
| 无   | Done | M4 无剩余切片 | —        |

## 9. 交付前置风险（vNext 内网交付里程碑）

> 重规划后“客户端与内网交付”从老 M8 移至 vNext 交付里程碑；下列风险在该里程碑前收敛（表中 M8-1 为历史编号）。

| 切片 | 风险                                | 状态    | 处理                                                                    |
| ---- | ----------------------------------- | ------- | ----------------------------------------------------------------------- |
| M8-1 | Node 服务镜像包含全量 monorepo 源码 | Pending | M8 前收敛为服务级构建产物或裁剪镜像；如企业提前要求源码隔离，则提前启动 |
