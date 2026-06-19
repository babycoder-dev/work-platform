# Task: M8-2a 档案读写后端（`:id`/`me` 读 + 本人窄 DTO / 管理 DTO 经写收口 service + `profile` 写授权 + `registration_status` 预留增列 + 同变更补 security-baseline §5）

## 状态

Ready for execution

## 0. 任务定位

M8 的**安全核心切片**。把员工档案从"只有列表 + 建账号 + 改状态/角色/密码"补成 **可按 id 读详情、本人自助读写、管理按数据范围改他人**，
并把**所有"写档案"操作收口到 `EmployeeService` 的单一方法**（未来插审核关/自助注册/批量导入只改这一处）。本切片第一次把
`profile` 数据范围**从"只读过滤"提升为"写授权门禁"**——这是**数据范围模型的语义扩展**，按 §16 变更门禁**必须在同一变更内补
`docs/security-baseline.md` §5**（code-only 不完整，区别于 M8-1 不触发 §16）。

本切片交付：

1. **档案读端点**：`GET /employees/:id`（档案详情，按 `profile` 读范围 + 归属校验）+ `GET /employees/me`（本人档案，登录态）。
   现仅有 `GET /employees`（列表，已按 `profile` scope 过滤）。
2. **档案写端点（两条路径，收口到一个 service 方法）**：
   - `PUT /employees/me/profile`（**本人改本人**，登录态，**窄 DTO**：仅 `name/title/mobile/email`，硬剔除 `status/roleIds/departmentId` 等管理/越权字段）。
   - `PUT /employees/:id/profile`（**管理改他人**，`platform:employee:manage` + 目标在 `profile` **写范围**内，管理 DTO 含 `departmentId`）。
3. **写档案收口 service**（命门，RFC §8）：上面两条路径在 controller 分流 DTO 后，**都调用 `EmployeeService` 的同一个写方法**，
   内部统一做：**目标定位 → 范围/归属校验 → （管理路径）departmentId 引用校验 → 落库（复用既有 `updateEmployee`）→ 审计**。
   **未来插"HR/副负责人审核关 / 自助注册 / Excel 导入"只改这一处**。
4. **`profile` scope 首次用于写授权**（§16 触发）：本人写自身字段子集恒允许；管理写他人按 `resolveScope(user,'profile')` 的
   `self/department/department_tree/company` 逐目标校验。越权写/读他人档案 → **统一信封 404（不泄露存在性）**，不返回 403。
5. **`registration_status` 预留增列**（DDL 迁移，本切片**有迁移**，区别于 M8-1）：`platform.employees` 加
   `registration_status varchar(32) NOT NULL DEFAULT 'active'` + check `IN ('active','pending')`。**本期恒 `active`**；
   【预留】员工自助注册落 `pending` 待审核，未来只改写收口 service 一处 + 审核接口。本期**不进任何可编辑 DTO、不进对外 API**。
6. **同变更补 `docs/security-baseline.md` §5.3**（§16 强制，与代码同 PR）：写明 `profile` 数据范围**同时治理读过滤与写授权**的规则。
7. **审计**：档案写（本人/他人）→ 写审计（actor、目标、mode、changedFields）；失败（越权/不存在）→ 失败审计。

> **本切片明确不做 `profile.updated` 事件 / 通知**：写收口 service 里**留好"他人改才发"的接缝（注释标注），但本切片一行事件都不发**。
> `profile.updated` 契约新建 + platform 生产 + notification 订阅器是 **M8-3**。本切片若写了 `eventBus.emit('profile.updated', ...)` = 越界。

**本切片不做**（划清边界）：

- `profile.updated` 事件契约 / 生产 / notification 订阅器 → **M8-3**（本切片只留收口点 + 注释接缝）。
- 首登向导前端（`mustChangePassword` → 改密 + 补全 UI）→ **M8-2b**（本切片只交后端 `me` 读写端点供其消费）。
- 近况记录 / `platform.status_logs` / `platform:status-log:create` / 批量写授权 → **M8-4**。
- HR 自定义字段 / 消费 M6 forms `profile.employee` / 人页聚合 / 档案照片 → **M8-5**。
- 部门 CRUD（M8-1 已交付）；改密端点（`auth/change-password` 已有，本切片复用、不改）。
- 交付验证门禁（verify:full / docker:build 全量 + 文档总同步）→ **M8-6**。

