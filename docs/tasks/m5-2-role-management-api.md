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

- `updateRole`：事务内按提供字段增量更新 `roles`（name/description/status）；若 `input.permissionCodes` 提供，整组替换 `role_permissions`；若 `input.dataScopes` 提供，整组替换 `role_data_scopes`（先删后插该 role 的行）。返回组装后的 `RoleDto`；角色不存在返回 `undefined`。
- `deleteRole`：物理删除 `roles` 行（子表 `ON DELETE CASCADE`）；删除成功 `true`，不存在 `false`。
- `countUsersWithRole`：`SELECT count(*) FROM platform.user_roles WHERE role_id=$1`；memory 实现等价。

## 4. 错误码（`packages/errors`）

新增两个领域错误码并接入统一错误信封：

- `PLATFORM_ROLE_PROTECTED`（HTTP 409）——内置角色不可改/删。
- `PLATFORM_ROLE_IN_USE`（HTTP 409）——角色仍被用户占用，不可删。

按 `packages/errors` 现有定义风格添加（参考既有 `PLATFORM_DUPLICATE_RESOURCE` 等）。controller/service 抛出时走统一 exception filter 输出标准信封。

## 5. DTO（`role.dto.ts`）

- `CreateRoleDto`：去掉旧 `dataScope` 字段，加 `dataScopes: RoleDataScopeDto[]`（嵌套校验 `@ValidateNested({each:true})` + `@Type(() => RoleDataScopeDto)`）；`RoleDataScopeDto` 校验 `dataType @IsIn(PLATFORM_DATA_TYPES)`、`scope @IsIn(DATA_SCOPES)`。`permissionCodes @IsArray @IsString({each:true})`。
- 新增 `UpdateRoleDto implements UpdateRoleInput`：全部字段 `@IsOptional`；`status @IsIn(['active','disabled'])`。
- 同一 `dataType` 重复的校验：在 service 层显式检查（DTO 难表达唯一性），重复 → `BadRequestException`（400）。

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

`assertUniqueDataTypes`：发现重复 `dataType` 抛 400。

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
