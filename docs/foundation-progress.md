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
| M1 平台核心持久化 | Platform Core 从内存实现升级为 PostgreSQL | In Progress | PostgreSQL repository 和 CI 数据库 E2E 已接入，默认切换和错误映射尚未完成 |
| M2 权限、菜单、审计闭环 | 模块权限、菜单、审计统一接入 | Pending | 等 M1 repository/session 闭环后启动 |
| M3 Web Shell 可用基座 | 登录态、权限菜单、模块挂载 | Pending | 依赖 M1/M2 |
| M4 在位管理 MVP | 第一个业务模块验证平台基建 | Pending | 依赖 M1-M3 |
| M5 审批 MVP | 流程类业务验证 | Pending | 依赖 M4 与事件协作边界 |
| M6 日/周报 MVP | 组织层级汇总与数据范围验证 | Pending | 依赖 M2 数据范围能力 |
| M7 通知、实时、IM 基建 | notification、realtime、OpenIM adapter 可用 | Pending | 当前只保留边界 |
| M8 客户端与内网交付 | Docker 离线迁移、客户端打包、部署演练 | Pending | 当前只完成 Docker build 基线 |

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

状态：In Progress

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

### 3.2 正在做

| 能力 | 状态 | 下一步 |
| --- | --- | --- |
| repository integration tests | In Progress | 扩展创建员工、创建角色、分配角色、唯一约束冲突覆盖 |
| 默认 repository 切换 | In Progress | CI DB E2E 稳定后，将非测试部署默认切到 PostgreSQL |

### 3.3 未开始

| 能力 | 状态 | 启动条件 |
| --- | --- | --- |
| 数据库错误映射 | Pending | repository 写操作开始实现后补齐 |
| 内存 store 降级为测试专用 | Pending | PostgreSQL E2E 通过后执行 |
| `docs/platform-core.md` 数据库实现状态 | Pending | M1 退出前更新 |

### 3.4 M1 剩余交付清单

1. 扩展 PostgreSQL repository integration test。
2. 统一数据库错误映射。
3. 将内存 store 降级为测试专用。
4. 更新 `docs/platform-core.md` 和 `docs/verification-log.md`。

## 4. 当前下一步

当前建议执行：

```text
M1-5: repository integration tests + database error mapping
```

验收标准：

- PostgreSQL integration tests 覆盖创建员工、角色、分配角色、session。
- 唯一约束和外键错误映射为统一业务错误或 HTTP 错误。
- controller 不直接暴露 PostgreSQL 原始错误。
- `pnpm verify` 通过。
- `pnpm docker:build` 通过。

## 5. 当前阻塞项

| 阻塞项 | 状态 | 处理 |
| --- | --- | --- |
| `pnpm-lock.yaml` 未提交 | Blocked | 需要在稳定网络环境生成并提交，然后 CI 改为 frozen lockfile |
| 数据库集成测试基础设施 | Done | CI 已提供 PostgreSQL service，本地可用临时 PostgreSQL 容器运行 `pnpm test:e2e:postgres` |
