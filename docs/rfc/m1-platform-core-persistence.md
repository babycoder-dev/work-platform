# RFC: M1 Platform Core 持久化

## 状态

Accepted

## 1. 目标

M1 的目标是把 Platform Core 从开发期内存实现升级为可部署、可迁移、可审计的 PostgreSQL 持久化实现。

完成 M1 后，系统应满足：

- Docker Compose 启动后可以初始化平台基础数据。
- 管理员可以用初始化账号登录。
- 企业、部门、员工、角色、权限、会话数据持久化。
- 密码不再明文保存。
- repository 接口保持稳定，业务层不感知存储实现切换。
- CI 能覆盖数据库迁移、seed、repository、platform-api E2E。

## 2. 非目标

M1 不实现以下内容：

- 完整平台管理后台。
- 复杂数据权限表达式。
- 多租户计费或租户隔离运营能力。
- LDAP/OIDC。
- OpenIM 用户同步。
- 审批、在位、日/周报业务表。
- 高可用数据库集群。

这些能力在 M2 之后逐步进入。

## 3. 当前状态

当前 `platform-api` 使用内存 repository：

```text
apps/platform-api/src/repositories/platform.repository.ts
apps/platform-api/src/store/platform-memory.store.ts
```

当前已具备：

- 登录接口。
- 当前用户权限返回。
- 部门、员工、角色、权限基础接口。
- 认证 guard。
- 权限 guard。
- DTO 校验。
- 统一错误格式。
- E2E 覆盖登录、未登录、无权限、非法 token、非法 body。

主要缺口：

- 数据不持久。
- 密码明文存储。
- session 仅内存有效。
- 无数据库迁移。
- 无安装初始化流程。
- 无唯一约束和事务边界。

## 4. 技术选择

推荐：

```text
drizzle-orm
drizzle-kit
pg
```

理由：

- TypeScript 项目内集成成本低。
- schema 和 migration 可读。
- runtime 依赖轻，适合内网部署。
- 不强依赖代码生成客户端，CI 和 Docker 构建更直接。
- 便于保留 repository 模式，不把 ORM 类型泄漏到 service/controller。

约束：

- 禁止使用 ORM 自动同步生产库 schema。
- 所有 schema 变更必须生成并提交迁移文件。
- repository 返回 contract DTO，不返回 ORM 内部类型。
- 数据库错误必须转换为统一业务错误或 HTTP 错误。

## 5. 目录规划

建议新增：

```text
apps/platform-api/src/db/
  db.module.ts
  db.config.ts
  db.provider.ts
  schema/
    platform.schema.ts
  migrations/
    0000_init_platform.sql

apps/platform-api/src/repositories/
  postgres-platform.repository.ts
  platform.repository.spec.ts

apps/platform-api/src/seeds/
  seed-platform.ts
  seed-data.ts
```

根目录可新增：

```text
drizzle.config.ts
```

脚本建议：

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx apps/platform-api/src/db/migrate.ts",
  "db:seed": "tsx apps/platform-api/src/seeds/seed-platform.ts",
  "db:setup": "pnpm db:migrate && pnpm db:seed"
}
```

最终脚本名称以实际实现为准，但必须覆盖 migrate 和 seed。

## 6. Schema 初版

M1 只建 Platform Core 必需表。

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
platform.audit_logs
platform.domain_events
```

`platform.module_manifests` 和 `platform.menus` 可在 M2 建，也可以在 M1 预建空表。如果 M1 不建，必须在 M2 RFC 明确补上。

## 7. 表结构原则

所有业务表必须包含：

```text
id
created_at
updated_at
```

需要软删除的表增加：

```text
deleted_at
```

组织、账号、角色等关键表必须增加：

```text
status
```

推荐 ID：

- 首期使用 UUID。
- 不使用数据库自增 ID 作为公开 API ID。

时间：

- 数据库存储 `timestamptz`。
- API 输出 ISO 8601 字符串。

## 8. 关键约束

### 8.1 企业

```text
platform.enterprises
  id uuid primary key
  code varchar unique not null
  name varchar not null
  status varchar not null
```

### 8.2 部门

约束：

- 同一企业下 `code` 唯一。
- `parent_id` 必须属于同一企业。
- `sort_order` 默认为 0。

### 8.3 员工

约束：

- 同一企业下 `employee_no` 唯一。
- 同一企业下 `account` 唯一。
- `department_id` 必须属于同一企业。
- 员工状态：`active`、`disabled`、`left`。

### 8.4 本地身份

`platform.local_identities` 保存密码 hash 和安全状态。

必须字段：

```text
user_id
password_hash
password_updated_at
must_change_password
failed_attempts
locked_until
last_login_at
```

禁止保存明文密码或可逆加密密码。

### 8.5 角色与权限

约束：

- 同一企业下 `roles.code` 唯一。
- `permissions.code` 全局唯一。
- `role_permissions` 使用联合唯一约束。
- `user_roles` 使用联合唯一约束。

### 8.6 会话

`platform.sessions` 保存服务端会话状态。

必须字段：

```text
id
user_id
access_token_hash
expires_at
revoked_at
created_ip
user_agent
last_seen_at
```

API 返回 token 明文，数据库只保存 token hash。

## 9. 密码策略

M1 必须完成：

- 使用强哈希保存密码。
- 初始管理员密码由 seed 或安装初始化生成。
- 默认强制首次登录改密字段存在。
- 登录失败次数和锁定字段存在。

推荐：

```text
argon2id
```

