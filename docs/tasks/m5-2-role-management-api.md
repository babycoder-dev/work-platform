# Task: M5-2 角色管理 API（CRUD + 用户分配 + 审计）

## 状态

Ready for execution（硬依赖 M5-1 已合入）

## 0. 任务定位

在 M5-1 稳定的契约/数据层之上，补齐角色管理 REST 端点：详情、更新、删除、保护与占用语义，以及用户—角色分配守卫权限切换。**不做 Web UI（M5-3）。**

触及权限面，建议交付前过 `security-reviewer` 子代理。

## 1. 必读

1. `AGENTS.md`（统一错误信封、提交规范）
2. `docs/rfc/m5-roles-permissions-admin.md` §7、§8、§9、§14
3. `docs/security-baseline.md` §5、§6 审计、§7 错误信封
4. 现状代码：
   - `apps/platform-api/src/rbac/role.controller.ts`、`rbac.service.ts`、`role.dto.ts`
   - `apps/platform-api/src/users/employee.controller.ts`（`PUT :id/roles` ~39 行，当前守卫 `platform:role:manage`）、`employee.service.ts`（`assignRoles`）
   - `apps/platform-api/src/repositories/platform.repository.ts`（接口）+ PG/memory 双实现
   - `packages/platform-contract/src/rbac.ts`（M5-1 已加 `UpdateRoleInput`、`RoleDataScope`）
   - `packages/errors`（错误码定义处）
   - `apps/platform-api/src/platform-api.e2e-spec.ts`（角色相关用例）
5. `docs/rfc/m4-presence-mvp.md` §6（API/错误风格参考）

## 2. 设计要点

1. 端点权限：`view`→`platform:role:view`；`create/update/delete`→`platform:role:manage`；用户分配→`platform:role:assign`。
2. `isSystem=true` 角色：`PATCH`/`DELETE` 一律 409 `PLATFORM_ROLE_PROTECTED`（本期内置角色整体只读）。
3. 删除非内置角色：`countUsersWithRole(id) > 0` → 409 `PLATFORM_ROLE_IN_USE`。
4. `dataScopes` 校验：每项 `dataType ∈ PLATFORM_DATA_TYPES`、`scope ∈ DataScope`；同一 `dataType` 重复 → 400。
5. 审计 `platform.role.update` / `platform.role.delete`（`create` 已存在，改 metadata）。
6. Nest 构造器注入显式 `@Inject(...)`。

## 3. Repository 新增（接口 + PG + memory）

`src/repositories/platform.repository.ts` 接口加：

```ts
updateRole(id: string, input: UpdateRoleInput): Promise<RoleDto | undefined>;
deleteRole(id: string): Promise<boolean>;
countUsersWithRole(roleId: string): Promise<number>;
```

- `updateRole`：事务内按提供字段增量更新 `roles`（name/description/status）；若 `input.permissionCodes` 提供，整组替换 `role_permissions`；若 `input.dataScopes` 提供，整组替换 `role_data_scopes`（先删后插该 role 的行）。返回组装后的 `RoleDto`；角色不存在返回 `undefined`。注意 PG 的 `listRoles`/`findRoleById` 读路径都过滤 `deleted_at IS NULL`，更新只动 active 行。
- `deleteRole`：**物理删除** `roles` 行（`DELETE FROM platform.roles WHERE id=$1`，子表 `role_permissions`/`user_roles`/`role_data_scopes` 经迁移 SQL 的 `ON DELETE CASCADE` 清掉）；成功 `true`，不存在 `false`。
  - **明确决策**：`roles` 表虽有 `deleted_at` 软删列（其它实体在用、读路径过滤），但**角色本期采用物理删除**——理由：① 无生产数据；② §6 的占用保护已挡住"删除仍被用户引用的角色"，无悬挂外键风险；③ `roles_enterprise_code_unique(enterprise_id, code)` 非部分索引，软删残留行会**占住 code 阻止同名重建**，物理删才能让管理员删后重建同 code。`deleted_at` 列对 roles **保留不用**（未来若改软删需先把唯一索引改成 `WHERE deleted_at IS NULL` 的部分索引）。
