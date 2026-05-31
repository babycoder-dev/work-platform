# RFC: M5 权限与角色管理

## 状态

Accepted

## 1. 目标

M5 把“**功能权限 + 数据权限按数据类型授权（模型 B）+ 角色管理 UI**”做成平台可管理能力，作为后续所有业务模块（M6–M11）的统一门禁。【本期做】

具体目标：

- 角色 **CRUD**（新建、编辑、删除、停用）与**用户—角色分配**。
- 给角色分配**功能权限**（沿用平台既有 `@RequirePermissions` 权限点）。
- 给角色分配**数据权限**：按**数据类型 ×范围**分别授权——同一角色对不同数据类型可有不同范围。
- 把既有 `PlatformScopeService` 从“返回单一范围”扩展为“**按数据类型返回范围**”，并改造现有两处消费者。
- 提供角色管理 Web UI（功能权限矩阵 + 数据范围矩阵 + 用户分配）。

业务需求单一事实源为 `docs/product-requirements.md` §2、§4.1；里程碑背景见 `docs/adr/0005-product-replan-roadmap.md`。本文只定义 M5 阶段的落地规则；通用术语以 `docs/domain-glossary.md` 为准。

## 2. 非目标

M5 不实现（标注预留/vNext 的，数据模型或枚举要留位）：

- **custom（自定义指定部门/人员）范围编辑**——【预留】：范围枚举保留 `custom` 取值位，遇到时按 `self` 安全降级并记 `degradedFromCustom`，不提供编辑 UI。
- **角色继承 / 权限模板 / 角色分组**——【vNext】，本期角色是扁平集合。
- **出厂预置的非系统种子角色（部门负责人 / HR / 普通员工 …）自动 seed**——【预留】：本期只 seed `系统管理员` 一个内置角色，其余种子角色由管理员在 UI 创建；§5.6 说明为何不写死。
- **审批 / 日报等业务数据本身的过滤实现**——归各自里程碑（M9/M10/M11）消费本期产出的“按类型范围”，M5 只打通 `profile`（档案/员工）与 `presence`（在位）两条已有消费链路。
- **多企业隔离**、**移动端**——平台范围固定项，沿用现状。

## 3. 当前基础

已有代码（M1–M4 + M3.5-E 落地）：

- `packages/platform-contract`：`DataScope`（`self|department|department_tree|company|custom`）、`RoleDto.dataScope`（**单一**范围）、`CreateRoleInput`、`AssignUserRolesInput`、`CurrentUserDto.dataScopes: DataScope[]`、`PlatformScopePort.resolveScope(user)`、`PlatformScope`。
- `apps/platform-api/src/scope/platform-scope.service.ts`：`PlatformScopeService` 取所有角色里**最宽**范围返回单一 `PlatformScope`，含 `EFFECTIVE_SCOPE_ORDER`、`department_tree` 经 `listDescendantDepartmentIds` 展开、`custom→self` 降级。
- `apps/platform-api/src/rbac`：`RoleController`（仅 `GET /roles`、`POST /roles`）、`RbacService`、`role.dto.ts`。
- `apps/platform-api/src/users`：`EmployeeController`（含 `PUT /employees/:id/roles`，当前守卫 `platform:role:manage`）、`EmployeeService.assignRoles` / `listEmployees`（已按 scope 过滤）。
- `apps/platform-api/src/repositories/platform.repository.ts`：接口含 `listRoles` / `findRoleById` / `createRole` / `setUserRoles` / `listDescendantDepartmentIds`；双实现 = `postgres-platform.repository.ts` 与 `store/platform-memory.store.ts`。
- DB：`platform.roles`（含 `data_scope` 列 + CHECK）、`role_permissions`、`user_roles`；迁移单文件 `0000_init_platform.sql`，runner 用 `platform.schema_migrations` 记录、追加式执行。
- seed：`seed-platform.ts` 仅 seed `admin`（`系统管理员`，`data_scope='company'`）一个角色并授全部 active 权限点。
- 消费 `resolveScope` 的仅两处：`EmployeeService.listEmployees`、`modules/presence/api` 的 `PresenceStatusService.getBoard`。
- 跨进程：`CurrentUserDto` 是 phantom-token 内省载荷（`GET /api/platform/auth/me`）的一部分；presence 跨进程读它（ADR-0004）。**改其形状属安全基线变更**（`apps/platform-api/CLAUDE.md` §16 change gate）。