> **安全门禁判定（写进任务包供二审复核）**：本切片**落在 `apps/platform-api/src/{users,repositories,db}` 子树 + 改数据范围模型语义**——
> 按 `apps/platform-api/CLAUDE.md` 第 2/3 条与 RFC §13：① **§16 变更门禁触发**（"调整数据范围模型"——`profile` scope 提升为写授权），
> **必须同一变更内更新 `docs/security-baseline.md` §5.3**，否则交付不完整；② **合并前强制走 `security-reviewer` 独立二审**。
> reviewer 关注点（§13）：① 管理写他人**确实**按 `profile` 写范围逐目标校验、无绕过；② 本人窄 DTO **无法**透传 `status/roleIds/departmentId`
> （提权向量）；③ `me` 路由先于 `:id` 注册（否则 `me` 被 `:id` 捕获、要 view 权限，本人拿不到自身档案）；④ 跨企业隔离
> （`enterpriseId` 取自 `request.currentUser`，`updateEmployee` 带 `enterpriseId` 复核）；⑤ 越权读/写 → 404 不泄露存在性；
> ⑥ 写档案**只经收口 service**、controller 无旁路；⑦ `registration_status` check + default、不可经任何写端点编辑；
> ⑧ `profile.updated` 本切片确未发（接缝在但静默）。任务包本身二审仍走**独立 general sub-agent**（带决策真值清单）。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、**统一错误信封**、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m8-people-org-profile.md`（**本切片权威规格**）——重点 **§3 现状盘点**（`EmployeeService` 缺通用档案编辑/本人自助/按 id 取详情；
   `profile` scope 已可用但仅用于读）、**§7 HTTP API**（employees 表 + **`me` 必须先于 `:id` 注册**那条引用框 + 归属/范围校验段）、
   **§8 数据范围与写档案收口**（⚠️ `profile` scope 首次用于写授权 + 两条写路径 + 收口单一 service）、**§9 权限点**（复用
   `platform:employee:{view,manage}`，本切片**不新增权限点**）、**§13 安全要求**（§16 触发 + 同变更补 baseline）、**§5.1 employees 增列**
   （`registration_status` 预留位）、**§16 退出标准** 第 2/5 条、**§17 切片计划** M8-2a 行、**§19** 第 6/7/8/9 条已决定事项
4. `docs/security-baseline.md` **§5.3 数据范围**（本切片要**改**的段落）、**§16 变更门禁**（"调整数据范围模型"→同变更更新）、
   **§7 输入校验**（DTO / 拒绝未知字段 / 白名单）、**§6 审计基线**（创建/禁用员工已列，档案写按"写操作必须考虑审计"补）
5. `apps/platform-api/CLAUDE.md`（**安全敏感子树纪律**：`scope`/`repositories`/迁移改动须 reviewer；第 2 条"改规则本身须同变更更新 baseline"；
   **两个迁移入口别合并**（`db:migrate` 是 platform 入口）；**repository driver 默认 postgres**，memory 仅测试/显式 fallback；
   Postgres 集成/e2e **env-gated 静默跳过 = 可能假绿**）
6. `apps/gateway-api/CLAUDE.md`（**两个全局 Guard**：`PlatformAuthGuard` + `PermissionGuard` 对每条嵌入路由生效；
   **不带 `@RequirePermissions` 的路由 = 登录态即可**——`me` 端点正是靠这点做"登录态、无需 view 权限"；需 token 的端点不标 `@Public`）
7. `modules/presence/CLAUDE.md`（**显式 `@Inject` gotcha**——esbuild/tsx 不 emit 装饰器元数据，裸类型注入会 500；新增注入一律显式 `@Inject`）
8. 既有范式代码（**照搬，不要另起炉灶**）：
   - **控制器范式**：`apps/platform-api/src/users/employee.controller.ts`（`@Controller('employees')`、类级 `@UseGuards(PlatformAuthGuard, PermissionGuard)`、
     `@RequirePermissions(...)`、`@Body(dtoValidationPipe(Dto))`、`buildPlatformAuditContext(request)`、`request.currentUser!.enterpriseId` / `.id`）
   - **service + 审计 + 失败审计 + "查→改→`updateEmployee` 返回 undefined 即 NotFound"范式**：`apps/platform-api/src/users/employee.service.ts`
     （`updateStatus` 的 `findEmployeeById` → 比对 enterprise → `{...employee, status}` → `updateEmployee(updated, enterpriseId)` → undefined 即 NotFound；
     `createEmployee` 的 `findDepartmentById` 引用校验；`recordAuditLog` 成功 / `recordFailureAudit` 失败；**`matchScope` 私有方法 = 本切片要复用的范围谓词**）
   - **scope 解析**：`apps/platform-api/src/scope/platform-scope.service.ts`（`resolveScope(user,'profile')` 已可用；`matchScope` 在 employee.service）
   - **DTO 范式**：`apps/platform-api/src/users/employee.dto.ts`（`CreateEmployeeDto implements CreateEmployeeInput`，class-validator；
     `UpdateEmployeeStatusDto` 单字段；新增两个 profile DTO 照此写）
   - **repository 全量 update 范式**：`apps/platform-api/src/repositories/postgres-platform.repository.ts`（`updateEmployee` L389 全列 SET +
     `WHERE id=$1 AND ($11::uuid IS NULL OR enterprise_id=$11) AND deleted_at IS NULL`；`findEmployeeById` L768 `isUuid` 守卫）；
     `apps/platform-api/src/store/platform-memory.store.ts`（内存 `updateEmployee` / `findEmployeeById` 对应实现）
   - **迁移范式**：`apps/platform-api/src/db/migrations/0001_m5_role_data_scopes.sql`（`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + check）、
     `apps/platform-api/src/db/schema/platform.schema.ts`（Drizzle schema，`employees` 表定义 L52-74；增列后 `pnpm db:generate` 同步）、`src/db/migrate.ts`（platform 迁移入口，按文件名 localeCompare 排序跑——新迁移命名 `0002_*` 接在 `0000`/`0001` 后）
   - **统一错误信封 / ApiError**：`@work/errors` 的 `ApiError`；"不存在/越权"沿用 `NotFoundException`（404，不区分无权 vs 不存在）
   - **契约**：`packages/platform-contract/src/users.ts`（`EmployeeDto` / `CreateEmployeeInput`；新增 `UpdateMyProfileInput` / `UpdateEmployeeProfileInput`）
   - **e2e 范式**：`apps/gateway-api/src/*.e2e-spec.ts`（memory driver、登录拿 token、`afterAll` close）；
     platform 集成范式：`apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts`（env-gated）