- `countUsersWithRole`：PG = `SELECT count(*) FROM platform.user_roles WHERE role_id=$1`。**memory 实现不同**：内存 store 没有 `user_roles` 表，用户角色存在 `employee.roleIds` 数组里——遍历 `this.employees` 统计 `roleIds.includes(roleId)` 的员工数。

## 4. 错误码（内联抛 `ApiError`，不改 `packages/errors`）

> 现状核实：`packages/errors/src` **没有错误码常量表**（只有 `api-error.ts` / `error-response.ts` / `index.ts`）。既有平台码（如 `PLATFORM_DUPLICATE_RESOURCE`）是在 `apps/platform-api/src/repositories/postgres-error.mapper.ts:14` 用 `new ApiError('PLATFORM_DUPLICATE_RESOURCE', '资源已存在', { status: 409 })` **内联**抛出的。**不要**去 `packages/errors` 新建常量。

在 service 抛出处直接内联 `ApiError`（从 `@work/errors` import）：

```ts
throw new ApiError('PLATFORM_ROLE_PROTECTED', '内置角色不可修改或删除', { status: 409 });
throw new ApiError('PLATFORM_ROLE_IN_USE', '角色仍被用户占用，无法删除', { status: 409 });
```

**关键**：这两个 409 **必须**用 `ApiError` 抛出。若改用 NestJS 内置 `ConflictException`，统一异常归一层（`nest-common` 的 `error-response.ts`）只对 `ApiError` 实例保留自定义 `code`，普通 Nest 异常会被归一为 `code: 'HTTP_409'`——§9 对 `code === 'PLATFORM_ROLE_*'` 的断言会失败。

## 5. DTO（`role.dto.ts`）

- `CreateRoleDto`：**现状已是 `dataScopes` 嵌套**（M5-1 已落地，DTO 里已无旧 `dataScope` 字段）——本期只需**确认**它带 `@ValidateNested({each:true})` + `@Type(() => RoleDataScopeDto)`，`RoleDataScopeDto` 校验 `dataType @IsIn(PLATFORM_DATA_TYPES)`、`scope @IsIn(DATA_SCOPES)`，缺则补齐。
- **新增** `UpdateRoleDto implements UpdateRoleInput`（现 `role.dto.ts` 无此类）：全部字段 `@IsOptional`；`status @IsIn(['active','disabled'])`；`dataScopes` 同 `CreateRoleDto` 的嵌套校验。
- 同一 `dataType` 重复的校验：在 service 层显式检查（DTO 难表达唯一性），重复 → `BadRequestException`（400）。400 校验沿用 Nest 内置异常即可（§9 对 400 只断言状态码、不断言 `code`）。

## 6. Service（`rbac.service.ts`）

新增方法（均写审计，沿用 `buildPlatformAuditContext`）：

- `getRole(id)`：`findRoleById`；不存在 → `NotFoundException`(404)。
- `createRole`（已存在）：metadata 把 `dataScope` 改为 `dataScopes`；加 `assertUniqueDataTypes(input.dataScopes)`。
- `updateRole(id, input, ctx)`：
  - `findRoleById`；不存在 → 404。
  - `role.isSystem` → 抛 `PLATFORM_ROLE_PROTECTED`(409)。
  - `assertUniqueDataTypes`（若提供 dataScopes）。
  - `repository.updateRole`；审计 `platform.role.update`，metadata 含 `roleId` 与本次提供的变更字段。
- `deleteRole(id, ctx)`：
  - `findRoleById`；不存在 → 404。
  - `isSystem` → `PLATFORM_ROLE_PROTECTED`(409)。
  - `countUsersWithRole>0` → `PLATFORM_ROLE_IN_USE`(409)。
  - `repository.deleteRole`；审计 `platform.role.delete`，metadata `{roleId, code}`。

`assertUniqueDataTypes`：发现重复 `dataType` 抛 400（`BadRequestException`）。

> 上面两处 409（`PLATFORM_ROLE_PROTECTED` / `PLATFORM_ROLE_IN_USE`）**必须按 §4 用 `new ApiError(code, msg, { status: 409 })` 抛**，否则错误码退化为 `HTTP_409`，§9 断言失败。404 用 `NotFoundException` 可（§9 对 404/400/403 只断状态码）。