## 4. 领域模型

### 4.1 数据类型枚举（`PlatformDataType`）【本期做】

可按范围配置的数据类型固定为三类：

| 枚举值     | 含义            | 备注                                                                            |
| ---------- | --------------- | ------------------------------------------------------------------------------- |
| `profile`  | 个人信息 / 档案 | 含**近况记录**——近况记录的可见/新增权限随档案数据权限走（M8 落地，M5 先定枚举） |
| `presence` | 在位状态        | M4 presence 看板本期即接入                                                      |
| `report`   | 日报 / 周报     | M10 落地，M5 先定枚举                                                           |

**系统 / 管理类**（角色、权限、审计等）**不进入该枚举**，只归系统管理员，**不参与按范围配置**。它由功能权限（`platform:*`）直接控制，不与上述三类并列。

> 为何固定三类而非自由扩展：本期“具体优先、前向兼容、不建引擎”（ADR-0005 决策 2）。新增数据类型时只需扩枚举 + CHECK，不改表结构。

### 4.2 范围枚举（`DataScope`）

沿用平台既有 `self / department / department_tree / company`；`custom` 为【预留】取值位，遇到降级 `self`。`department_tree` 的下级展开沿用 `listDescendantDepartmentIds`（**部门表树形结构本期已支持，展示两层但解析不限层**）。

### 4.3 角色模型

角色 = 功能权限集合（`permissionCodes`）+ **按数据类型的范围映射**（`dataScopes`）+ 状态 + `isSystem`。

- `dataScopes`：`{ dataType, scope }` 列表，**每个数据类型至多一条**；缺某类型 = 该类型对该角色按 `self` 处理（安全默认）。
- `isSystem`：内置角色保护位。`isSystem=true` 的角色（本期仅 `系统管理员`）**禁止删除、禁止停用、禁止经 API 改其权限/范围**（详见 §7 删除/保护语义）。

### 4.4 多角色合并规则

一个用户可有多个角色。对**每个数据类型**独立取所有 active 角色中**最宽**范围（沿用 `EFFECTIVE_SCOPE_ORDER = [company, department_tree, department, self]`）。不同数据类型互不影响。disabled 角色不参与（沿用现状：`toCurrentUser` 只取 active 角色）。

## 5. 数据模型与迁移

> 本平台仍在开发期、**无生产数据**，故直接重塑 `roles` 的范围存储，不做回填兼容（决策点 A）。

### 5.1 新增迁移文件 `0001_m5_role_data_scopes.sql`

**不改 `0000_init_platform.sql`**；新增追加式迁移：

1. **去掉 `platform.roles.data_scope`**：先 `DROP CONSTRAINT roles_data_scope_check`，再 `DROP COLUMN data_scope`。
2. **加保护位**：`ALTER TABLE platform.roles ADD COLUMN is_system boolean NOT NULL DEFAULT false`。
3. **新表 `platform.role_data_scopes`**：

```sql
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

`data_type` 单独一行/角色，PK 保证“每类型至多一条”。

### 5.2 Drizzle schema 同步

`platform.schema.ts`：`roles` 去 `dataScope`、加 `isSystem`；新增 `roleDataScopes` table 定义（与 §5.1 对齐）；`platform.schema.spec.ts` 同步断言。

### 5.3 契约类型（`packages/platform-contract`）

`scope.ts`：

```ts
export type PlatformDataType = 'profile' | 'presence' | 'report';
export const PLATFORM_DATA_TYPES: PlatformDataType[] = ['profile', 'presence', 'report'];

export interface PlatformScopePort {
  resolveScope(user: CurrentUserDto, dataType: PlatformDataType): Promise<PlatformScope>;
}
```

`rbac.ts`：

```ts
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
  dataScopes: RoleDataScope[]; // 取代 dataScope
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

`auth.ts`：`CurrentUserDto.dataScopes` 由 `DataScope[]` 改为按类型分组：

```ts
dataScopes: Record<PlatformDataType, DataScope[]>;
```

`toCurrentUser` 对每个 `PlatformDataType` 收集所有 active 角色在该类型下的 `scope`（缺失则该类型为空数组）。空数组在 `resolveScope` 中按 `self` 处理。