## 2. 设计要点（严格遵守）

### 2.1 契约：新增两个 profile 写 Input（`packages/platform-contract/src/users.ts`）

```ts
// 本人自助改（窄字段；title/mobile/email 可清空，name 不可清空）
export interface UpdateMyProfileInput {
  name?: string;
  title?: string | null;
  mobile?: string | null;
  email?: string | null;
}

// 管理改他人（在自助字段基础上 + departmentId；departmentId=null 表示移出部门）
export interface UpdateEmployeeProfileInput {
  name?: string;
  departmentId?: string | null;
  title?: string | null;
  mobile?: string | null;
  email?: string | null;
}
```

- **三态语义**：`undefined` = 不改；`null` = 清空（仅 `title/mobile/email/departmentId`）；`string` = 设值。`name` 只 `undefined`/`string`（身份字段不可清空）。
- **本切片不动 `EmployeeDto`**：`registration_status` **不进 `EmployeeDto`**（§2.6 预留，无消费者，不提前暴露契约面）。
- **写端点不收 `status/roleIds/employeeNo/account/enterpriseId/registrationStatus`**——这些有各自端点或为系统字段；窄/管理 DTO 都不声明（§2.2）。
- `index.ts` 若按模式 re-export，同步导出。

### 2.2 DTO：新增两个（`apps/platform-api/src/users/employee.dto.ts`）

- `UpdateMyProfileDto implements UpdateMyProfileInput`：仅 `name/title/mobile/email`，全 `@IsOptional()`；`name @IsString() @IsNotEmpty()`
  （**M8-1 遗留 Minor 的教训：可清空≠可空串；`name` 传了就必须非空**）；`title/mobile @IsString()`、`email @IsEmail()`；
  `title/mobile/email` 允许显式 `null`（`@ValidateIf((_,v)=>v!==null)` 放行 null，区分"传 null 清空"与"没传不改"）。
- `UpdateEmployeeProfileDto implements UpdateEmployeeProfileInput`：在上面基础上 + `departmentId?: string | null`（`@ValidateIf((_,v)=>v!==null) @IsString()`）。
- **白名单兜底（提权命门）**：本仓 `dtoValidationPipe` 已开 `whitelist:true` + `forbidNonWhitelisted:true`（M8-1 reviewer 已确认）——
  故窄 DTO 里**任何未声明字段（`departmentId/status/roleIds/...`）出现在 body → 400**。**仍要双保险**：service 自助路径只读窄字段集，
  **绝不**把 `UpdateEmployeeProfileInput` 的管理字段透传到自助路径（§2.3 mode 分流）。

### 2.3 EmployeeService：写档案收口 + 按 id/本人读（`apps/platform-api/src/users/employee.service.ts`）

**读：新增 `getEmployeeById(id, currentUser)`**（供 `GET /employees/:id`）：

1. `scope = await this.scopeService.resolveScope(currentUser, 'profile')`。
2. `emp = await this.repository.findEmployeeById(id)`。
3. `if (!emp || !this.matchScope(emp, scope))` → **`NotFoundException('员工不存在')`**（`matchScope` 已含 enterprise 比对 + scope 判定；
   越权/跨企业/不存在统一 404，**不泄露存在性**）。读路径**不写失败审计**（与既有 `listEmployees` 一致，读不审计；档案写才审计）。
4. 返回 `emp`（`EmployeeDto`）。

> **`me` 读**（`GET /employees/me`）走独立方法或直接 `findEmployeeById(currentUser.id)`：本人恒可见自身，**不经 scope 过滤**
> （self 是范围下界）；`!emp` → NotFound（理论不达，防御）。**不要**让 `me` 走 `getEmployeeById`（那会被 scope 过滤，self-only 用户也应能看自己——虽然 self 命中，但语义上 `me` 就是无条件本人）。