## 7. Controller（`role.controller.ts`）

```ts
@Get()    @RequirePermissions('platform:role:view')    listRoles()
@Get(':id') @RequirePermissions('platform:role:view')  getRole(@Param('id'))
@Post()   @RequirePermissions('platform:role:manage')  createRole(@Body(...CreateRoleDto))
@Patch(':id') @RequirePermissions('platform:role:manage') updateRole(@Param('id'), @Body(...UpdateRoleDto))
@Delete(':id') @RequirePermissions('platform:role:manage') deleteRole(@Param('id'))
```

写操作传 `buildPlatformAuditContext(request)`。`@Param('id')` 用 `ParseUUIDPipe`（与平台现有风格一致；若现有 controller 未用则保持一致，不强加）。

## 8. 用户—角色分配守卫切换

`employee.controller.ts` 的 `PUT :id/roles`：守卫由 `@RequirePermissions('platform:role:manage')` 改为 `@RequirePermissions('platform:role:assign')`。`assignRoles` service 与审计 `platform.employee.roles.assign` 不变。

> 该权限点已在 M5-1 加入 manifest 与 admin seed，故 admin 不受影响；但任何只持 `platform:role:manage` 而无 `:assign` 的自定义角色将失去分配能力——这是 §14 决策 B 的预期。

## 9. 测试要求（e2e + 单元）

`platform-api.e2e-spec.ts`（内存 driver）补：

- `POST /roles` 带按类型 `dataScopes` → 201；`GET /roles/:id` 往返一致。
- `PATCH /roles/:id` 改 `dataScopes`/`permissionCodes`/`status` → 200 且落库。
- `DELETE /roles/:id` 未占用 → 200（沿用平台默认，不加 `@HttpCode(204)`；e2e 断言 200）；占用（先 `PUT /employees/:id/roles` 绑定）→ 409 `PLATFORM_ROLE_IN_USE`。
- 对 admin（`isSystem`）`PATCH`/`DELETE` → 409 `PLATFORM_ROLE_PROTECTED`。
- 重复 `dataType` → 400；非法 `scope`/`dataType` 枚举 → 400。
- 重复 `code` → duplicate 错误。
- 401（无 token）/403（无对应权限点）。
- `PUT /employees/:id/roles`：持 `platform:role:assign` 通过；仅持 `platform:role:manage`（无 assign）→ 403。
- 审计：`platform.role.update` / `platform.role.delete` 写入且 metadata 字段齐。

有 PostgreSQL 时在 `platform-api.postgres.e2e-spec.ts` 补等价覆盖（至少 create+get 往返、protected/in-use 409）。

## 10. 验证

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

有 PostgreSQL 追加 `pnpm test:db` / `pnpm test:e2e:postgres`（env 见 M5-1 §10.1）。起不来写明依赖 CI。

交付前过 `security-reviewer` 子代理（重点：权限点绑定是否正确、保护/占用语义是否可绕过、审计是否覆盖全部写操作）。

## 11. 必须保持不变

- 不改 Web。
- 不改 M5-1 已定的契约类型与迁移、scope 解析逻辑。
- `setUserRoles` / `assignRoles` 行为不变（只改守卫权限点）。

## 12. 完成后更新文档

1. `docs/foundation-progress.md`：§6.2 M5-2 置 `Done` + 日期 + 锚点；§6 下一步改 `M5-3 Web 角色管理 UI`。
2. `docs/verification-log.md`：加 `### M5-2 Role Management API`，含 Change set、验证结果、`security-reviewer` 结论、Follow-up=M5-3。

## 13. 提交规范

Conventional Commits 单次提交，显式 `git add`。建议信息：

```
feat(platform): role management API (update/delete/detail + assign guard)

Add GET /roles/:id, PATCH /roles/:id, DELETE /roles/:id with protected
(is_system) and in-use guards; switch user-role assignment to
platform:role:assign. Audit role update/delete. Add PLATFORM_ROLE_PROTECTED
and PLATFORM_ROLE_IN_USE error codes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

</content>
