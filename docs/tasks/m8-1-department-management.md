# Task: M8-1 部门管理做满（OrgService 增删改 / 移动 / 设负责人 + 占用删除 409 + 双实现 + `OrganizationPage` 部门树 UI）

## 状态

Ready for execution

## 0. 任务定位

M8 第一刀。把"组织/部门管理"从**只有 list/create** 补成 **可增删改、可移动父部门、可设负责人、删除有占用保护**的可用基座，
并把现在还是占位组件的 `OrganizationPage` 长成**真实部门树管理 UI**。本切片是 M8 里**最不碰数据范围模型**的一刀，
用来先把 platform org 写链路铺平，给后面的档案读写（M8-2a）/近况（M8-4）让路。

本切片交付：

1. **OrgService 写操作做满**：`updateDepartment`（改名 / 设负责人 / 改排序 / 移动父部门）+ `deleteDepartment`（软删 + 占用校验）。
   现仅 `listEnterprises / listDepartments / createDepartment`（`org.service.ts`）。
2. **占用删除 409**：仅当该部门下存在 `status='active' 且 deleted_at IS NULL` 的归属人员、**或**存在 `deleted_at IS NULL` 的
   子部门时拒删（**软删的人员/子部门不计入**，避免误触 409）。统一错误信封，409 Conflict。
3. **移动父部门的环路防护**：不允许把部门的 `parentId` 设为自身或自身的任一后代（否则形成环 / 自指）。
4. **设负责人 / 移动父部门的引用校验**：`managerUserId` 必须是同企业、未软删的员工；`parentId` 必须是同企业、未软删的部门。
5. **Repository 双实现对齐**（命门，见 §2.5）：postgres 侧 `listDepartments/findDepartmentById` **已**过滤 `deleted_at IS NULL`，
   但**内存 store 的 `DepartmentDto` 根本不带 `deletedAt`、`listDepartments` 返回全部** —— 本切片软删后必须让内存侧也跟踪删除态
   并在 list/find/占用统计里排除，否则双实现行为分叉 = 假绿。
6. **`OrganizationPage` 部门树 UI**：把占位组件（`PlatformAdminPlaceholder`）替换为真实部门树：展示（本期两层）、新建 / 改名 / 设负责人 /
   改排序 / 移动 / 删除，写操作 `platform:org:manage` gate，读 `platform:org:view`。
7. **审计**：部门 create（已有）/ update / delete 均写审计（actor、目标、变更字段 / 前后值）。

> **本切片明确不动数据范围模型**：部门读写复用既有 `platform:org:view`/`platform:org:manage`（company 级功能权限，
> 部门列表本期**不**按数据范围过滤——RFC §7 已定性）。`profile` scope 提升为"写授权"是 **M8-2a** 的事，不在本刀。

**本切片不做**（划清边界，别越界）：

- 任何 `platform.employees` 档案字段编辑、`:id`/`me` 档案读写、写收口 service、`profile` 写授权 → **M8-2a**。
- 首登补全向导 → **M8-2b**；`profile.updated` 事件 / 通知 → **M8-3**；近况记录 / `status_logs` / `platform:status-log:create` → **M8-4**。
- `registration_status` 增列 → **M8-2a**（本切片**不加任何列、不加任何表 = 无 DDL 迁移**，见 §2.6）。
- 部门多层（>2 层）的完整展示 / 拖拽编排 → vNext（表结构 `parent_id` 已预留，本期 UI 展示两层）。
- HR 自定义字段 / forms / 人页聚合 → M8-5；交付验证门禁（verify:full / docker:build 全量 + 文档总同步）→ **M8-6**。