**写：新增单一收口方法 `updateEmployeeProfile(...)`**（命门，**所有档案写的唯一入口**）：

```ts
async updateEmployeeProfile(
  targetId: string,
  input: UpdateEmployeeProfileInput,   // 已由 controller 按 mode 分流/收窄的字段集
  mode: 'self' | 'management',
  currentUser: CurrentUserDto,
  auditContext: PlatformAuditContext = {},
): Promise<EmployeeDto>
```

流程（顺序不可乱）：

1. **目标定位**：`target = await findEmployeeById(targetId)`；`!target || target.enterpriseId !== currentUser.enterpriseId` →
   失败审计 + `NotFoundException('员工不存在')`。
2. **写授权（§16 语义扩展核心）**：
   - `mode==='self'`：断言 `targetId === currentUser.id`（controller 已用 `currentUser.id` 当 targetId，此处**防御性复核**，不等 → 失败审计 + NotFound/403）。本人恒可写自身窄字段。
   - `mode==='management'`：`scope = resolveScope(currentUser,'profile')`；`if (!this.matchScope(target, scope))` → 失败审计 +
     `NotFoundException('员工不存在')`（**越权写不泄露存在性**）。**注意**：scope=self 时 manage 路径只能写自身（matchScope self 仅命中 `target.id===userId`）——预期行为。
3. **departmentId 引用校验（仅 management 且 input 含 departmentId 且非 null）**：`dep = findDepartmentById(input.departmentId)`；
   `!dep || dep.enterpriseId !== currentUser.enterpriseId` → 失败审计 + `NotFoundException('部门不存在')`（照搬 `createEmployee` 范式）。
4. **合并 + 落库（三态判定命门——必须按"值"，不可按"键是否存在"）**：
   > ⚠️ **不要用 `Object.hasOwn(input, key)` / `'key' in input` 判"是否传了"**：本仓 `dtoValidationPipe` 用 `plainToInstance`
   > （`packages/nest-common/src/http/dto-validation.pipe.ts`），TS class-field 语义下 **DTO 实例的所有已声明可选字段都是 own property、未传时值为 `undefined`**——
   > `Object.hasOwn` 对未传字段恒 `true`，会把客户端没碰的 `title/mobile/email` 全部按"已传"误清空（postgres `updateEmployee` 用 `?? null` 落 NULL）+ 污染 changedFields。
   - **按值三态**：对每个可写字段，`value === undefined` → **保留原值**（不进 changedFields）；`value === null` → **清空**（置 `undefined`，DTO `title?: string|null` → `EmployeeDto.title?: string`）；
     `typeof value === 'string'`（`departmentId` 同理）→ **设值**。`name` 仅 `undefined`/`string` 两态。
   - **构造新对象不得原地 mutate**：内存 `findEmployeeById` 返回的是**活引用**（`platform-memory.store.ts`），照搬既有 `updateStatus` 的 `{...employee, status}` 范式
     用 `const updated = { ...target, ...<按值合并的字段> }` 建新对象，**绝不**在 `target` 上原地改（否则越权/落库失败时已污染内存原值、changedFields 比对失真）。
   - `changedFields` 仅收**合并后值与原值不同**的字段名（最小披露，键名级）。
   - `updated: EmployeeDto` → 调 `updateEmployee(updated, currentUser.enterpriseId)`；返回 undefined → 失败审计 + NotFound（并发删除兜底）。
   - **`registration_status` 不在合并范围**（不可经此编辑，§2.6）；`status/roleIds/account/employeeNo` 也不合并（各有端点）。
5. **成功审计**：`action: 'platform.employee.profile.update'`、`resourceType: 'platform.employee'`、`resourceId: targetId`、
   `metadata: { mode, changedFields: <实际改动字段名数组>, self: mode==='self' }`（**不落字段值明文到 changedFields 键名以外**，最小披露）。
6. **`profile.updated` 接缝（本切片不发）**：在审计后留一处注释：
   `// M8-3: 此处为 profile.updated 唯一生产点——他人改（mode==='management' 且 targetId !== currentUser.id）才发；本切片不发任何事件。`
   **不引入 eventBus 依赖、不写 emit**。

**私有失败审计辅助**：复用 `EmployeeService` 已有的 `recordFailureAudit(action, resourceId, auditContext)`（已存在，无需新建）。

### 2.4 控制器（`apps/platform-api/src/users/employee.controller.ts`）——**路由顺序命门**

**`me` 字面量路由必须先于 `:id` 通配注册**，否则 `GET /employees/me` 被 `@Get(':id')` 捕获、`me` 当成 id、并要求 `platform:employee:view`，
使只有 self 范围、无 view 权限的普通员工拿不到本人档案（RFC §7 引用框）。声明顺序（在 `@Get()` 列表之后）：