> `RoleDataScope`/`PlatformDataType` 放 contract（而非各业务模块），因为它是平台级授权模型，presence/report 等模块作为消费者只引用枚举值。

### 5.4 Repository 接口与双实现

`PlatformRepository` 调整/新增：

- `createRole(input: CreateRoleInput)`：写 `roles` + `role_permissions` + `role_data_scopes`（事务）。
- `updateRole(id, input: UpdateRoleInput)`：按字段增量更新；改 `dataScopes` 时整组替换该角色的 `role_data_scopes` 行；返回更新后 `RoleDto`。
- `deleteRole(id)`：物理删除（`ON DELETE CASCADE` 清子表）。
- `findRoleById` / `listRoles`：读出时 join `role_data_scopes` 组装 `dataScopes`、带 `isSystem`。
- `countUsersWithRole(roleId): Promise<number>`：删除前占用检查。
- `setUserRoles` 保持不变。

postgres 实现与 memory store 双实现都要改；memory store 用内存结构镜像 `role_data_scopes`。

### 5.5 Seed 调整

`seed-platform.ts`：

- `upsertAdminRole` 的 INSERT 去掉 `data_scope`，加 `is_system=true`；`ON CONFLICT` 同步。
- 新增：为 admin 角色 upsert `role_data_scopes` 三行，均 `scope='company'`（`ON CONFLICT (role_id, data_type) DO UPDATE`）。
- admin 仍授全部 active 权限点（含新 `platform:role:assign`，见 §8）。

### 5.6 为何只 seed 系统管理员

产品要求种子角色“**可自定义、不是写死枚举**”（`product-requirements.md` §1）。把部门负责人/HR 等写进 seed 会和“可在 UI 增删改”的诉求冲突，也绑死了企业的部门结构。本期只 seed `系统管理员`（平台自举必需、`isSystem` 保护），其余种子角色作为【预留】由管理员在 UI 按需创建；M5 smoke 即用 UI 创建“部门负责人”验证按类型范围。

## 6. 与 PlatformScopeService 的衔接改造（安全敏感核心）

### 6.1 服务改造

`PlatformScopeService.resolveScope(user, dataType)`：

- 从 `user.dataScopes[dataType]`（`DataScope[]`，可能为空）按 `EFFECTIVE_SCOPE_ORDER` 取最宽；`custom` 或空 → `self` 降级（沿用现 `degradedFromCustom` 逻辑，空数组也置 `degradedFromCustom=false`、kind=`self`）。
- `department` / `department_tree` 的 `departmentIds` 展开逻辑不变。
- 返回结构 `PlatformScope` 不变（仍单一解析结果，只是入参多了 `dataType`）。

### 6.2 消费者改造（typecheck 兜底其余调用点）

- `EmployeeService.listEmployees` → `resolveScope(currentUser, 'profile')`（员工/档案列表属 `profile` 类型）。
- `modules/presence/api` `PresenceStatusService.getBoard` → `resolveScope(currentUser, 'presence')`。
- 改 `PlatformScopePort` 签名后，**`pnpm typecheck` 会暴露所有调用点与所有实现绑定**（含 gateway host 内 presence 的 `PLATFORM_SCOPE_SERVICE` provider）；逐一改到，不得保留无参旧签名重载。

### 6.3 安全基线文档（§16 change gate 强制）

本改动改了**授权数据模型**（数据范围从单一变为按类型）与**跨进程内省载荷**（`CurrentUserDto.dataScopes` 形状）。必须在同一变更内更新 `docs/security-baseline.md` §5 授权基线（数据范围在子节 §5.3）：记录“模型 B：数据权限按数据类型分别授权”、三类数据类型、合并取最宽规则、`custom`/缺失降级 `self`；并在 §4.4 phantom-token 处注明内省载荷 `dataScopes` 已改为按类型分组。M5-1 必过 `security-reviewer` 子代理二次审查。

## 7. API 契约

平台内部前缀 `/api/platform`（沿用）。

