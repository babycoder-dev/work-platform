---
name: db-migration-discipline
description: Apply the Work Platform database migration and seed discipline when changing a schema — forward-only migrations, one entrypoint per schema, and idempotent seeds. Use for any DDL, schema or seed change.
whenToUse: 改动数据库 schema、新增迁移或改 seed 时
---

# 数据库迁移与 seed 纪律

规则出处：`docs/development-workflow.md` §2、`docs/architecture.md`、`docs/module-contract.md` §7.1、
各模块 `CLAUDE.md`。本文件是操作手册，不新增规则。

## 1. 迁移只前向；已登记的迁移文件**绝不可修订**

runner 按**文件名**登记执行状态（如 `platform.schema_migrations`）。修订一个已登记的文件，会让已迁移的库
与新库**静默分叉**——runner 看到同名文件会直接跳过。修正一律**新增一个前向迁移**。

## 2. schema 归模块所有：一个 schema 一个入口

| schema | 入口 |
| --- | --- |
| `platform.*` | `pnpm db:migrate` |
| `presence.*` | `pnpm db:migrate:presence` |
| `files.*` | `pnpm db:migrate:files` |
| `forms.*` | `pnpm db:migrate:forms` |
| `notification.*` | `pnpm db:migrate:notification` |
| 全量（迁移 + seed） | `pnpm db:setup` |

**不要跨 schema 写迁移**：模块只能读写自己的 schema；需要别人的数据就走 platform-api / 只读 port，
不做跨 schema join。

## 3. 目录与命名

`modules/<module>/api/src/db/migrations/NNNN_<snake_case>.sql`，编号在**模块内**单调递增
（例：`modules/presence/api/src/db/migrations/0001_m9_status_dictionary.sql`）。

## 4. Drizzle 与实际 DDL 必须对齐

改 `*.schema.ts` 后用 `pnpm db:generate` 生成迁移，**生成后人工核对 SQL**——生成的 DDL 不总是你想要的
（partial unique index、CHECK 约束、删列顺序）。手写迁移与 drizzle schema 要对齐，`*.schema.spec.ts` 已有先例。

## 5. seed 必须幂等

`pnpm db:seed` 可重复执行（企业 / 部门 / 权限 / 角色 / 管理员 / 菜单 / module manifest）。预置数据优先走
**运行时幂等 ensure**，而不是塞进迁移 SQL；并发下用**收窄的 `ON CONFLICT` 目标**，不要依赖仲裁列。

## 6. 交付要求

- schema / 迁移策略变更属 `docs/doc-index.md` §5 的**文档审查**触发条件（可能要新增 ADR 或更新 RFC）。
- 涉数据范围 / 权限 / 审计的 DDL 变更，合并前过 security-reviewer。
- **`pnpm test:db` 与 `pnpm test:e2e:postgres` 是 env-gated**：缺环境变量会**静默跳过**（假绿）。本地真跑需
  `DATABASE_URL` 加 `RUN_POSTGRES_INTEGRATION=true` / `RUN_POSTGRES_E2E=true`，或直接 `pnpm verify:full`。
  交付说明里要写清哪些命令**真跑了**、哪些被跳过。