```ts
@Get('me')                                  // 登录态（无 @RequirePermissions）
getMyProfile(@Req() request) { return this.employeeService.getMyProfile(request.currentUser!); }

@Put('me/profile')                          // 登录态；窄 DTO
updateMyProfile(@Body(dtoValidationPipe(UpdateMyProfileDto)) input, @Req() request) {
  return this.employeeService.updateEmployeeProfile(
    request.currentUser!.id, input, 'self', request.currentUser!, buildPlatformAuditContext(request));
}

@Get(':id')                                 // platform:employee:view + 范围校验（在 service 内）
@RequirePermissions('platform:employee:view')
getEmployee(@Param('id') id, @Req() request) { return this.employeeService.getEmployeeById(id, request.currentUser!); }

@Put(':id/profile')                         // platform:employee:manage + profile 写范围（在 service 内）
@RequirePermissions('platform:employee:manage')
updateEmployeeProfile(@Param('id') id, @Body(dtoValidationPipe(UpdateEmployeeProfileDto)) input, @Req() request) {
  return this.employeeService.updateEmployeeProfile(
    id, input, 'management', request.currentUser!, buildPlatformAuditContext(request));
}
```

- 既有 `@Put(':id/status')` / `@Put(':id/roles')` / `@Put(':id/password')` 是更具体的子路径，与 `@Get(':id')` / `@Put(':id/profile')` 不冲突；
  但**务必把 `@Get('me')` / `@Put('me/profile')` 放在 `@Get(':id')` 之前**。Nest 路由按声明顺序匹配。
- `me` 两端点**不加 `@RequirePermissions`**（登录态即可，靠 `PlatformAuthGuard`）；`:id` 两端点加对应权限。
- 注入沿用构造器 `@Inject(EmployeeService)`；**新增任何注入一律显式 `@Inject`**。

### 2.5 写档案只经收口 service（不得旁路）

- `me/profile` 与 `:id/profile` **两个 controller 方法都调 `updateEmployeeProfile` 同一 service 方法**，仅 `mode` 与 DTO 不同。
- **禁止**在 controller 里直接拼 `EmployeeDto` 调 `updateEmployee`、或为档案写另起第二个 service 方法。收口单点是未来审核关/自助注册/导入的唯一插入处（RFC §8/§19-9）。

### 2.6 `registration_status` 预留增列（**本切片有 DDL 迁移**）

- **迁移**（`apps/platform-api/src/db/migrations/` 新增一支 SQL，沿用 `db:migrate` platform 入口，**不动 presence/files/forms/notification 迁移入口**）：
  ```sql
  ALTER TABLE platform.employees
    ADD COLUMN IF NOT EXISTS registration_status varchar(32) NOT NULL DEFAULT 'active';
  ALTER TABLE platform.employees DROP CONSTRAINT IF EXISTS employees_registration_status_check;
  ALTER TABLE platform.employees ADD CONSTRAINT employees_registration_status_check
    CHECK (registration_status IN ('active', 'pending'));
  ```
- **Drizzle schema** 同步（`src/db/schema/platform.schema.ts` 的 `employees` 表加该列），`pnpm db:generate` 跑一次确认 drizzle 与手写 SQL 一致（**以手写 SQL 迁移为准**，generate 仅校验/补齐，别让 generate 产物覆盖既有命名约定）。
- **用途（预留，写清不留空白，见记忆规约）**：`active`=正式在册（**本期所有员工恒此值**，`createEmployee` 走 DB DEFAULT）；
  `pending`=员工自助注册待 HR 审核（**未来**：自助注册写 `pending`，审核通过经写收口 service 置 `active`）。
- **本期不可编辑、不暴露**：`registration_status` **不进 `EmployeeDto`、不进任何写 DTO、不进 API 响应**；`updateEmployee` 的 SET 列表**不含**它
  （既有 `updateEmployee` 全列 SET 不要加这列，避免被档案写顺带改动）；写收口 service 也不碰它。仅 DB 列 + check + DEFAULT + Drizzle schema。
- **双实现**：postgres 侧靠 DB DEFAULT/check，无需在 `updateEmployee`/`createEmployee` 显式写值；memory 侧**无此列概念**（`EmployeeDto` 不含），
  无需改 memory store —— 二者对外行为一致（都不暴露该字段）。Postgres-gated 测试断言列存在 + 默认 `active` + check 拒绝非法值（§4.2）。

### 2.7 跨企业隔离（安全命门）

- `enterpriseId` / `userId` **永远**取自 `request.currentUser`（`!.enterpriseId` / `!.id`），**绝不**从 body/param 读。
- 写落库 `updateEmployee(updated, currentUser.enterpriseId)` 带 `enterpriseId`，SQL `WHERE ... ($11::uuid IS NULL OR enterprise_id=$11)` 复核（既有实现已支持，**务必传值不传 undefined**）。
- 读 `getEmployeeById` 的跨企业拦截靠 `matchScope`（首行比对 `employee.enterpriseId !== scope.enterpriseId`）。

### 2.8 同变更补 `docs/security-baseline.md` §5.3（**§16 强制，与代码同 PR**）