| 方法 + 路径                | 权限点                     | 说明                                                               |
| -------------------------- | -------------------------- | ------------------------------------------------------------------ |
| `GET /roles`               | `platform:role:view`       | 角色列表，含 `permissionCodes`、`dataScopes`、`isSystem`、`status` |
| `GET /roles/:id`           | `platform:role:view`       | 角色详情；不存在 → 404                                             |
| `POST /roles`              | `platform:role:manage`     | 创建角色                                                           |
| `PATCH /roles/:id`         | `platform:role:manage`     | 更新角色（名称/描述/权限/范围/状态）；`isSystem` 角色 → 409        |
| `DELETE /roles/:id`        | `platform:role:manage`     | 删除角色；`isSystem` → 409；被用户占用 → 409                       |
| `PUT /employees/:id/roles` | `platform:role:assign`     | 用户—角色整组覆盖（**已存在，仅改守卫权限**）                      |
| `GET /permissions`         | `platform:permission:view` | 功能权限点清单（**已存在**），UI 权限选择器用                      |

### 7.1 输入校验

- `dataScopes`：数组，每项 `dataType ∈ PLATFORM_DATA_TYPES`、`scope ∈ DataScope`；同一 `dataType` 不得重复（重复 → 400）。允许只配置部分类型（缺失按 `self`）。
- `permissionCodes`：字符串数组；本期不强校验每个 code 是否存在（与现 `createRole` 行为一致），但 RFC 建议过滤未知 code（实现可选，写进任务包断言）。
- `code`：企业内唯一（`roles_enterprise_code_unique`），冲突由 DB `23505` → `PLATFORM_DUPLICATE_RESOURCE`。

### 7.2 保护与删除语义（决策点 C）

- `isSystem=true`：`PATCH` 与 `DELETE` 一律 409，错误码 `PLATFORM_ROLE_PROTECTED`。（本期内置角色整体只读，避免“系统管理员被改瘫”这一类高危误操作；如未来要细到“可改名不可降权”，另开切片。）
- 删除非内置角色前 `countUsersWithRole > 0` → 409，错误码 `PLATFORM_ROLE_IN_USE`，提示先解除分配。
- 错误响应走统一错误信封（`AGENTS.md`）。两个新错误码登记到 `@work/errors`。

## 8. 权限点清单

平台模块 manifest（`apps/platform-api/src/seeds/platform-module-manifest.ts`）：

| 权限点                     | 名称                                   | 状态         |
| -------------------------- | -------------------------------------- | ------------ |
| `platform:role:view`       | 查看角色                               | 已存在       |
| `platform:role:manage`     | 管理角色（CRUD + 功能权限 + 数据范围） | 已存在       |
| `platform:role:assign`     | 分配用户角色                           | **本期新增** |
| `platform:permission:view` | 查看权限                               | 已存在       |

`platform:role:assign` 与 `:manage` 分离（决策点 B）：未来 HR 等可“给员工分配角色”而不能“改角色权限定义”。本期 admin 同时持有二者。新增权限点要补 `platform-api.e2e-spec.ts` 中“权限点/菜单数量”相关断言。

## 9. 审计

写操作必须写 `platform.audit_logs`：

| action                           | 触发                        | metadata 至少含                                              |
| -------------------------------- | --------------------------- | ------------------------------------------------------------ |
| `platform.role.create`           | 创建角色（**已存在**）      | `enterpriseId, code, permissionCodes, dataScopes`            |
| `platform.role.update`           | 更新角色（**新增**）        | `roleId, 变更字段（permissionCodes/dataScopes/status/name）` |
| `platform.role.delete`           | 删除角色（**新增**）        | `roleId, code`                                               |
| `platform.employee.roles.assign` | 用户—角色分配（**已存在**） | `roleIds`                                                    |

`platform.role.create` 的 metadata 需把旧 `dataScope` 字段改为 `dataScopes`（按类型）。

## 10. Web 管理 UI 范围

挂在既有 `/platform/roles` 菜单（`@work/platform-web`）。参考飞书信息架构；具体视觉稿实现阶段另给设计简报，本 RFC 只定范围：

- **角色列表页**：表格（名称/code/状态/用户数可选）、新建入口、行内编辑/删除；`isSystem` 行禁用删除/编辑按钮并标注“内置”。
- **角色编辑页/抽屉**：
  - 基本信息（名称、code、描述、状态）。
  - **功能权限矩阵**：`GET /permissions` 按 `moduleName` 分组勾选。
  - **数据范围矩阵**：三个数据类型（档案/在位/日报）× 四个范围（本人/本部门/本部门及下级/全公司）单选；`custom` 不出现在 UI（预留）。数据类型与标签来自 contract 常量。
