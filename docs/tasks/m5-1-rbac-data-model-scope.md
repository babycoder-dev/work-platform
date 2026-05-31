# Task: M5-1 角色数据模型 + 按类型数据范围 + Scope 改造

## 状态

Ready for execution

## 0. 任务定位

M5 第一刀，重规划后所有业务模块的门禁基座。本切片只做**平台数据层 + 契约 + Scope 服务 + 现有两处消费者改造 + 安全基线文档**；**不做角色管理 API 的新端点（M5-2）、不做 Web UI（M5-3）**。

本切片改了**授权数据模型**与**跨进程内省载荷（`CurrentUserDto`）**，属安全基线变更（`apps/platform-api/CLAUDE.md` §16 change gate）：必须在同一变更内更新 `docs/security-baseline.md`，并在交付前过 `security-reviewer` 子代理。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、统一错误信封、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m5-roles-permissions-admin.md` §4、§5、§6、§8、§14（本切片权威规格）
4. `docs/product-requirements.md` §2.2（模型 B）
5. `docs/security-baseline.md` §4.4 phantom-token、§5 授权与数据范围、§16 变更门禁
6. `docs/adr/0004-cross-process-auth-phantom-token.md`
7. `apps/platform-api/CLAUDE.md`（安全敏感面 + 两套迁移入口 + 注入 gotcha）
8. 现状代码：
   - `packages/platform-contract/src/scope.ts`、`rbac.ts`、`auth.ts`
   - `apps/platform-api/src/scope/platform-scope.service.ts`(+ `.spec.ts`)
   - `apps/platform-api/src/auth/auth.service.ts`（`toCurrentUser`，约 242–272 行）
   - `apps/platform-api/src/users/employee.service.ts`（`listEmployees`/`matchScope`）
   - `modules/presence/api/src/status/presence-status.service.ts`（`getBoard`）
   - `apps/platform-api/src/repositories/platform.repository.ts`（接口）
   - `apps/platform-api/src/repositories/postgres-platform.repository.ts`（PG 实现）
   - `apps/platform-api/src/store/platform-memory.store.ts`（内存实现）
   - `apps/platform-api/src/db/schema/platform.schema.ts`(+ `.spec.ts`)、`src/db/migrations/0000_init_platform.sql`、`src/db/migrate.ts`
   - `apps/platform-api/src/seeds/seed-platform.ts`（`upsertAdminRole` ~206、`grantRolePermissions` ~226）
   - `apps/platform-api/src/seeds/platform-module-manifest.ts`（权限点）

## 2. 设计要点（严格遵守）

1. **无生产数据，不回填**：直接去掉 `roles.data_scope`，`platform.role_data_scopes`（按类型）为唯一事实源。
2. **数据类型固定三类**：`profile | presence | report`。系统/管理类不入表。
3. **`resolveScope` 加 `dataType` 入参**，不保留无参旧签名/重载。typecheck 必须暴露并改完所有调用点与实现绑定。
4. **`CurrentUserDto.dataScopes` 改为按类型分组** `Record<PlatformDataType, DataScope[]>`。这会改 `/api/platform/auth/me` 载荷——同步安全基线文档。
5. **不新增 npm 依赖**；只改 workspace 包间 import。
6. **不动**：M5-2 的角色 CRUD 端点（本切片只改 `createRole` 的写入与读出，让它写 `role_data_scopes`；不加 controller 路由）。
7. Nest 构造器注入必须**显式** `@Inject(...)`（repo gotcha）。

## 3. 契约改动（`packages/platform-contract`）

### 3.1 `src/scope.ts`

新增数据类型枚举与常量；改 `PlatformScopePort` 签名：

```ts
import type { CurrentUserDto } from './auth';

export type PlatformScopeKind = 'self' | 'department' | 'department_tree' | 'company';

export type PlatformDataType = 'profile' | 'presence' | 'report';
export const PLATFORM_DATA_TYPES: PlatformDataType[] = ['profile', 'presence', 'report'];

export interface PlatformScope {
  kind: PlatformScopeKind;
  userId: string;
  enterpriseId: string;
  departmentId?: string;
  departmentIds: string[];
  degradedFromCustom: boolean;
}

export interface PlatformScopePort {
  resolveScope(user: CurrentUserDto, dataType: PlatformDataType): Promise<PlatformScope>;
}

export const PLATFORM_SCOPE_SERVICE = Symbol.for('PLATFORM_SCOPE_SERVICE');
```

### 3.2 `src/rbac.ts`

新增 `RoleDataScope`；改 `RoleDto` / `CreateRoleInput`；新增 `UpdateRoleInput`（M5-2 用，本切片先定义）。`DataScope` 不变。

```ts
import type { PlatformDataType } from './scope';