> **这是本切片区别于 M8-1 的关键交付，不是可选项。** §16"调整数据范围模型"门禁触发：`profile` scope 从只读过滤提升为写授权门禁。
> 按 `apps/platform-api/CLAUDE.md` 第 2 条与 RFC §13，baseline 更新**必须与代码在同一变更（同一 PR / 提交）落地**，code-only 不完整。

在 `docs/security-baseline.md` §5.3「数据范围」末尾**追加**一段（提议措辞，二审可微调，但语义不可少）：

```text
数据范围既治理「读过滤」也治理「写授权」。自 M8 起，profile 数据范围用于档案写授权：
- 本人改本人档案（self）：登录态即可写自身受限字段子集（name/title/mobile/email），
  不得借此修改部门、状态、角色等管理字段。
- 管理改他人档案（按范围）：须持操作权限（platform:employee:manage）且目标员工落在操作者
  的 profile 写范围（self/department/department_tree/company）内，逐目标校验；越权按不存在处理。
- 所有档案写收口到单一 service 方法，未来审核关 / 自助注册 / 批量导入复用同一写授权判定。
（近况记录的批量写授权沿用同一 profile 写范围规则，逐 subject 校验——见 M8-4。）
```

- 同时在 §16 变更门禁这条记录的落实留痕——**不新增 §16 条目**（"调整数据范围模型"已在列），但**本切片即是该门禁的一次落实**，
  在 `verification-log` 记"§16 触发 → 同 PR 更新 §5.3 + security-reviewer 通过"。
- **是否需要 ADR**：本切片是既有数据范围模型（M5 模型 B）的**应用面扩展**（读→读+写），**不改类型集 / 不改 kind 集 / 不改最宽取值算法**，
  故**评估结论=补 baseline §5.3 即可，不新增 ADR**（在任务包二审与 security-reviewer 复核此判定；若 reviewer 认为属"规则本身"变化则升级为 ADR）。

> **提交归属例外说明**：按常规分工纯文档由规划方提交 main，但 §16 要求 baseline 更新与代码**同一变更**原子落地——
> 故 `security-baseline.md` §5.3 的这段修改**随代码 PR 由 Codex 一并提交**（本任务包给出确切措辞）。这是 §16 原子性要求下的刻意例外，
> 不是把文档职责转给 Codex；本任务包文件本身仍由规划方提交 main。

## 3. 模块结构增量

### `packages/platform-contract`

- `src/users.ts`：新增 `UpdateMyProfileInput` / `UpdateEmployeeProfileInput`（§2.1）。`index.ts` 同步 re-export（若按模式）。

### `apps/platform-api`

- `src/users/employee.dto.ts`：新增 `UpdateMyProfileDto` / `UpdateEmployeeProfileDto`（§2.2）。
- `src/users/employee.service.ts`：新增 `getEmployeeById` / `getMyProfile` 读方法 + **写收口 `updateEmployeeProfile`**（§2.3）；复用既有 `matchScope` / `recordFailureAudit`。
- `src/users/employee.controller.ts`：新增 `@Get('me')` / `@Put('me/profile')`（先）+ `@Get(':id')` / `@Put(':id/profile')`（后）（§2.4 路由顺序）。
- `src/db/migrations/<新序号>_m8_employee_registration_status.sql`：`registration_status` 增列 + check（§2.6）。
- `src/db/schema/platform.schema.ts`：`employees` 表加 `registration_status`（§2.6）。
- `src/db/migrations/0002_m8_employee_registration_status.sql`：增列 + check（§2.6）。
- 单元测试：`employee.service.spec.ts`（读 by id 范围命中/越权 404、`me` 无条件本人；写收口 self vs management 分支、越权写 404、
  departmentId 引用校验、三态合并、窄 DTO 不透传管理字段、审计成功/失败、**断言本切片不发 profile.updated**）。
- e2e：`apps/gateway-api/src/*.e2e-spec.ts` 增档案读写链路（§4.2）。
- Postgres-gated：`postgres-platform.repository.integration.spec.ts` 补 `registration_status` 列/默认/check（§4.2）。

### `docs`

- `docs/security-baseline.md`：§5.3 追加写授权段（§2.8，**随代码 PR**）。
- 其余文档（platform-core / architecture / domain-glossary / verification-log）见 §7。

> 不动 `auth`（改密复用不改）、不动 `rbac` 权限点、不动 presence/files/forms/notification、不碰 M8 其它切片成果、不发任何事件。

## 4. 验证

### 4.1 命令（全过）

```bash
pnpm install                    # 若 contract 改动触发，无新依赖
NODE_ENV=test pnpm lint && NODE_ENV=test pnpm typecheck
NODE_ENV=test pnpm test         # 单元 + web（务必 NODE_ENV=test，见记忆）
NODE_ENV=test pnpm test:e2e     # in-memory e2e
NODE_ENV=test pnpm build
# 有本地 / CI Postgres 时（验证迁移 + 双实现真跑，别假绿）：
pnpm db:generate                # 确认 drizzle 与手写迁移一致（不产生意外 diff）
pnpm verify:full                # 含 test:db + test:e2e:postgres（env gate 见 root CLAUDE.md）
```