- **用户分配**：在角色编辑处或员工管理处选择用户整组覆盖（`PUT /employees/:id/roles`）。M5 最小实现可放在“员工管理”页给员工选角色；列表/编辑为主，分配为辅。
- 全程 `@work/http-client`；加载/成功/失败/校验错误四态齐全；无权限按钮隐藏（沿用 Shell 权限机制）。

## 11. 测试要求

- `resolveScope(user, dataType)`：按类型取范围；多角色取最宽；不同类型互不串；空/`custom` 降级 `self`。
- `CurrentUserDto.dataScopes` 按类型分组组装正确（含多角色、disabled 角色不计）。
- 消费链路：presence 看板按 `presence` 范围过滤；平台员工列表按 `profile` 范围过滤。
- 角色 API：创建/更新/删除/详情；按类型范围往返一致；`isSystem` 改/删 → 409；占用删除 → 409；重复 code → duplicate；非法 `dataScopes`（重复类型/非法枚举）→ 400；401/403。
- 用户—角色分配守卫 `platform:role:assign`。
- 审计三 action 写入与 metadata 字段。
- 迁移：空库迁移到 `0001` 后 `roles` 无 `data_scope`、有 `is_system`，`role_data_scopes` 存在且约束生效；seed 幂等（admin 三行 company，重复 seed 数字不变）。
- Web：列表/编辑/矩阵/分配组件状态测试。

## 12. 退出标准

- 管理员可在 UI 新建角色并按数据类型分别配置范围；保存后 `role_data_scopes` 落库。
- 给某用户分配该角色后，其 `CurrentUserDto.dataScopes` 按类型生效，**presence 看板按 `presence` 范围、平台员工列表按 `profile` 范围**实际过滤数据。
- `isSystem` 系统管理员角色不可删/改；被占用角色不可删。
- `platform:role:assign` 生效；新权限点入 seed 与 manifest。
- 安全基线 §5 已同步；`security-reviewer` 子代理通过。
- `pnpm verify`（+ 有 DB 时 `verify:full`）、CI、浏览器 smoke 全过。

## 13. 切片计划

| 切片     | 范围                                                                                                                         | 安全审查                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **M5-0** | 本 RFC                                                                                                                       | —                                  |
| **M5-1** | 数据模型 + 契约 + Scope 按类型 + 消费者改造 + 安全基线文档（§4–§6、§5.x、§8 权限点 seed/manifest）。一个自包含任务包。       | **必过 `security-reviewer`**       |
| **M5-2** | 角色管理 API（§7 CRUD/详情/保护/删除语义、§9 审计、错误码、e2e）；`PUT /employees/:id/roles` 守卫改 `platform:role:assign`。 | 触权限面，建议 `security-reviewer` |
| **M5-3** | Web 角色管理 UI（§10）。                                                                                                     | —                                  |
| **M5-4** | 交付验证（`pnpm verify`/`verify:full`、DB/e2e、浏览器 smoke 走查角色→范围→看板联动、verification-log）。                     | —                                  |

M5-1 与 M5-2 拆分理由：M5-1 是跨进程契约 + 授权模型变更（安全敏感、含文档门禁），独立审查；M5-2 在其稳定契约上做纯 API 扩展。

## 14. 已决定事项

- **去掉 `roles.data_scope` 列**，`role_data_scopes`（按类型）为唯一事实源，无生产数据故不回填（决策点 A）。
- 数据类型固定三类 `profile / presence / report`；系统/管理类不参与按范围配置。
- 多角色对每个数据类型独立取最宽；`custom`/缺失降级 `self`。
- **新增 `platform:role:assign`** 与 `platform:role:manage` 分离（决策点 B）。
- 用户—角色分配用 `PUT /employees/:id/roles` 整组覆盖；删除被占用角色 409、`isSystem` 角色整体只读（改/删 409）（决策点 C）。
- 本期只 seed `系统管理员`（`isSystem`），其余种子角色 UI 创建。
- `PlatformScopePort.resolveScope` 加 `dataType` 入参，无向后兼容旧无参签名；`CurrentUserDto.dataScopes` 改为按类型分组——属安全基线变更，同步 `security-baseline.md` §5/§4.4。
  </content>
  </invoke>