export interface RoleDataScope {
  dataType: PlatformDataType;
  scope: DataScope;
}

export interface RoleDto {
  id: string;
  enterpriseId: string;
  code: string;
  name: string;
  description?: string;
  permissionCodes: string[];
  dataScopes: RoleDataScope[];
  isSystem: boolean;
  status: 'active' | 'disabled';
}

export interface CreateRoleInput {
  enterpriseId: string;
  code: string;
  name: string;
  description?: string;
  permissionCodes: string[];
  dataScopes: RoleDataScope[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissionCodes?: string[];
  dataScopes?: RoleDataScope[];
  status?: 'active' | 'disabled';
}
```

> 若 `rbac.ts` 与 `scope.ts` 互相 import 形成循环，把 `PlatformDataType` 的 import 用 `import type`（仅类型，无运行时循环）。`PLATFORM_DATA_TYPES` 常量留在 `scope.ts`。确认 `packages/platform-contract/src/index.ts` 已 `export *` 这些文件（现状已是）。

### 3.3 `src/auth.ts`

```ts
import type { PlatformDataType } from './scope';
// ...
export interface CurrentUserDto {
  // ...不变字段...
  dataScopes: Record<PlatformDataType, DataScope[]>; // 取代 DataScope[]
  mustChangePassword: boolean;
}
```

## 4. 数据库改动（`apps/platform-api`）

### 4.1 新增迁移 `src/db/migrations/0001_m5_role_data_scopes.sql`

**不改 0000**。内容：

```sql
ALTER TABLE platform.roles DROP CONSTRAINT IF EXISTS roles_data_scope_check;
ALTER TABLE platform.roles DROP COLUMN IF EXISTS data_scope;
ALTER TABLE platform.roles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS platform.role_data_scopes (
  role_id uuid NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
  data_type varchar(32) NOT NULL,
  scope varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_data_scopes_pk PRIMARY KEY (role_id, data_type),
  CONSTRAINT role_data_scopes_type_check CHECK (data_type IN ('profile', 'presence', 'report')),
  CONSTRAINT role_data_scopes_scope_check CHECK (scope IN ('self', 'department', 'department_tree', 'company', 'custom'))
);
```

确认 `src/db/migrate.ts` 是“目录内 `.sql` 按文件名排序追加执行 + `schema_migrations` 记录”；若是，0001 自动被拾取，无需改 runner。若 runner 是硬编码文件列表，则把 0001 追加进列表。

### 4.2 Drizzle schema `src/db/schema/platform.schema.ts`

- `roles` 表去 `dataScope`，加 `isSystem: boolean('is_system').notNull().default(false)`。
- 新增 `roleDataScopes` table（schema、列、PK 与 §4.1 对齐）。导出它。
- 若有 relations 定义，给 `roles` 补 `roleDataScopes: many(roleDataScopes)` 可选（非必须）。
- `platform.schema.spec.ts`：去掉对 `data_scope` 的断言，补 `is_system` 与 `role_data_scopes`（如该 spec 断言列/表存在）。

## 5. Repository（接口 + 双实现）

### 5.1 接口 `src/repositories/platform.repository.ts`

`createRole` 行为变（写 dataScopes）；读出 `RoleDto` 带 `dataScopes`/`isSystem`。本切片**不**新增 `updateRole`/`deleteRole`/`countUsersWithRole`（留 M5-2），但 `RoleDto` 形状已变，故 `listRoles`/`findRoleById` 的返回组装要改。

### 5.2 Postgres 实现 `postgres-platform.repository.ts`

- `createRole`：事务内 `INSERT roles`（不再写 data_scope；`is_system` 默认 false）+ 批量 `INSERT role_permissions` + 批量 `INSERT role_data_scopes`（来自 `input.dataScopes`）。返回组装后的 `RoleDto`。
- `findRoleById` / `listRoles`：join 或二次查询 `role_data_scopes`、`role_permissions`，组装 `dataScopes: RoleDataScope[]`、`permissionCodes`、`isSystem`。

### 5.3 Memory 实现 `store/platform-memory.store.ts`

镜像同样结构（内存数组/Map 存 role→dataScopes），`createRole`/`findRoleById`/`listRoles` 与 PG 行为一致。

## 6. Scope 服务改造（安全核心）

### 6.1 `src/scope/platform-scope.service.ts`

`resolveScope(user, dataType)`：

```ts
async resolveScope(user: CurrentUserDto, dataType: PlatformDataType): Promise<PlatformScope> {
  const scopesForType = user.dataScopes[dataType] ?? [];
  const rawKind = EFFECTIVE_SCOPE_ORDER.find((kind) => scopesForType.includes(kind)) ?? 'self';
  // custom 不在 EFFECTIVE_SCOPE_ORDER → 不会被选中 → 落到 'self'，等价降级
  // ...其余 department/department_tree 展开逻辑与现状一致...
}
```

- 空数组 → `self`，`degradedFromCustom=false`。
- 仅当 `scopesForType` 含 `custom` 且不含任何更宽有效范围时，置 `degradedFromCustom=true`、kind=`self`。实现：`const hasCustom = scopesForType.includes('custom'); const hasEffective = EFFECTIVE_SCOPE_ORDER.some(k => scopesForType.includes(k)); degradedFromCustom = hasCustom && !hasEffective;`
  - 注意这是对旧实现的**行为修正**而非等价：旧 `rawKind ?? 'custom'` 写法会把**空数组**也误判为 `degradedFromCustom=true`；新公式下空数组 → `false`，只有显式 `custom` 且无有效范围才 `true`。§10.2 断言据此区分两种情形。
- `department`/`department_tree` 的 `departmentIds` 展开不变。

### 6.2 `toCurrentUser`（`src/auth/auth.service.ts`）

把 `dataScopes: roles.map((role) => role.dataScope)` 改为按类型分组：

```ts
const dataScopes: Record<PlatformDataType, DataScope[]> = { profile: [], presence: [], report: [] };
for (const role of roles) {
  for (const ds of role.dataScopes) {
    dataScopes[ds.dataType].push(ds.scope);
  }
}
// ...return { ..., dataScopes, ... }
```

（`roles` 已是 active 过滤后的 `RoleDto[]`，现含 `dataScopes`。）

### 6.3 消费者

- `EmployeeService.listEmployees`：`resolveScope(currentUser, 'profile')`。
- `PresenceStatusService.getBoard`：`resolveScope(currentUser, 'presence')`。
- typecheck 暴露的其余调用点/实现绑定全部改到（含 gateway host 内 presence 的 `PLATFORM_SCOPE_SERVICE` provider，如有 mock 实现也要补 `dataType` 参数）。

## 7. Seed（`seed-platform.ts`）

- `upsertAdminRole`：INSERT 去 `data_scope`，列加 `is_system`，值 `true`；`ON CONFLICT DO UPDATE` 去掉 `data_scope=...`，加 `is_system = true`。
- 新增 `seedAdminDataScopes(client, roleId)`：对 `['profile','presence','report']` 各 upsert 一行 `scope='company'`：

```sql
INSERT INTO platform.role_data_scopes (role_id, data_type, scope)
VALUES ($1, $2, 'company')
ON CONFLICT (role_id, data_type) DO UPDATE SET scope = EXCLUDED.scope, updated_at = now()
```

在 `upsertAdminRole` 之后调用。

## 8. 新权限点 `platform:role:assign`

`src/seeds/platform-module-manifest.ts` 的 platform 模块 `permissions` 数组加一项（紧随 `platform:role:manage` 之后）：

```ts
{ code: 'platform:role:assign', name: '分配用户角色', moduleName: 'platform' },
```

> 本切片只新增权限点定义与 seed；`PUT /employees/:id/roles` 的守卫改为该权限属 **M5-2**（避免本切片越界改 controller 行为）。但因 admin seed 授“全部 active 权限点”，新点会自动授予 admin。

确认 `seed-data.spec.ts` 仍通过：其权限点期望是**从 manifest 动态派生**的（`platformModuleManifests.flatMap(...permissions)`），新增 `platform:role:assign` 会自动纳入期望集，**无需手改计数**；其余断言均为 `arrayContaining`。仅当你发现任何**硬编码** platform 权限点计数/枚举列表（现状抽查 `seed-data.spec.ts` 与 `platform-api.e2e-spec.ts` 均无）时才同步 +1。

## 9. 安全基线文档（§16 强制，不可省）

`docs/security-baseline.md`：

- §5 授权基线（数据范围在子节 §5.3）：写明“**模型 B：数据权限按数据类型分别授权**”，列三类数据类型（profile/presence/report）、系统类不参与按范围配置、多角色每类型取最宽、`custom`/缺失降级 `self`。
- §4.4（或 phantom-token 相关节）：注明内省载荷 `CurrentUserDto.dataScopes` 已由 `DataScope[]` 改为 `Record<PlatformDataType, DataScope[]>`，跨进程消费者（presence）须按类型读取。

## 10. 验证

### 10.1 命令（全过）

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

有本机 PostgreSQL 时追加（参见 root CLAUDE.md / runbook）：

```powershell
$env:RUN_POSTGRES_INTEGRATION="true"; $env:RUN_POSTGRES_E2E="true"
$env:DATABASE_URL="postgresql://work:work@localhost:5432/work_platform"
$env:PLATFORM_REPOSITORY_DRIVER="postgres"; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="admin123"
pnpm db:setup
pnpm test:db
pnpm test:e2e:postgres
```

起不来 PostgreSQL 必须在交付说明写明依赖 CI，不得默不作声跳过。

### 10.2 单元/集成断言（必须覆盖）

- `resolveScope`：`profile`/`presence`/`report` 各取对应范围；多角色同类型取最宽；空数组→`self`（`degradedFromCustom=false`）；仅 `custom`→`self`（`degradedFromCustom=true`）；不同类型互不串。
- `toCurrentUser`：两个角色（一个 profile=company、一个 presence=department）→ `dataScopes.profile` 含 company、`dataScopes.presence` 含 department、`dataScopes.report` 为 `[]`；disabled 角色不计入。
- repository（PG + memory 一致）：`createRole({dataScopes:[{profile,company},{presence,department}]})` 后 `findRoleById` 往返一致、`isSystem=false`。
- 消费链路：presence 看板 self/department/company 行为不回归；员工列表同。

### 10.3 数据库状态断言（有 PostgreSQL 时执行，否则写明依赖 CI 并列等价 spec）

```sql
-- 期望：无 data_scope 列、有 is_system 列
SELECT column_name FROM information_schema.columns
 WHERE table_schema='platform' AND table_name='roles' ORDER BY column_name;

-- 期望：admin 角色 is_system=true
SELECT code, is_system FROM platform.roles WHERE code='admin';

-- 期望：3 行，均 company
SELECT data_type, scope FROM platform.role_data_scopes rds
 JOIN platform.roles r ON r.id=rds.role_id WHERE r.code='admin' ORDER BY data_type;

-- 期望：platform=9（含 role:assign）, presence=3
SELECT module_name, count(*) FROM platform.permissions GROUP BY module_name ORDER BY module_name;
```

### 10.4 幂等

已 seed 库上重跑 `pnpm db:seed` 不报错、不重复；重跑 10.3 第三条数字不变（admin 仍 3 行 company）。

### 10.5 独立安全审查（必须）

交付前用 `security-reviewer` 子代理审本切片 diff，重点：授权模型从单一→按类型是否有“范围放大”回归、`custom`/缺失是否安全降级、内省载荷变更是否破坏跨进程鉴权、是否有调用点漏改类型参数导致错类型范围。把结论附进交付说明。

## 11. 必须保持不变（避免越界）

- 不加角色 CRUD 新端点（M5-2）。
- 不改 Web（M5-3）。
- 不改 `0000_init_platform.sql`。
- `PlatformScope` 返回结构、`EFFECTIVE_SCOPE_ORDER`、`department_tree` 展开算法不变。
- `pnpm-lock.yaml` 不手改。

## 12. 完成后更新文档

1. `docs/foundation-progress.md`：§6.2 M5 切片表中 M5-1 置 `Done` + 日期 + verification-log 锚点；§6 “当前下一步”改为 `M5-2 角色管理 API`。
2. `docs/verification-log.md`：顶部加 `## YYYY-MM-DD` + `### M5-1 RBAC Data Model and Scope`，含 Change set、§10 各项实测结果（含 10.3 SQL 数字或“依赖 CI + 等价 spec”）、`security-reviewer` 结论、Follow-up=M5-2。
3. **同步因 `resolveScope` 签名变更而失真的文档**（强制，否则它们会教错下游）：把 `docs/platform-core.md`、`docs/module-contract.md`（§7.1.5 模块集成模板）、`docs/ai-handoff.md` 中旧的单参 `resolveScope(currentUser)` 改为 `resolveScope(currentUser, dataType)`，注明 `dataType ∈ 'profile' | 'presence' | 'report'`。（本切片实际交付时已先行同步，此项留作 checklist。）

## 13. 提交规范

Conventional Commits 单次提交，显式 `git add <files>`（不要 `-A`）。建议信息：

```
feat(platform): per-data-type role data scopes and scope resolver

Replace single role data_scope with platform.role_data_scopes keyed by
data type (profile/presence/report). Extend PlatformScopePort.resolveScope
to take a dataType; group CurrentUserDto.dataScopes by type. Update the two
consumers (employee list -> profile, presence board -> presence). Add
platform:role:assign permission. Update security-baseline §5/§4.4.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

不要包含本任务包文件与 `doc-index.md`（入口注册由审查者另提）。
</content>