> 本切片**有迁移但不改部署形态**（不加/删 app、不改 compose/Dockerfile、db:setup 链顺序不变——增列并入既有 platform 迁移）；
> `pnpm docker:build` 非必跑（留 M8-6）。**务必确认 Postgres-gated 真跑过**（env gate；source-review 判定而非裸 grep），否则迁移/列约束假绿。

### 4.2 断言（必须覆盖）

- **EmployeeService 单元（`employee.service.spec.ts`，memory driver）**：
  - **读 by id**：company 范围 → 任意同企业员工可读；department/department_tree 范围 → 仅范围内部门员工可读，范围外 → `NotFoundException`；
    self 范围 → 仅自身（经 `:id`）可读、他人 → NotFound；**跨企业 id → NotFound**（不泄露存在性）。
  - **读 me**：`getMyProfile` 返回本人 `EmployeeDto`，**即使该用户 profile scope=self 且无 view 权限**也返回（语义=无条件本人）。
  - **写 self（`mode:'self'`）**：改 `name/title/mobile/email` 成功 → 返回更新后 DTO + 成功审计（`metadata.mode==='self'`、changedFields）；
    `title/mobile/email` 传 `null` → 清空；传 `undefined`/不传 → 保留原值；`name` 不变不在 changedFields。
  - **写 self 提权防护**：构造带 `departmentId`/`status` 的 body 走 `me/profile` → 被窄 DTO 拒（400，`forbidNonWhitelisted`）；
    即便绕过 DTO（直接调 service self 模式传管理字段）→ service 不合并管理字段（断言 `departmentId` 未变）。
  - **写 management（`mode:'management'`）**：范围内目标改 `name/departmentId/...` 成功 + 审计（`metadata.mode==='management'`）；
    范围外目标 → `NotFoundException` + 失败审计；跨企业目标 → NotFound + 失败审计。
  - **departmentId 引用校验**：management 改到不存在/跨企业 `departmentId` → NotFound + 失败审计；`departmentId:null` → 移出部门成功。
  - **不发事件**：写成功路径**不产生任何 `profile.updated`/事件副作用**（若 service 注入了 eventBus 则 spy 断言 0 调用；本切片**不应**注入 eventBus——
    更强的断言是 service 构造器无 eventBus 依赖）。
  - **审计**：所有成功写 `action==='platform.employee.profile.update'`；所有越权/不存在写有失败审计（`result:'failure'`）。
- **e2e（in-memory，经 gateway，memory driver，仿既有 `*.e2e-spec.ts`）**：
  > **fixture 搭建提示**：memory seed 只有单个 admin（company scope + 全权限，`platform-memory.store.ts`）。下面"无 view 权限的普通用户 / 带 manage+department 范围 / 跨企业"
  > 这些角色**没有现成 seed 用户**，须由 admin 经 `POST /employees` + 建 department-scope 角色 + `PUT /:id/roles` 现搭后登录拿 token（新建员工 `mustChangePassword:true` 不阻塞登录；
  > role-less 用户 `resolveScope` 降级 `self`）。别误以为 seed 里有多角色用户而漏搭，否则断言假绿。
  - 无 token → 401；`GET /employees/me` 登录态 200 返回本人；`PUT /employees/me/profile` 改本人成功、再 `GET me` 反映变更。
  - 普通登录用户（无 `platform:employee:view`）`GET /employees/:otherId` → 403（PermissionGuard）；`GET /employees/me` → 200（验证 me 不被 :id 捕获、不要 view 权限）。
  - 有 `platform:employee:manage` 用户 `PUT /employees/:id/profile` 改范围内他人成功；改范围外/跨企业 → 404。
  - `PUT /employees/me/profile` body 带 `departmentId` → 400（窄 DTO）。
- **Postgres-gated（集成）**：`registration_status` 列存在、默认 `active`、check 拒绝非法值（直接 SQL insert `registration_status='bogus'` 应失败）；
  既有 `createEmployee` 后该列 = `active`；`updateEmployee`（档案写）后该列**保持 `active` 不被改动**（断言收口写不触碰预留列）；**确认 gate 真跑**。
- **回归**：platform / presence / files / forms / notification 既有单元 + e2e **全绿**；`listEmployees` 既有 scope 过滤行为不变；
  `matchScope` 复用未改其读语义；`auth/change-password` 不受影响。
- **web**：本切片**无前端**（首登向导=M8-2b，人页聚合=M8-5）；不新增 `*.spec.tsx`。
- 验收禁止假数据/占位蒙混；source-review 判定。

## 5. 退出标准