当前 M1 第一切片使用 Node.js 内置 `scrypt`，原因是避免引入原生依赖导致内网构建和 CI 复杂化。该实现必须保留算法版本、参数、salt，并通过统一工具函数封装，后续可在不影响 repository/service 的前提下迁移到 argon2id。

如果后续使用 bcrypt 或 argon2id，必须在 RFC 实现记录中说明原因和参数。

开发期默认密码只能用于本地和 CI，不得作为生产默认值。

## 10. Seed 策略

M1 seed 至少创建：

- 默认企业。
- 总部部门。
- 平台权限点。
- 系统管理员角色。
- 初始管理员员工。
- 初始管理员身份。

seed 必须幂等：

- 重复执行不会重复插入。
- 权限点可增量补齐。
- 已存在管理员时不覆盖密码，除非显式传入重置参数。

环境变量建议：

```text
PLATFORM_BOOTSTRAP_ADMIN_ACCOUNT
PLATFORM_BOOTSTRAP_ADMIN_PASSWORD
PLATFORM_BOOTSTRAP_ENTERPRISE_CODE
PLATFORM_BOOTSTRAP_ENTERPRISE_NAME
```

生产环境不允许使用 `admin123` 作为默认密码。

## 11. Repository 切换策略

保持现有接口：

```text
apps/platform-api/src/repositories/platform.repository.ts
```

新增 PostgreSQL 实现：

```text
apps/platform-api/src/repositories/postgres-platform.repository.ts
```

Provider 切换：

```ts
{
  provide: PLATFORM_REPOSITORY,
  useClass: PostgresPlatformRepository,
}
```

内存实现保留为测试 fixture 或开发 fallback，但不得作为默认生产实现。

## 12. 事务边界

以下操作必须使用事务：

- 创建员工 + 创建 local identity + 分配默认角色。
- 创建角色 + 绑定权限。
- 分配用户角色。
- seed 初始化。
- 登录成功后创建 session 并更新登录时间。

事务必须在 repository 层或专门 unit of work 层处理，不能泄漏到 controller。

## 13. 错误映射

数据库错误必须转换：

| 场景 | 错误 |
| --- | --- |
| 唯一约束冲突 | `PLATFORM_DUPLICATE_RESOURCE` |
| 外键不存在 | `PLATFORM_REFERENCE_NOT_FOUND` |
| 账号密码错误 | `HTTP_401` / `账号或密码错误` |
| 会话无效 | `HTTP_401` / `登录状态无效` |
| 权限不足 | `HTTP_403` / `权限不足` |

不得把数据库原始错误直接返回给客户端。

## 14. 测试要求

M1 必须新增或调整：

### 14.1 Unit

- password hash/verify。
- token hash/verify。
- permission aggregation。
- repository mapper。

### 14.2 Repository integration

使用测试数据库覆盖：

- seed 幂等。
- 登录查询。
- 创建员工。
- 创建部门。
- 创建角色。
- 分配角色。
- session 创建与失效。
- 唯一约束冲突。

### 14.3 E2E

使用 PostgreSQL repository 跑 platform-api E2E：

- 登录成功。
- 未登录拒绝。
- 无权限拒绝。
- 创建员工。
- 非法入参拒绝。
- 数据持久后重新查询。

### 14.4 Docker

CI 保留：

```text
docker compose -f infra/docker-compose.prod.yml build
```

后续增加 smoke：

```text
docker compose up
db migrate
db seed
health check
login
```

## 15. CI 变更

M1 完成后 CI 至少包含：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm test:e2e
pnpm build
docker compose -f infra/docker-compose.prod.yml build
```

推荐增加：

```text
pnpm db:migrate:check
```

如果 GitHub Actions 使用 service container，优先使用 PostgreSQL 官方镜像。

## 16. 部署要求

内网部署必须支持：

- Docker 镜像离线导入。
- 迁移脚本离线执行。
- seed 离线执行。
- `.env` 配置数据库连接。
- 初始化管理员密码通过环境变量或安装流程注入。

不得依赖公网 CDN、外部身份源或在线 schema 同步。

## 17. 验收标准

M1 完成必须满足：

- `pnpm-lock.yaml` 已提交，CI 使用 frozen lockfile 安装。
- `platform-api` 默认使用 PostgreSQL repository。
- `platform` schema 可从空库迁移生成。
- seed 可幂等执行。
- 管理员可登录。
- 密码使用强 hash。
- session 可持久化验证。
- 现有 platform-api E2E 全部通过。
- 新增数据库 integration 测试通过。
- Docker build 通过。
- `docs/platform-core.md` 更新为数据库实现状态。
- `docs/verification-log.md` 记录验证结果。

## 18. 决定记录

以下问题已经关闭，后续如需修改必须补充 ADR 或新 RFC：

| 问题 | 决定 |
| --- | --- |
| session store 首期使用 PostgreSQL 还是 Redis | M1 使用 PostgreSQL `platform.sessions`，Redis 作为 M3 实时/缓存能力再接入 |
| 初始管理员密码是环境变量注入还是安装命令生成 | 通过环境变量注入；生产环境缺失时启动或 seed 失败，开发环境可使用安全提示 |
| 是否在 M1 一并建立 `module_manifests` 和 `menus` 空表 | M1 预建空表，M2 再补业务逻辑和注册闭环 |
| 数据库迁移脚本是否放在 app 内，还是根目录统一管理 | 迁移执行入口在根脚本，迁移文件跟随 `platform-api` 数据库实现提交 |
| 是否立即引入 OpenAPI 生成，还是 M2/M3 再做 | M1 不引入 OpenAPI 生成；M2/M3 在权限菜单和 Shell API 稳定后补齐 |