> **安全门禁判定（重要，写进任务包供二审复核）**：本切片**落在 `apps/platform-api/src/{org,repositories}` 子树**——
> 按 `apps/platform-api/CLAUDE.md` 第 3 条与 RFC §13 里程碑策略（"本里程碑每个触及 repositories/migrations 子树 + 档案读写范围的切片
> 合并前都过 security-reviewer"），**本切片合并前强制走一次 `security-reviewer` 独立二审**。**但**本切片**不改鉴权规则、不改数据范围模型、
> 不动 auth/scope/audit/token/session、不加权限点、无迁移**（部门 CRUD 复用既有 `platform:org:manage`）——故 §16 "改了规则本身须同变更更新 baseline"
> **不触发**，本切片**不需要**改 `security-baseline.md`。reviewer 关注点收窄为：① 所有变更操作过 `platform:org:manage`；
> ② **跨企业隔离**（`enterpriseId` 一律取自 `request.currentUser`，不信任 body；update/delete/move/count 全部带 `enterpriseId` 复核，
> 不能改/删/统计到别企业的部门）；③ 占用删除判定正确（软删人员/子部门不计入、active 才拦）；④ 移动环路防护无绕过。
> 任务包本身的二审仍按规范走**独立 general sub-agent**（带决策真值清单）。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、**统一错误信封**、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m8-people-org-profile.md`（**本切片权威规格**）——重点 **§3 现状盘点**（departments 树形齐全、缺写操作；
   `platform:org:*` 已 seed）、**§7 HTTP API**（departments 表四行 + **占用删除 409 判定**那条引用框）、**§9 权限点**
   （复用 `platform:org:view`/`:org:manage`，**不新发明 department 权限**）、**§13 安全要求**（里程碑 reviewer 策略）、
   **§16 退出标准** 第 1 条、**§17 切片计划** M8-1 行
4. `apps/platform-api/CLAUDE.md`（**安全敏感子树纪律**：repositories 子树改动须 reviewer；**两个迁移入口别合并**；
   **repository driver 默认 postgres**，memory 仅测试 / 显式 fallback；Postgres 集成 / e2e **env-gated 静默跳过 = 可能假绿**）
5. `apps/gateway-api/CLAUDE.md`（**两个全局 Guard 的坑**：`PlatformAuthGuard` + `PermissionGuard` 对每条嵌入路由生效；
   需 token 的端点不标 `@Public`；带 `@RequirePermissions` 的路由由 `PermissionGuard` 校验功能权限）
6. `modules/presence/CLAUDE.md`（模块隔离、**显式 `@Inject` gotcha**——esbuild/tsx 不 emit 装饰器元数据，裸类型注入会 500）
7. 既有范式代码（**照搬，不要另起炉灶**）：
   - **控制器范式**：`apps/platform-api/src/org/department.controller.ts`（`@Controller('departments')`、
     `@UseGuards(PlatformAuthGuard, PermissionGuard)`、`@RequirePermissions('platform:org:manage')`、
     `dtoValidationPipe(...)`、`buildPlatformAuditContext(request)`、`request.currentUser!.enterpriseId` 取企业）
   - **service + 审计 + 失败审计范式**：`apps/platform-api/src/users/employee.service.ts`（`createEmployee` 的
     `findDepartmentById` 校验 + `NotFoundException`、`recordAuditLog` 成功 / `recordFailureAudit` 失败、`updateStatus` 的
     "查→改→`updateEmployee` 返回 undefined 即 NotFound"模式——**部门 update/delete 照此结构**）
   - **DTO 范式**：`apps/platform-api/src/org/department.dto.ts`（`CreateDepartmentDto implements CreateDepartmentInput`，
     class-validator；新增 `UpdateDepartmentDto` 照此写）
   - **repository 接口 + 双实现**：`apps/platform-api/src/repositories/platform.repository.ts`（接口）、
     `apps/platform-api/src/repositories/postgres-platform.repository.ts`（L125-203 部门读 / `listDescendantDepartmentIds` /
     `mapPostgresError`）、`apps/platform-api/src/store/platform-memory.store.ts`（L48-113 部门 Map / `listDescendantDepartmentIds` /
     软删态缺失见 §2.5）
   - **统一错误信封 / ApiError**：`@work/errors` 的 `ApiError`（memory store 已用
     `new ApiError('PLATFORM_REFERENCE_NOT_FOUND', '关联资源不存在', { status: 400 })`——409 占用错误照此造，见 §2.4）
   - **契约**：`packages/platform-contract/src/org.ts`（`DepartmentDto` / `CreateDepartmentInput`；新增 `UpdateDepartmentInput`）
   - **e2e 范式**：`apps/gateway-api/src/*.e2e-spec.ts`（memory driver、登录拿 token、`afterAll` close）；
     platform 单元 / 集成范式：`apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts`（env-gated）

## 2. 设计要点（严格遵守）

### 2.1 契约：新增 `UpdateDepartmentInput`（`packages/platform-contract/src/org.ts`）

```ts
export interface UpdateDepartmentInput {
  name?: string;
  parentId?: string | null; // null = 置为顶层（移动到根）；undefined = 不改
  managerUserId?: string | null; // null = 清空负责人；undefined = 不改
  sortOrder?: number;
}
```

- **`code` 本期不可改**（不进 UpdateInput）——code 是 `(enterpriseId, code)` 唯一键 + 对外稳定标识，改 code 属 vNext。
- **`enterpriseId` 不进 body**——一律从 `request.currentUser!.enterpriseId` 取（跨企业隔离命门，§2.7）。
- `parentId` / `managerUserId` 用 `string | null | undefined` 三态区分"清空"与"不改"——DTO 层用 class-validator
  允许显式 `null`（见 §2.2）。

### 2.2 DTO：新增 `UpdateDepartmentDto`（`apps/platform-api/src/org/department.dto.ts`）

- `implements UpdateDepartmentInput`，全部字段 `@IsOptional()`；`name @IsString()`、`sortOrder @IsInt() @Min(0)`；
  `parentId` / `managerUserId` 允许 `string` 或显式 `null`（用 `@ValidateIf((_,v)=>v!==null) @IsString()` 之类放行 null，
  或等价写法——目标：能区分"传了 null（清空）"与"没传（不改）"）。
- **不接受 `enterpriseId` / `code` / `status` 字段**（多余字段由全局 `ValidationPipe` 的 `whitelist`/`forbidNonWhitelisted`
  按既有装配行为处理；务必确认本仓 `configurePlatformHttp` 的 ValidationPipe 是否开启 whitelist——若未开，DTO 也不要声明这些字段，
  service 只读 DTO 已声明字段，杜绝越权字段透传）。

### 2.3 OrgService 写操作（`apps/platform-api/src/org/org.service.ts`）

新增两个方法，签名对齐既有 `createDepartment(input, auditContext)` 风格，但**都要带 `enterpriseId`**（跨企业复核）：

**`updateDepartment(id, input: UpdateDepartmentInput, enterpriseId, auditContext)`**：

1. `dept = repo.findDepartmentById(id)`；`!dept || dept.enterpriseId !== enterpriseId` → 失败审计 + `NotFoundException('部门不存在')`
   （**不泄露跨企业存在性**）。
2. 若 `input.parentId` 有值（非 null/undefined）：
   - 校验 parent 存在且同企业（`findDepartmentById` + enterprise 比对），否则 `NotFoundException`/400。
   - **环路防护**：`parentId !== id` 且 `parentId ∉ 子孙(id)`（用**新方法** `repo.listDescendantDepartmentIdsForCycleCheck(id, enterpriseId)`
     ——非软删、不限 status，§2.5；**不要**用原 `listDescendantDepartmentIds`，那是 active-only 的 scope 方法）。命中环 → 抛 400
     （统一信封，如 `ApiError('PLATFORM_DEPARTMENT_CYCLE','不能移动到自身或子部门下',{status:400})`）。
3. 若 `input.managerUserId` 有值（非 null/undefined）：校验是同企业、未软删的员工（`findEmployeeById` + enterprise 比对），
   否则 `NotFoundException`/400。
4. `repo.updateDepartment(id, input, enterpriseId)` → 返回 undefined 视为 NotFound（并发删除兜底）。
5. 成功审计：`action: 'platform.department.update'`、`resourceId: id`、`metadata` 记变更字段（changedFields）+ 关键前后值
   （如 parentId/managerUserId 变更）。

**`deleteDepartment(id, enterpriseId, auditContext)`**（软删）：

1. 同上查存在 + 同企业，否则失败审计 + NotFound。
2. **占用校验**：
   - `activeEmployees = repo.countActiveEmployeesInDepartment(id, enterpriseId)`（`status='active' AND deleted_at IS NULL`）。
   - `hasActiveChildren = repo.hasActiveChildDepartments(id, enterpriseId)`（直接子部门中 `deleted_at IS NULL` 存在即真）。
   - 任一为真 → 失败审计 + `ApiError('PLATFORM_DEPARTMENT_NOT_EMPTY','部门下仍有人员或子部门，无法删除',{status:409})`。
3. `repo.softDeleteDepartment(id, enterpriseId)`（置 `deleted_at = now()`）→ false 视为 NotFound。
4. 成功审计：`action: 'platform.department.delete'`、`metadata` 记 code/name。

> **占用判定边界（防误拦/防漏拦）**：active 人员 = `status='active' AND deleted_at IS NULL`（停用或软删的人**不**拦删）；
> 子部门 = `deleted_at IS NULL`（已软删的子部门不拦）。这与 RFC §7 引用框一字不差，二审重点核对。

### 2.4 统一错误信封（409 / 400）

- 占用 409、环路 400 用 `@work/errors` 的 `ApiError`（带 `{ status }`），与 memory store 既有
  `ApiError('PLATFORM_REFERENCE_NOT_FOUND', ..., { status: 400 })` 同款，经全局 `ApiExceptionFilter` 出统一信封。
- 错误码用 `PLATFORM_*` 前缀、`SCREAMING_SNAKE`，与既有码风格一致（`PLATFORM_DEPARTMENT_NOT_EMPTY` / `PLATFORM_DEPARTMENT_CYCLE`）。
- "不存在 / 跨企业"一律 `NotFoundException`（404），**不区分"无权 vs 不存在"以免泄露存在性**（沿用既有 employee service 范式）。

### 2.5 Repository 接口 + 双实现（命门）

`PlatformRepository`（`platform.repository.ts`）**新增**：

```ts
updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
  enterpriseId: string,
): Promise<DepartmentDto | undefined>;
softDeleteDepartment(id: string, enterpriseId: string): Promise<boolean>;
countActiveEmployeesInDepartment(departmentId: string, enterpriseId: string): Promise<number>;
hasActiveChildDepartments(parentId: string, enterpriseId: string): Promise<boolean>;
// 环路防护专用：返回全部「非软删」后代 id（不限 status，与上面 listDescendantDepartmentIds 的 active-only 口径不同）
listDescendantDepartmentIdsForCycleCheck(parentId: string, enterpriseId: string): Promise<string[]>;
```

**postgres 实现**（`postgres-platform.repository.ts`）：

- `updateDepartment`：partial update，`UPDATE platform.departments SET <动态列>, updated_at = now()
WHERE id=$ AND enterprise_id=$ AND deleted_at IS NULL RETURNING ...`。**仓内无 partial-update 先例**（`updateRole` 是全量替换），
  此处自建，**注意三态陷阱**：
  - **必须按"字段是否出现在 input 里"动态拼 `SET` 子句**——遍历 `input` 已声明的键，命中才 push 一段 `col = $n` 并把值（**含显式
    `null`**）入参数数组。`name`/`sortOrder` 同理。
  - **不要用 `COALESCE($n, col)`**：它无法区分"显式传 `null`(要清空)"与"没传(不改)"——两者到 SQL 都是 null 参数，会把"不改"误成"清空"。
  - `parentId` / `managerUserId` 三态都走动态分支：键不存在→不进 SET；值为 `null`→`SET parent_id = NULL`；值为 string→`SET parent_id = $n`。
  - 若动态 SET 为空（无任何可改字段）→ 直接 `findDepartmentById` 返回当前值，不发空 UPDATE。
  - 捕获唯一键 / 外键错误经 `mapPostgresError`。
  - 内存实现对应：同样只覆盖 input 出现的键，`null`→置 `undefined`/清空，`undefined`→保留原值。
- `softDeleteDepartment`：`UPDATE ... SET deleted_at = now() WHERE id AND enterprise_id AND deleted_at IS NULL`；
  `rowCount > 0` → true。
- `countActiveEmployeesInDepartment`：`SELECT count(*) FROM platform.employees WHERE department_id=$ AND enterprise_id=$
AND status='active' AND deleted_at IS NULL`。
- `hasActiveChildDepartments`：`SELECT 1 FROM platform.departments WHERE parent_id=$ AND enterprise_id=$ AND deleted_at IS NULL LIMIT 1`。

**内存实现（命门 / 假绿陷阱）**（`platform-memory.store.ts`）：

- 现状 `departments = Map<string, DepartmentDto>`，而 **`DepartmentDto` 不含 `deletedAt`**，且 `listDepartments` 返回全部、
  `findDepartmentById` 直接 `map.get`。本切片引入软删后，内存侧**必须**跟踪删除态并在 **`listDepartments` / `findDepartmentById` /
  `softDeleteDepartment`/`updateDepartment` 的命中 / 占用统计(`countActiveEmployeesInDepartment`) / 子部门检查(`hasActiveChildDepartments`)**
  排除已软删项——否则与 postgres（已 `deleted_at IS NULL`）行为分叉。
  - 实现建议：内存行用一个内部类型 `StoredDepartment = DepartmentDto & { deletedAt?: string }`（对外仍 `toDto` 去掉 deletedAt），
    或并存一个 `deletedDepartmentIds: Set<string>`。**对外 DTO 形状不变**（DepartmentDto 不加 deletedAt）。
  - `updateDepartment` / `softDeleteDepartment` / count / hasActiveChild **都要带 `enterpriseId` 复核**（跨企业不可命中）。
  - **`listDescendantDepartmentIds` 原方法两侧都保持原样**（仅 `status='active'`，**不**额外排软删）：保持 memory 与 postgres
    严格对齐（postgres 原方法 `L181-203` 也未过滤 `deleted_at`）。这是**安全的**——占用守卫保证一个部门只有在"无 active 人员且无未软删子部门"
    时才可软删，且软删后无法再往其下挂人/挂子部门（create/update 校验拒绝引用已删部门），故软删部门恒为空，它的 id 即便残留在
    active 后代结果里也无人匹配、对 `department_tree` scope 解析无害。**不要**为了"干净"去给原方法加 `deleted_at IS NULL`——那属于改动
    scope 相关代码，超出本切片且无收益。
- ⚠️ **环路防护必须新增独立方法，绝不改 `listDescendantDepartmentIds` 原 `status='active'` 口径**（二审 Blocking）。
  现有 `listDescendantDepartmentIds` 过滤 `status === 'active'`（memory `L74-97`、postgres `L181-203`），而它是
  **`department_tree` 数据范围解析的一部分**（`platform-scope.service.ts` 用它展开 tree scope）。两处既有测试硬断言"在 disabled 节点停止"
  （`postgres-platform.repository.integration.spec.ts` "stops at disabled nodes" + `platform-memory.store.spec.ts` `not.toContain(disabled...)`）。
  **若把它放宽成 `deleted_at IS NULL`，会**：① 直接红掉这两个测试；② 让"已停用部门下的人"重新进入 `department_tree` 写/读范围 =
  **改动数据范围模型语义**，与本任务包 §0 / §5 "不改数据范围模型、§16 不触发、不改 baseline" **直接矛盾**。
  - **唯一正确做法**：环路防护用一个**新方法**（如 `listDescendantDepartmentIdsForCycleCheck(parentId, enterpriseId)` 或给现方法加
    `{ includeInactive: true }` 选项参数，默认行为不变），口径 = **仅排除软删（`deleted_at IS NULL`），不限 status**（停用但未删的子部门
    也要算进后代，否则把部门移到一个"已停用子部门"下仍成环）。`listDescendantDepartmentIds` **原签名 / 原 `status='active'` 行为保持
    一字不动**，既有测试与 scope 解析不受影响。两实现（memory + postgres）的新方法口径一致。

### 2.6 无 DDL 迁移（本切片明确不动 schema）

- `platform.departments` 已有 `parent_id / manager_user_id / sort_order / status / deleted_at`（`platform.schema.ts` L35-50）——
  **本切片所有写操作都落在既有列上，软删=置既有 `deleted_at`**。故**不加列、不加表、不写新 SQL 迁移、不动 `db:generate`、不动 db:setup 链**。
- RFC §17 M8-1 行写的"双实现/迁移"是 milestone 级泛述；**本刀具体落地 = 双实现，无迁移**。`registration_status` 增列归 M8-2a、
  `status_logs` 建表归 M8-4。**执行者若发现自己在写 .sql 迁移文件，说明越界了**，停下来对照本节。

### 2.7 跨企业隔离（安全命门）

- `enterpriseId` **永远**取自 `request.currentUser!.enterpriseId`（controller 注入 service），**绝不**从 body/param 读企业。
- repository 每个写 / 统计方法**都带 `enterpriseId` 并在 WHERE 复核**——`platform:org:manage` 是 company 级权限，但权限不等于
  "可跨企业"；多租户隔离靠 enterpriseId 复核，不能只靠 `findDepartmentById` 后比对（写语句本身也要带 enterprise_id 防 TOCTOU）。

### 2.8 控制器（`department.controller.ts`）

- 加 `@Put(':id')` + `@Delete(':id')`，均 `@RequirePermissions('platform:org:manage')`、`@UseGuards` 沿用类级。
- `@Put(':id')` body 走 `dtoValidationPipe(UpdateDepartmentDto)`；两者都 `buildPlatformAuditContext(request)` +
  `request.currentUser!.enterpriseId`。
- **显式 `@Inject(OrgService)`** 已在构造器（沿用）。**`MessageEvent` 无关**；新增注入若有一律显式 `@Inject`。

### 2.9 前端 `OrganizationPage`（`modules/platform/web/src/pages/OrganizationPage.tsx`）

- 替换 `PlatformAdminPlaceholder` 为真实页面：调 `GET /api/platform/departments` 渲染**部门树**（本期展示两层：顶层 +
  其直接子部门；`parentId` 聚合）。展示 name / code / 负责人 / 排序。
- 写操作（`platform:org:manage` 才显示 / 可点）：新建、改名、设负责人（人员选择器 / 下拉，数据来自 `GET /api/platform/employees`）、
  改排序、移动父部门、删除（删除前确认；命中 409 显示"部门下仍有人员或子部门"友好提示，不是裸错误码）。
- **照搬 `RolesPage.tsx` / `EmployeesPage.tsx` 的数据加载 + 错误处理 + `@work/ui` 组件 + token 用法**，不另起一套。
- **像素级还原门禁**（用户硬要求，见记忆 `feedback_ui_pixel_fidelity_gate`）：本页若有设计稿对应屏，按 UI 收口切片同款 A 类
  机器可验证断言（零 hex / 零 emoji / 文案精确 / 仅用 token 与 `@work/ui`）+ B 类视觉走查；**L1/L2 边界**：组织架构是真实功能屏（L1）→
  渲染真实部门数据，**不得塞演示假数据**（如"48 个部门"）。若当前设计稿尚无组织页定稿，则按 `@work/ui` 既有视觉系统实现 +
  在 verification-log 记"待设计稿对齐"，不自创视觉语言。
- 前端测试 `*.spec.tsx` 走 `vitest.web.config.mts`（jsdom），**`NODE_ENV=test`**（本机 shell 默认 production 会剥离 `React.act` 假挂，
  见记忆 `reference_web_tests_node_env_production_trap`）。

## 3. 模块结构增量

### `packages/platform-contract`

- `src/org.ts`：新增 `UpdateDepartmentInput`（§2.1）。导出口（`index.ts`）若按模式 re-export 需同步。

### `apps/platform-api`

- `src/org/department.dto.ts`：新增 `UpdateDepartmentDto`（§2.2）。
- `src/org/org.service.ts`：新增 `updateDepartment` / `deleteDepartment`（§2.3）+ **自建私有失败审计辅助**（`EmployeeService.recordFailureAudit`
  是私有方法，不可复用/注入，照其结构在 `OrgService` 内复制一份；§2.3）。
- `src/org/department.controller.ts`：加 `@Put(':id')` / `@Delete(':id')`（§2.8）。
- `src/repositories/platform.repository.ts`：接口加 **5 个**方法（4 个 CRUD/占用 + 1 个环路 check；§2.5）。
- `src/repositories/postgres-platform.repository.ts`：postgres 实现这 5 个方法；**`listDescendantDepartmentIds` 原方法不动**（§2.5）。
- `src/store/platform-memory.store.ts`：内存实现这 5 个方法 + **软删态跟踪 + list/find/count/hasActiveChild 排除软删**
  （`listDescendantDepartmentIds` 原方法不动；§2.5 命门）。
- 单元测试：`org.service.spec.ts`（update/delete 分支、占用 409、环路 400、跨企业 NotFound、审计成功/失败）；
  内存 store 软删行为单测（list/find 排除软删、count 只算 active 非软删；disabled 员工不拦删的可达反向）。

### `modules/platform/web`

- `src/pages/OrganizationPage.tsx`：真实部门树 UI（§2.9）。
- `src/pages/OrganizationPage.spec.tsx`：渲染 / 加载 / 写操作 gate / 409 提示 / 还原断言（§2.9）。

> 不动 auth/scope/audit/rbac 的**规则**、不加权限点、无迁移、不碰 presence/files/forms/notification/M8 其它切片成果。

## 4. 验证

### 4.1 命令（全过）

```bash
pnpm install                    # 若 contract 改动触发，无新依赖
NODE_ENV=test pnpm lint && NODE_ENV=test pnpm typecheck
NODE_ENV=test pnpm test         # 单元 + web（务必 NODE_ENV=test，见记忆）
NODE_ENV=test pnpm test:e2e     # in-memory e2e
NODE_ENV=test pnpm build
# 有本地 / CI Postgres 时（验证 postgres 双实现真跑，别假绿）：
pnpm verify:full                # 含 test:db + test:e2e:postgres（env gate 见 root CLAUDE.md）
```

> 本切片不改部署形态（不加/删 app、不改 compose/Dockerfile、无迁移），`pnpm docker:build` 非必跑（留 M8-6）。

### 4.2 断言（必须覆盖）

- **OrgService 单元（`org.service.spec.ts`，memory driver）**：
  - `updateDepartment` 改名 / 改排序 / 设负责人 / 移动父部门成功 → 返回更新后 DTO + 写成功审计（含 changedFields）。
  - 设不存在 / 跨企业的 `managerUserId` → NotFound/400 + 失败审计；设不存在 / 跨企业 `parentId` → 同。
  - **环路**：`parentId = 自身` → 400；`parentId = 自身的子孙` → 400（构造两层部门验证）。
  - 改 / 删不存在或**跨企业**部门 → `NotFoundException`（不泄露存在性）+ 失败审计。
  - **占用删除 409**：部门下有 `status='active'` 人员 → 409；有未软删子部门 → 409；
    **反向（防误拦，memory 可达部分）**：部门下只有 `status='disabled'` 人员、且无未软删子部门 → **删成功**（断言 deleted_at 被置、
    `listDepartments` 不再含它、`findDepartmentById` 返回 undefined）。
    > ⚠️ **"已软删人员不计入"这一反向分支在 memory driver 下不可构造**：内存 `EmployeeDto` 同样不含 `deletedAt`、`createEmployee`
    > 恒置 `status:'active'`，本切片也**不**给员工加软删能力（非本刀范围）。故该分支**改由 Postgres-gated 集成测试覆盖**（见下），
    > memory 单测只覆盖 disabled-不拦 这一可达反向。count 查询 SQL 仍按 `status='active' AND deleted_at IS NULL` 防御性写全。
  - 软删**部门**后 `countActiveEmployeesInDepartment` / `hasActiveChildDepartments` 对该树的统计正确（软删子部门不计入）。
- **内存 store 软删行为单测**：软删一个部门后 `listDepartments` 不含、`findDepartmentById` 返回 undefined；跨企业 id 调用任一方法不命中。
  > **不要**断言 `listDescendantDepartmentIds` 排除软删部门——按 §2.5 该原方法两侧都保持原样（仅 `status='active'`，软删部门 status
  > 仍为 active 故仍会出现在其结果里，这是与 postgres 对齐的预期行为，非 bug）。
- **e2e（in-memory，经 gateway，memory driver，仿既有 `*.e2e-spec.ts` 的 env/login/afterAll close）**：
  - 无 token → 401（走 `PlatformAuthGuard`）；有 token 但无 `platform:org:manage` → 403（`PermissionGuard`）。
  - 建部门 → 改名 → 设负责人 → `GET /departments` 反映变更。
  - 建父子两部门 → 删父（有子）→ 409；删子 → 200，再删父 → 200。
  - 移动成环 → 400。
- **Postgres-gated**：postgres repository 集成测试覆盖 `updateDepartment`/`softDeleteDepartment`/count/hasActiveChild +
  `deleted_at IS NULL` 过滤；**并补 memory 不可达的反向分支**——直接 SQL 造一个 `deleted_at IS NOT NULL` 的员工挂在某部门下，
  断言 `countActiveEmployeesInDepartment` **不计入**它、该部门可删（env-gated；**确认 gate 真跑过**——source-review 判定而非裸 grep，注意"假绿"）。
- **web（`OrganizationPage.spec.tsx`，jsdom，NODE_ENV=test）**：部门树渲染真实数据；无 `platform:org:manage` 不显示写按钮；
  删除命中 409 显示友好提示；还原断言（零 hex / 零 emoji / 文案精确 / 仅 token）。
- **回归**：platform / presence / files / forms / notification 既有单元 + e2e **全绿**；
  特别确认 `listDescendantDepartmentIds` **原方法未被改动**（既有 "stops at disabled nodes" 集成测试 + memory store 同款断言 +
  `resolveDepartmentManager` / `department_tree` scope 解析全部不破）；新增的环路 check 方法是独立方法，不触碰 scope 路径。
- 验收禁止假数据 / 占位蒙混；source-review 判定。

## 5. 退出标准

1. `OrgService.updateDepartment`（改名 / 设负责人 / 改排序 / 移动 + 环路防护 + 引用校验）与 `deleteDepartment`
   （软删 + 占用 409，软删人员/子部门不计入）落地，签名带 `enterpriseId`，审计成功 / 失败均覆盖。
2. `PlatformRepository` 加 4 方法 + 1 个独立的环路 check 方法（共 5 个新方法），**postgres + 内存双实现行为一致**；内存侧软删态被
   list/find/count/hasActiveChild 正确排除（消除与 postgres `deleted_at IS NULL` 的分叉）；**`listDescendantDepartmentIds` 原方法
   一字未动**，环路防护用独立的"非软删、不限 status"新方法（不触碰 `department_tree` scope 语义、不改 baseline）。
3. `UpdateDepartmentInput` / `UpdateDepartmentDto` 落地，`code`/`enterpriseId`/`status` 不可经更新透传；
   `enterpriseId` 全程取自 `request.currentUser`，跨企业不可命中（写语句带 enterprise_id 复核）。
4. 控制器 `@Put(':id')` / `@Delete(':id')` 过 `platform:org:manage`；`OrganizationPage` 成真实部门树 UI（展示两层 + CRUD +
   设负责人 + 409 友好提示 + 写按钮按权限 gate + 还原断言）。
5. **无 DDL 迁移**（确认未新增 .sql / 未动 schema / 未动 db:setup 链）；不新增权限点；不改数据范围模型 / 鉴权规则 /
   auth-scope-audit-token-session；**因此不需改 `security-baseline.md`**（§16 不触发）。
6. `security-reviewer` 独立二审通过（里程碑策略，关注 §0 四点：org:manage gate / 跨企业隔离 / 占用判定 / 环路防护）。
7. 单元 + web + e2e 全绿，`NODE_ENV=test`；Postgres-gated 集成**确认真跑**；`pnpm verify` 全绿。

## 6. 必须保持不变（避免越界）

- 不改数据范围模型 / `profile` scope 语义（写授权是 M8-2a）；部门列表本期**不**按数据范围过滤（RFC §7）。
- 不新发明 department 权限点（复用 `platform:org:view`/`:org:manage`）；不动 auth/scope/audit/rbac/token/session 规则。
- **不写迁移、不加列、不加表、不动 db:setup 链**（本切片纯逻辑 + 既有列）。
- 不碰 employees 档案字段编辑 / `:id`/`me` / 写收口 service / `profile.updated` / status_logs（后续切片）。
- 不碰 presence/files/forms/notification 代码与既有事件 / 调度链路。
- 对外 `DepartmentDto` 形状不变（不加 `deletedAt`，软删是 store 内部态）。
- platform 不被其它模块跨 schema 读写；部门写只在 platform 进程内。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：M8 行 In Progress；M8 切片表标 M8-1 done + 下一步 M8-2a（档案读写后端）。
- `docs/platform-core.md`：新增部门 `PUT /:id` / `DELETE /:id` API、占用删除 409 语义、软删语义。
- `docs/architecture.md`：若需，一句话补"部门管理做满（CRUD + 软删 + 占用保护），核心留 platform"。
- `docs/security-baseline.md`：**本切片不改**（§16 不触发，§0 已判定）；在 verification-log 记此判定 + reviewer 结论。
- `docs/domain-glossary.md`：评估是否补"部门软删 / 占用删除"术语（非强制）。
- `docs/verification-log.md`：追加 `M8-1 Department Management` 锚点（含安全门禁判定、是否跑 security-reviewer、假绿核查结论、
  Postgres-gated 是否真跑）。

## 8. 提交规范

- 代码分支由 Codex 负责（`feat/...`），走 PR；本任务包属纯文档，由规划方提交 main。
- 代码提交 Conventional Commits：`feat(platform): department update/delete with occupancy guard + tree UI`。
- 提交信息说明：① OrgService update/delete + 占用 409 + 环路防护；② repository 双实现对齐（内存软删态修复）；
  ③ `OrganizationPage` 真实部门树；④ 安全门禁判定（repositories 子树→reviewer，但不改规则故不动 baseline）+ 是否跑 reviewer。
- 合并前过 §0 的 security-reviewer；交付前跑完 §4 命令，结论贴进 `docs/verification-log.md`。
  </content>
  </invoke>