1. `GET /employees/:id`（按 profile 读范围 + 归属，越权 404）、`GET /employees/me`（登录态无条件本人）落地，`me` 路由**先于** `:id` 注册。
2. `PUT /employees/me/profile`（窄 DTO，`status/roleIds/departmentId` 不可透传）、`PUT /employees/:id/profile`（`platform:employee:manage` + profile 写范围逐目标校验）落地，
   **两者经同一写收口 `updateEmployeeProfile`**；controller 无旁路写档案。
3. `profile` scope **首次用于写授权**落地（self 写自身字段子集 / management 写范围内他人），越权写读统一 404 不泄露存在性，跨企业不可命中（`updateEmployee` 带 enterpriseId 复核）。
4. **`docs/security-baseline.md` §5.3 在同一变更内更新**（写授权段，§2.8）——§16 门禁满足，code-only 视为不完整。
5. `registration_status` 增列 + check + DEFAULT `active`（DDL 迁移 + Drizzle schema），本期恒 `active`、不进任何 DTO/响应、不可经写端点编辑；预留用途注释到位。
6. 写收口 service 留好 `profile.updated` 唯一生产接缝（注释），**本切片确未发任何事件**（M8-3 才接通）。
7. 审计覆盖档案写（成功/失败，metadata 含 mode + changedFields，最小披露）。
8. **不新增权限点**（复用 `platform:employee:{view,manage}`）；不动 auth/rbac/token/session 规则；数据范围**模型本身**（类型/kind/取值算法）未改，仅应用面从读扩到写。
9. `security-reviewer` 独立二审通过（§0 八点 + §2.8 baseline 同步 + ADR 必要性判定）。
10. 单元 + e2e 全绿，`NODE_ENV=test`；迁移 + 双实现一致；Postgres-gated **确认真跑**（列/默认/check + 收口写不动预留列）；`pnpm verify` 全绿；`pnpm db:generate` 无意外 diff。

## 6. 必须保持不变（避免越界）

- **不发 `profile.updated` / 任何事件**（M8-3）；不引入 eventBus 依赖到 EmployeeService。
- 不做首登向导前端（M8-2b）；不碰近况/`status_logs`/`platform:status-log:create`（M8-4）；不碰 forms/人页聚合/照片（M8-5）。
- **不改数据范围模型本身**：不增/删 `PlatformDataType`、不增/删 `PlatformScopeKind`、不改最宽取值算法、不改 `resolveScope`/`matchScope` 的**读**语义；
  本切片只**新增**把 `matchScope` 用作写门禁的调用点。
- 不新发明权限点；不改 `auth/change-password`；不动 presence/files/forms/notification 代码与事件/调度链路。
- `registration_status` 不进 `EmployeeDto`/写 DTO/响应；既有 `updateEmployee` SET 列表不加该列。
- platform 不被其它模块跨 schema 读写；档案写只在 platform 进程内、只经收口 service。

## 7. 完成后更新文档

- `docs/security-baseline.md`：§5.3 写授权段（**随代码 PR**，§2.8）——本切片唯一与代码同变更的文档。
- `docs/foundation-progress.md`：M8 行 In Progress；M8 切片表标 M8-2a done + 下一步 M8-2b（首登向导）/ M8-3（profile.updated）。
- `docs/platform-core.md`：新增 `GET /employees/:id`、`GET/PUT /employees/me(/profile)`、`PUT /employees/:id/profile` API；写收口语义；`registration_status` 预留列。
- `docs/architecture.md`：若需，一句话补"档案读写经写收口 service + profile scope 用于写授权（核心留 platform）"。
- `docs/domain-glossary.md`：补"档案写收口"、"profile 写授权范围"、"注册状态（registration_status，预留）"术语。
- `docs/verification-log.md`：追加 `M8-2a Profile Read-Write Backend` 锚点（含 §16 触发 + 同 PR 更新 §5.3 + ADR 必要性判定结论 + reviewer 结论 + Postgres-gated 是否真跑 + 假绿核查）。

## 8. 提交规范

- 代码分支由 Codex 负责（`feat/...`），走 PR；本任务包属纯文档，由规划方提交 main。
- **例外（§16 原子性）**：`docs/security-baseline.md` §5.3 修改**随代码 PR 由 Codex 一并提交**（§2.8 给出确切措辞），保证 baseline 与代码同变更落地。
- 代码提交 Conventional Commits：`feat(platform): employee profile read-write via single write service + profile write-scope authorization`。
- 提交信息说明：① `:id`/`me` 读 + me/`:id` profile 写经写收口 service；② `profile` scope 首次用于写授权（§16）+ 同 PR 更新 security-baseline §5.3；
  ③ `registration_status` 预留增列（DDL + check，本期恒 active、不可编辑）；④ profile.updated 留接缝未发（M8-3）；⑤ 安全门禁判定 + 是否跑 security-reviewer。
- 合并前过 §0 的 security-reviewer；交付前跑完 §4 命令，结论贴进 `docs/verification-log.md`。
