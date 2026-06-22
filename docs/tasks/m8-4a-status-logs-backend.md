# Task: M8-4a 近况记录后端（`platform.status_logs` 新表 + 批量新增 + 按 `profile` 范围读写 + 新增 `platform:status-log:create` 权限点 + 审计；前端人页脉络 UI 留 M8-4b）

## 状态

Ready for execution

## 0. 任务定位

M8 的**第一个真正新建业务表 + 新建权限点 + 批量写授权**的切片，安全敏感度回升（有 DDL 迁移、新权限点、批量写授权落 `repositories`/`migrations` 子树）。
交付近况记录（事件脉络节点：记录人/时间/纯文本内容）的**后端**：

1. **新表 `platform.status_logs`**（RFC §5.2）：DDL 迁移（接 `0003_*`）+ Drizzle schema + repository 双实现（memory + postgres）。
2. **新增近况（批量）** `POST /status-logs`：body 含 `subjectEmployeeIds[]`（批量）+ `content`；展开为多行（每人一条，`author/content/createdAt` 同值）。
   权限 `platform:status-log:create` + **对每个 subject 按 `profile` 写范围逐一校验**（沿用 M8-2a 写授权规则），**全有或全无**（任一 subject 越权/跨企业/不存在 → 整批拒、不落任何行）。
3. **读某人脉络** `GET /employees/:id/status-logs`（分页）：权限 `platform:employee:view` + 目标在 `profile` **读范围**内（`matchScope`），越权/不存在 → 统一 404 不泄露存在性。
4. **新增唯一本期权限点 `platform:status-log:create`**（RFC §9）：进 platform manifest（seed `grantRolePermissions` 自动授予 admin，无需另写授予逻辑）。
5. **审计**：批量新增 → 写审计（actor、subject 列表、content 长度，**不整文落审计**，RFC §14）；失败（越权/不存在）→ 失败审计。
6. **复用既有 scope 谓词**：把 `EmployeeService.matchScope` 提取为 `PlatformScopeService` 的公开纯谓词，读/写授权与 `listEmployees`/档案写**共用同一份**判定（避免第二套范围逻辑漂移）。

> **本切片明确不发任何事件 / 不通知**：给某人**新增近况不通知**本人（RFC §6/§15 明确）。**不为 status_logs 注册任何触发点、不发任何领域事件**，
> 并**保留** `modules/notification/contract/src/events.ts` 里"status/activity-note 不得通知"那条防误加注释（M8-3 已在，勿删）。本切片若发了事件 = 越界。

**本切片不做**（划清边界，留后续切片）：

- **前端人页脉络 UI + 批量人员选择器（复用 M6 forms 人员字段选择器）→ M8-4b**（本切片只交后端两端点供其消费）。
- **撤销 / 编辑近况 → 预留不做**（RFC §20-3 倾向只追加）：`status_logs` 加软删列 `deleted_at` **预留**，本期**只追加**、**不暴露**删除/编辑端点、不进任何写 DTO。
- 人页聚合（固定+自定义+在位+近况）→ **M8-5**；HR 自定义字段 / forms `profile.employee` → **M8-5**。
- 部门 CRUD（M8-1）、档案读写（M8-2a）、首登向导（M8-2b）、`profile.updated`（M8-3）—— 均已交付，本切片复用不改。
- 交付验证门禁（verify:full / docker:build 全量 + 浏览器 smoke + 文档总同步）→ **M8-6**。

> **安全门禁判定（写进任务包供二审 + security-reviewer 复核）**：
>
> - **§16 变更门禁：判定为「不触发新基线编辑」，但须实证确认**。本切片**不改数据范围模型本身**（不增/删 `PlatformDataType`/`PlatformScopeKind`、不改最宽取值算法、不改 `resolveScope` 语义）；
>   近况的批量写授权**沿用 M8-2a 已写入 `security-baseline.md` §5.3 的 profile 写范围规则**（M8-2a §5.3 末句已前瞻写明"近况记录的批量写授权沿用同一 profile 写范围规则，逐 subject 校验——见 M8-4"）。
>   **实施前先打开 `docs/security-baseline.md` §5.3 核对该句确在**：若在 → §16 已被 M8-2a 满足，本切片**无需再改 baseline**；若实际提交文本缺失 → 按 §16 在本切片**同变更补回该句**（code-only 不完整）。新表 + 新权限点属**既有模型内扩展**，非"改规则本身"，不新增 ADR。
> - **security-reviewer：强制**（RFC §13 blanket：M8 落 `repositories`/`migrations` + 触及档案读写范围的切片合并前必过）。reviewer 关注点见 §0 末尾清单。
> - **任务包二审**：独立 general sub-agent（带本节决策真值清单），见记忆 `feedback_independent_subagent_review`。
>
> reviewer 关注点：① 批量写**逐 subject** 按 `profile` 写范围校验、**全有或全无**、无绕过、无部分落库；② 读脉络按 `profile` 读范围、越权/不存在统一 404 不泄露存在性；
> ③ 跨企业隔离（`enterpriseId`/`authorEmployeeId` 取自 `currentUser`，绝不从 body 读）；④ `content` 仅 metadata 记长度不整文落审计；⑤ `deleted_at` 预留列不可经任何端点编辑；
> ⑥ 本切片**确未发任何事件**；⑦ `matchScope` 提取为公开谓词后**读语义零变化**（既有 `listEmployees`/档案写测试仍绿）。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、**统一错误信封**、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m8-people-org-profile.md`（**本切片权威规格**）——重点 **§5.2 status_logs 表结构**（字段/索引/批量展开 + ⚠️ **命名分层**：DB/API 用
   `*_employee_id`/`subjectEmployeeIds`，**唯独 `profile.updated` 事件 payload** 用 `subjectUserId`——本切片是 status_logs，**全程用 `*EmployeeId`**）、
   **§7 status-logs API**（`POST /status-logs` 批量 + `GET /employees/:id/status-logs` 分页 + 权限列 + 归属/范围校验段「越权不泄露存在性、沿用 forms getRecord 404 范式」）、
   **§8 写授权**（近况批量写**逐 subject** 沿用 profile 写范围）、**§9 权限点**（`platform:status-log:create` 唯一本期新增、进 manifest+seed）、
   **§6 事件**（status_logs **不发事件**、注释防误加）、**§13 安全**（强制 reviewer + payload/审计最小披露）、**§14 审计**（近况记 metadata 不整文）、
   **§5.3 迁移与双实现**、**§16 退出标准**第 6 条、**§17 切片计划** M8-4 行、**§19** 第 2 条、**§20** 第 3 条（撤销/编辑→只追加+软删预留）
4. `docs/security-baseline.md` **§5.3 数据范围**（核对 M8-2a 是否已写入"近况批量写沿用 profile 写范围"句，§0 判定）、**§16 变更门禁**、**§7 输入校验**（DTO/白名单/拒未知字段）、**§6 审计基线**
5. `apps/platform-api/CLAUDE.md`（**安全敏感子树**：`scope`/`repositories`/迁移须 reviewer；§16 改规则同变更补 baseline；**两个迁移入口别合并**——`db:migrate` 是 platform 入口；
   **repository driver 默认 postgres**，memory 仅测试/显式 fallback；**Postgres 集成/e2e env-gated 静默跳过 = 可能假绿**）
6. `apps/gateway-api/CLAUDE.md`（两个全局 Guard `PlatformAuthGuard`+`PermissionGuard` 对每条嵌入路由生效；带 `@RequirePermissions` 的端点需对应权限点）
7. `modules/presence/CLAUDE.md`（**显式 `@Inject` gotcha**——新增注入一律显式 `@Inject`，裸类型注入 500）
8. 既有范式代码（**照搬，不要另起炉灶**）：
   - **schema 范式**：[platform.schema.ts](apps/platform-api/src/db/schema/platform.schema.ts)（`platformSchema.table(...)`、`uuid().references()`、`index(...)`、`timestamp(withTimezone)`、软删列 `deletedAt`；
     `employees`/`departments` 表 + `check`/`index` 写法照搬）
   - **迁移范式**：[0002_m8_employee_registration_status.sql](apps/platform-api/src/db/migrations/0002_m8_employee_registration_status.sql)（`ALTER/CREATE ... IF NOT EXISTS`）；
     [0000_init_platform.sql](apps/platform-api/src/db/migrations/0000_init_platform.sql)（`CREATE TABLE platform.* + CREATE INDEX` 范式）；[migrate.ts](apps/platform-api/src/db/migrate.ts)（按文件名 localeCompare 排序跑——新迁移命名 `0003_m8_status_logs.sql`）
   - **repository 接口 + 双实现**：[platform.repository.ts](apps/platform-api/src/repositories/platform.repository.ts)（接口加 `createStatusLogs`/`listStatusLogsBySubject`）；
     [postgres-platform.repository.ts](apps/platform-api/src/repositories/postgres-platform.repository.ts)（批量 INSERT + 分页 SELECT + `WHERE enterprise_id=$ AND subject_employee_id=$ AND deleted_at IS NULL ORDER BY created_at DESC`）；
     [platform-memory.store.ts](apps/platform-api/src/store/platform-memory.store.ts)（内存数组对应实现，**返回深拷贝避免活引用泄漏**——照搬既有 employee 范式）
   - **service + scope + 审计 + 失败审计范式**：[employee.service.ts](apps/platform-api/src/users/employee.service.ts)（`resolveScope(user,'profile')`、`matchScope`、`recordAuditLog` 成功 / `recordFailureAudit` 失败、
     `findEmployeeById` → 比对 enterprise → NotFound 范式；档案写收口 `updateEmployeeProfile` 的范围校验与审计 metadata 形态）
   - **scope 解析 + 谓词提取点**：[platform-scope.service.ts](apps/platform-api/src/scope/platform-scope.service.ts)（`resolveScope` 已可用；本切片把 `matchScope` 提取到此为公开谓词，见 §2.4）
   - **controller 范式**：[employee.controller.ts](apps/platform-api/src/users/employee.controller.ts)（`@Controller('employees')`、类级 `@UseGuards(PlatformAuthGuard, PermissionGuard)`、
     `@RequirePermissions(...)`、`@Body(dtoValidationPipe(Dto))`、`buildPlatformAuditContext(request)`、`request.currentUser!.enterpriseId`/`.id`；`me` 先于 `:id` 的路由顺序教训）
   - **DTO 范式**：[employee.dto.ts](apps/platform-api/src/users/employee.dto.ts)（class-validator、`dtoValidationPipe` 已开 `whitelist`+`forbidNonWhitelisted`）
   - **权限点 manifest**：[platform-module-manifest.ts](apps/platform-api/src/seeds/platform-module-manifest.ts)（`permissions[]` 加一项）；
     [seed-platform.ts](apps/platform-api/src/seeds/seed-platform.ts)（`grantRolePermissions` 把 `platformSeedPermissions` 全量授予 admin——**加进 manifest 即自动授予 admin**，无需改 seed 逻辑）
   - **契约**：[platform-contract/src/index.ts](packages/platform-contract/src/index.ts)（新增 `status-log.ts` + re-export，照 `events.ts`/`users.ts` 范式）
   - **e2e 范式（落点纠正）**：平台端点 e2e 在 **[apps/platform-api/src/platform-api.e2e-spec.ts](apps/platform-api/src/platform-api.e2e-spec.ts)**（员工/档案/`/employees/me`/角色 e2e 全在此，含 `createEmployee`/`login`/建角色赋范围范式、memory driver、`afterAll` close）——**不是** gateway（`apps/gateway-api/src/*.e2e-spec.ts` 只放 presence/notification/files/forms 业务模块 e2e）。`status-logs` 是纯 platform 端点，e2e 落 `platform-api.e2e-spec.ts`；
     platform 集成范式：`apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts`（env-gated）

## 2. 设计要点（严格遵守）

### 2.1 契约：新建 `packages/platform-contract/src/status-log.ts`

```ts
export interface StatusLogDto {
  id: string;
  enterpriseId: string;
  subjectEmployeeId: string; // 近况归属的人（= employee.id）
  authorEmployeeId: string; // 记录人（= 操作者 = currentUser.id）
  content: string; // 纯文本
  createdAt: string; // ISO
}

// 批量新增：一次给多个 subject 加同一条内容
export interface CreateStatusLogsInput {
  subjectEmployeeIds: string[];
  content: string;
}

export interface ListStatusLogsQuery {
  limit?: number;
  offset?: number;
}

export interface ListStatusLogsResult {
  items: StatusLogDto[];
  total: number;
}
```

- **命名**：全程 `*EmployeeId`（与 DB/schema 外键命名一致，RFC §5.2）；**不要**用 `subjectUserId`（那是 `profile.updated` 事件的命名，不同分层）。
- `index.ts` 加 `export * from './status-log';`。
- **`deletedAt` 不进 `StatusLogDto`**（预留软删列，本期无消费者，不提前暴露契约面）。

### 2.2 DTO：`apps/platform-api/src/status-log/status-log.dto.ts`（或就近 `users/`，见 §2.6 落点）

- `CreateStatusLogsDto implements CreateStatusLogsInput`：
  - `subjectEmployeeIds`: `@IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true })` + **`@ArrayMaxSize(100)`（必须，非建议）**——批量无上限是 DoS 面（单请求展开 N 行 + N 次 `findEmployeeById`），定死上限并写进退出标准；**去重**（service 内 `Array.from(new Set(...))`，避免同一人重复落多行）。
  - `content`: `@IsString() @IsNotEmpty()`（**非空**，M8-1 "可清空≠空串"教训）；建议 `@MaxLength(2000)` 之类合理上限。
  - **不收任何其它字段**（`authorEmployeeId`/`enterpriseId`/`createdAt`/`id`/`deletedAt` 均系统侧赋值）；`dtoValidationPipe` 的 `forbidNonWhitelisted` 已兜底，未知字段 → 400。
- 分页 query 校验：`limit`/`offset` 数值化 + clamp（照 notification `list` 的 `clampLimit`/`normalizeOffset` 范式：limit 缺省 20、夹 [1,100]，offset ≥ 0）。

### 2.3 Repository：双实现（接口 + postgres + memory）

接口（`platform.repository.ts`）新增：

```ts
createStatusLogs(inputs: NewStatusLog[]): Promise<StatusLogDto[]>;
listStatusLogsBySubject(
  enterpriseId: string,
  subjectEmployeeId: string,
  options: { limit: number; offset: number },
): Promise<{ items: StatusLogDto[]; total: number }>;
```

- `NewStatusLog` = `{ id, enterpriseId, subjectEmployeeId, authorEmployeeId, content, createdAt }`（service 生成 `id`(randomUUID)/`createdAt`，repository 落库）。
- **postgres**：批量 INSERT（多 VALUES 或逐行同事务）；list `WHERE enterprise_id=$1 AND subject_employee_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $3 OFFSET $4` + 同条件 `COUNT(*)` 出 `total`。
- **memory**（`platform-memory.store.ts`）：内存数组；list 同条件过滤 + 按 `createdAt` desc 排序（ISO 字符串可字典序降序）+ 分页；返回方式**与既有 employee 读保持一致**
  （注：既有 `findEmployeeById`/`listEmployees` 实为返回活引用，**不是**深拷贝——勿凭"深拷贝范式"误改既有 employee 读；status_logs 追加式、读返回 DTO 数组即可，按既有风格走）。
- 二者对外行为一致（字段、排序、分页、`deleted_at IS NULL` 软删过滤）。

### 2.4 复用 scope 谓词：把 `matchScope` 提取到 `PlatformScopeService`（公开纯谓词）

> M8-2a 把 `matchScope` 写成了 `EmployeeService` 的**私有**方法；近况读/写授权要用同一份判定。**提取为单一权威谓词**，避免第二套范围逻辑漂移（reviewer 会盯这一点）。

- 在 `PlatformScopeService` 加公开方法（纯函数、无副作用）：
  ```ts
  matchesScope(employee: EmployeeDto, scope: PlatformScope): boolean
  ```
  逻辑与现 `EmployeeService.matchScope` **逐字一致**（enterprise 比对 + company/self/department/department_tree 分支）。`PlatformScope` 含 `enterpriseId/kind/userId/departmentIds`、`EmployeeDto` 含 `enterpriseId/id/departmentId`，纯谓词搬家可行。
- `EmployeeService.matchScope` **改为委托** `this.scopeService.matchesScope(...)`。当前 `employee.service.ts` 有 **3 处调用** `matchScope`（`getEmployeeById` L38、`getMyProfile` 邻近读 L50 一带、`updateEmployeeProfile('management')` L100 一带）+ 私有定义 L64——**全部改走 scopeService**；实施前 `grep matchScope` 确认无遗漏调用点、确认 `org`/`employee-lookup` 无同名第二份谓词。
- ⚠️ **「行为零变化」≠「既有测试不动」**：`employee.service.spec.ts` 的 `makeScopeService` 目前**只 mock 了 `resolveScope`**（无 `matchesScope`），且用 `new EmployeeService(...)` 直接构造注入该 mock。一旦委托，凡走 `getEmployeeById`/`updateEmployeeProfile('management')` 的既有用例会在运行时抛 `matchesScope is not a function` **全红**。**本切片必须同步更新** `employee.service.spec.ts`：给 `makeScopeService` 补 `matchesScope` 实现（或这些用例改注入真实 `PlatformScopeService`）。这是退出标准项，不是"测试不动"。
- 近况 service 读/写授权都调 `scopeService.matchesScope(targetEmployee, resolveScope(user,'profile'))`。
- **判定纯函数，无 ADR**（不改模型、不改取值算法）；运行时**业务行为**不变（同一判定逻辑），但因落 `src/scope` 子树 + 改既有 spec → 走 reviewer。

### 2.5 StatusLogService（命门：批量写授权 + 读范围）

新建 `StatusLogService`，注入 `@Inject(PLATFORM_REPOSITORY) repository` + `@Inject(PlatformScopeService) scopeService`（显式 `@Inject`）。

**写：`createStatusLogs(input, currentUser, auditContext)`**（**全有或全无**）：

1. `subjectIds = Array.from(new Set(input.subjectEmployeeIds))`（去重）。
2. `scope = await scopeService.resolveScope(currentUser, 'profile')`。
3. **逐 subject 校验（先全部校验，再落库）**：对每个 `subjectId`：`emp = await repository.findEmployeeById(subjectId)`；
   `if (!emp || emp.enterpriseId !== currentUser.enterpriseId || !scopeService.matchesScope(emp, scope))` →
   **失败审计 + `NotFoundException('员工不存在')`**（**任一失败即整批拒、不落任何行**）。
   失败审计 `resourceId` **置空**、`metadata:{ subjectCount: subjectIds.length, reason:'request_rejected' }`——**不记触发失败的具体 subjectId**（与"不泄露哪个 subject 越权/不存在"自洽，防枚举）。
4. 全部通过 → 构造 `NewStatusLog[]`（每 subject 一行，`id=randomUUID()`、`authorEmployeeId=currentUser.id`、`enterpriseId=currentUser.enterpriseId`、`content`、`createdAt=now`），调 `repository.createStatusLogs(...)`；**postgres INSERT 显式带 service 生成的 `id`**（DDL 虽有 `DEFAULT gen_random_uuid()`，但显式传值保证返回 DTO 的 id 与库一致，照既有 `createEmployee` 范式）。
5. **成功审计**：`action:'platform.status-log.create'`、`resourceType:'platform.status-log'`（点分，对齐既有 `platform.employee` 风格，**勿用下划线 `status_log`**——那是 schema 名）、`resourceId` 置空（批量无单一资源）、
   `metadata:{ subjectEmployeeIds: subjectIds, subjectCount: subjectIds.length, contentLength: content.length }`（**不落 content 明文**，RFC §14 最小披露）。
6. **不发任何事件**（§0 边界）。返回创建的 `StatusLogDto[]`。

> ⚠️ **原子性**：postgres 侧批量 INSERT 应在**单事务/单语句**内，避免"前几个 subject 落了、后面失败"留下半批。memory 侧本就同步，校验全过后再 push。
> ⚠️ **enterprise/author 永远取自 `currentUser`**，绝不从 body/param 读。

**读：`listStatusLogs(subjectId, query, currentUser)`**（供 `GET /employees/:id/status-logs`）：

1. `subject = await repository.findEmployeeById(subjectId)`；`scope = resolveScope(currentUser,'profile')`。
2. `if (!subject || subject.enterpriseId !== currentUser.enterpriseId || !scopeService.matchesScope(subject, scope))` → `NotFoundException('员工不存在')`（越权/不存在统一 404，**读不写失败审计**，与 `getEmployeeById` 一致）。
   > **本期接受行为**：`findEmployeeById` 带 `deleted_at IS NULL`，故 subject 被软删后其历史脉络按"不存在"处理（404）。本切片不做"已离职员工历史近况只读归档"，写进退出标准免 reviewer 反复质疑（FK 指向 PK，软删不删行，不阻塞）。
3. `return repository.listStatusLogsBySubject(currentUser.enterpriseId, subjectId, { limit, offset })`。

### 2.6 控制器与落点

- **GET 端点放既有 `EmployeeController`**（员工脉络读，员工范围语义，复用 `platform:employee:view`）：
  ```ts
  @Get(':id/status-logs')
  @RequirePermissions('platform:employee:view')
  listStatusLogs(@Param('id') id, @Query(...) query, @Req() request) {
    return this.statusLogService.listStatusLogs(id, query, request.currentUser!);
  }
  ```
  > 路由顺序：`:id/status-logs` 是 `:id` 的更具体子路径，与既有 `@Get('me')`/`@Get(':id')`/`@Put(':id/profile')` 不冲突（Nest 按段匹配）；仍确保 `me` 字面量在 `:id` 之前（M8-2a 已就位，勿打乱）。
- **POST 端点放新建 `StatusLogController`**（`@Controller('status-logs')` → `/api/platform/status-logs`，类级 `@UseGuards(PlatformAuthGuard, PermissionGuard)`）：
  ```ts
  @Post()
  @RequirePermissions('platform:status-log:create')
  create(@Body(dtoValidationPipe(CreateStatusLogsDto)) input, @Req() request) {
    return this.statusLogService.createStatusLogs(input, request.currentUser!, buildPlatformAuditContext(request));
  }
  ```
- `StatusLogService` + `StatusLogController` 进 `PlatformModule` 的 `providers`/`controllers`；`EmployeeController` 构造器加 `@Inject(StatusLogService)`。
- 新建目录 `apps/platform-api/src/status-log/`（`status-log.service.ts` / `status-log.controller.ts` / `status-log.dto.ts` / `*.spec.ts`）。

### 2.7 权限点（manifest 增补，唯一本期新增）

- `platform-module-manifest.ts` 的 `permissions[]` 加：
  `{ code: 'platform:status-log:create', name: '新增近况记录', moduleName: 'platform' }`。
- **不新增菜单**（近况录入入口在人页/员工页内，UI 属 M8-4b；本切片不加 menu）。
- seed `grantRolePermissions` 已把 `platformSeedPermissions` 全量授予 admin → **加进 manifest 即自动授予 admin**，无需改 seed 逻辑；e2e 用 admin 即可拿到该权限（验证"无该权限的用户 POST → 403"须现搭一个不含该权限的角色/用户，见 §4.2）。

### 2.8 `status_logs` 表（schema + 迁移）

**迁移** `apps/platform-api/src/db/migrations/0003_m8_status_logs.sql`（platform 入口 `db:migrate`，不动 presence/files/forms/notification 入口）：

```sql
CREATE TABLE IF NOT EXISTS platform.status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES platform.enterprises(id),
  subject_employee_id uuid NOT NULL REFERENCES platform.employees(id),
  author_employee_id uuid NOT NULL REFERENCES platform.employees(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS status_logs_subject_idx
  ON platform.status_logs (enterprise_id, subject_employee_id, created_at DESC);
```

- **Drizzle schema** 同步（`platform.schema.ts` 加 `statusLogs` 表 + 索引）。**照 `0002` 范式：本仓库以纯手写 SQL 迁移为准**，`0000`/`0001`/`0002` 均无 drizzle-kit snapshot/journal 产物；`pnpm db:generate` 仅本地**校验** schema 与手写 SQL 一致，**产物（journal/snapshot meta）一律不提交、不让其覆盖既有命名约定**。
- `deleted_at` = **预留软删列**：本期**只追加**，无删除/编辑端点；list 查询 `deleted_at IS NULL` 过滤（为未来撤销留好）；**不进 DTO、不进写 DTO、不可经任何端点编辑**（RFC §20-3）。
- **双实现**：memory store 加 `statusLogs` 数组对应实现（无 DB 概念，逻辑一致）。

### 2.9 跨企业隔离（安全命门）

- `enterpriseId`/`authorEmployeeId` **永远**取自 `request.currentUser`，**绝不**从 body/param 读。
- 写：逐 subject `matchesScope` 首行已比对 `employee.enterpriseId !== scope.enterpriseId`；list 查询带 `enterprise_id=currentUser.enterpriseId`。
- subject/author 外键引用同企业 employees（DDL 外键 + 校验双保险）。

## 3. 模块结构增量

### `packages/platform-contract`

- 新增 `src/status-log.ts`（§2.1）；`src/index.ts` 加 `export * from './status-log';`。

### `apps/platform-api`

- `src/db/migrations/0003_m8_status_logs.sql`：新表 + 索引（§2.8）。
- `src/db/schema/platform.schema.ts`：`statusLogs` 表 + 索引（§2.8）。
- `src/repositories/platform.repository.ts`：接口加 `createStatusLogs`/`listStatusLogsBySubject` + `NewStatusLog` 类型（§2.3）。
- `src/repositories/postgres-platform.repository.ts` + `src/store/platform-memory.store.ts`：双实现（§2.3）。
- `src/scope/platform-scope.service.ts`：新增公开 `matchesScope`（§2.4）；`platform-scope.service.spec.ts` 补谓词单测。
- `src/users/employee.service.ts`：`matchScope`（3 处调用 + 私有定义）改为委托 `scopeService.matchesScope`（§2.4，业务行为零变化）。
- `src/users/employee.service.spec.ts`：`makeScopeService` 补 `matchesScope`（否则委托后既有用例全红，§2.4）。
- `src/status-log/`：`status-log.service.ts` / `status-log.controller.ts` / `status-log.dto.ts` + `*.spec.ts`（§2.2/§2.5/§2.6）。
- `src/users/employee.controller.ts`：加 `@Get(':id/status-logs')`（§2.6）+ 构造器注入 `StatusLogService`。
- `src/seeds/platform-module-manifest.ts`：`permissions[]` 加 `platform:status-log:create`（§2.7）。
- `src/platform.module.ts`：`providers` 加 `StatusLogService`、`controllers` 加 `StatusLogController`。
- 单元 / e2e / Postgres-gated 集成测试（§4.2）。

### `docs`

- 见 §7（platform-core / domain-glossary / foundation-progress / verification-log；security-baseline 仅按 §0 判定核对，通常不改）。

> 不动 auth/rbac/token/session 规则；不动 presence/files/forms/notification；不碰 M8 其它切片成果；不发任何事件；不动数据范围模型本身。

## 4. 验证

### 4.1 命令（全过）

```bash
pnpm install                    # 若 contract 改动触发，无新依赖
NODE_ENV=test pnpm lint && NODE_ENV=test pnpm typecheck
NODE_ENV=test pnpm test         # 单元 + web（务必 NODE_ENV=test，见记忆）
NODE_ENV=test pnpm test:e2e     # in-memory e2e
NODE_ENV=test pnpm build
# 有本地 / CI Postgres 时（验证迁移 + 双实现真跑，别假绿）：
pnpm db:generate                # 确认 drizzle 与手写迁移一致（不产生意外 diff、不提交快照 meta）
pnpm verify:full                # 含 test:db + test:e2e:postgres（env gate 见 root CLAUDE.md）
```

> 本切片**有迁移但不改部署形态**（不加/删 app、不改 compose/Dockerfile、db:setup 链顺序不变——新表并入既有 platform 迁移）；
> `pnpm docker:build` 非必跑（留 M8-6）。**务必确认 Postgres-gated 真跑过**（env gate；source-review 判定而非裸 grep），否则迁移/新表/索引假绿。

### 4.2 断言（必须覆盖）

- **StatusLogService 单元（`status-log.service.spec.ts`，memory driver）**：
  - **批量写成功**：company 范围 → 给多个 subject 加同一 content → 每人一行、`authorEmployeeId=currentUser.id`、`enterpriseId` 正确、`createdAt` 有值；成功审计 `metadata.subjectCount`/`subjectEmployeeIds`/`contentLength`，**审计不含 content 明文**。
  - **去重**：`subjectEmployeeIds` 含重复 id → 落库去重后每人仅一行。
  - **逐 subject 写授权 + 全有或全无**：department 范围 → 全部 subject 在本部门 → 成功；**其中一个 subject 在范围外 → 整批 `NotFoundException`、`createStatusLogs` 未被调用（0 行落库）** + 失败审计。
  - **跨企业 subject → 整批拒（单元层验证）**：mock repository 的 `findEmployeeById` 对某 subject 返回**他企业** employee（`enterpriseId !== currentUser.enterpriseId`）→ 整批 `NotFoundException`、0 行落库。
    （⚠️ 此场景**只能在单元层**构造：memory e2e 只有单一 `ent-default` 企业、`POST /employees` 拒绝指定他企业 `enterpriseId`，无法在 e2e 造出第二企业 subject——别放进 e2e 清单假绿。）
  - **self 范围**：只能给自己加（subject=自己成功；含他人 → 整批拒）。
  - **content 非空**：空串/空白经 DTO 400（DTO 层）；service 不被绕过落空内容。
  - **不发事件**：service **无 eventBus 依赖**（构造器不注入）；写成功无任何事件副作用。
  - **读脉络**：company → 任意同企业 subject 可读其脉络（按 createdAt desc + 分页）；department → 范围内可读、范围外 subject → `NotFoundException`；跨企业 subject → NotFound；self → 仅自己。读不写失败审计。
  - **分页**：limit 缺省/夹紧、offset 生效、total 正确。
- **e2e（in-memory，落 [apps/platform-api/src/platform-api.e2e-spec.ts](apps/platform-api/src/platform-api.e2e-spec.ts)——纯 platform 端点不在 gateway，§1.8）**：复用该文件既有 `createEmployee`/`login` + 建角色赋范围范式。
  > **fixture 提示**：memory seed 仅 admin（company scope + 全权限，含新权限点，单一 `ent-default` 企业）。"无 `platform:status-log:create` 的用户""部门范围用户"须 admin 现搭（建员工 + 建带特定范围/权限的角色 + `PUT /:id/roles`）后登录拿 token；role-less 用户 `resolveScope` 降级 self。别误以为 seed 有多角色用户。**跨企业场景 e2e 造不出（见单元清单）**。
  - 无 token → 401；admin `POST /status-logs`（多 subject）→ 201/200，逐人 `GET /employees/:id/status-logs` 见到该条。
  - **批量给多人**：一次 `POST` 多个 subject → 每个 subject 的脉络各出现一条同 content。
  - **无权限 403**：不含 `platform:status-log:create` 的用户 `POST /status-logs` → 403（PermissionGuard）。
  - **越权写 404（同企业部门范围）**：部门范围用户给**范围外但同企业**的 subject 加近况 → 404，且**对方脉络无新增**（全有或全无，双向断言防假绿）。
  - **越权读 404**：部门范围用户 `GET /employees/:rangeOutId/status-logs` → 404（不泄露存在性）。
  - **content 非空**：`POST` 空 content → 400；**超 100 个 subject → 400**（`@ArrayMaxSize`）。
- **Postgres-gated（集成）**：`status_logs` 表存在、外键/索引就位；批量 INSERT 后 list 按 `created_at DESC` + `deleted_at IS NULL` 返回；手动置一行 `deleted_at` → list 不返回（预留软删生效）；**确认 gate 真跑**。
- **回归**：platform / presence / files / forms / notification 既有单元 + e2e **全绿**；`listEmployees`/档案写既有 scope 过滤行为不变（`matchScope` 提取后读语义零变化，既有 `employee.service.spec.ts` 全绿）；`auth`/`rbac` 不受影响。
- **web**：本切片**无前端**（人页脉络 UI=M8-4b）；不新增 `*.spec.tsx`。
- 验收禁止假数据/占位蒙混；source-review 判定。

## 5. 退出标准

1. `platform.status_logs` 新表（DDL 迁移 `0003` + Drizzle schema + 双实现）落地，索引 `(enterprise_id, subject_employee_id, created_at desc)` 就位，`deleted_at` 预留软删列不可编辑。
2. `POST /status-logs`（批量、`platform:status-log:create`、逐 subject `profile` 写范围校验、**全有或全无**、去重）+ `GET /employees/:id/status-logs`（分页、`platform:employee:view` + `profile` 读范围、越权 404）落地。
3. 批量写授权**逐 subject** 沿用 M8-2a profile 写范围规则；越权/跨企业/不存在 → 整批拒、不落任何行、不泄露存在性。
4. 新增唯一权限点 `platform:status-log:create` 进 platform manifest（admin 经既有 `grantRolePermissions` 自动获授）。
5. `matchScope` 提取为 `PlatformScopeService.matchesScope` 公开谓词，读/写授权与 `listEmployees`/档案写共用一份；业务行为零变化，且**同步更新 `employee.service.spec.ts` 的 `makeScopeService` 补 `matchesScope`** 后既有测试全绿（不是"测试不动"）。
6. 审计覆盖批量近况写（成功/失败，metadata 含 subject 列表 + content 长度，**不整文**）；读不写失败审计。
7. **不发任何事件 / 不注册触发点**（status_logs 不通知本人），notification-contract 防误加注释保留。
8. **§16 判定落实**：核对 `security-baseline.md` §5.3 已含"近况批量写沿用 profile 写范围"（M8-2a 写入）→ 本切片不改 baseline；若缺则同变更补回。新表+新权限点非"改规则本身"，无 ADR。
9. `security-reviewer` 独立二审通过（§0 七关注点）。
10. 单元 + e2e 全绿，`NODE_ENV=test`；迁移 + 双实现一致；Postgres-gated **确认真跑**（表/索引/软删过滤）；`pnpm verify` 全绿；`pnpm db:generate` 无意外 diff。

## 6. 必须保持不变（避免越界）

- **不发任何事件**（status_logs 不通知本人，RFC §6/§15）；`StatusLogService` 不注入 eventBus。
- **不做前端**（人页脉络 UI / 人员选择器 = M8-4b）；不做撤销/编辑（只追加 + `deleted_at` 预留）；不碰人页聚合 / forms 自定义字段（M8-5）。
- **不改数据范围模型本身**：不增/删 `PlatformDataType`/`PlatformScopeKind`、不改最宽取值算法、不改 `resolveScope` 语义；`matchesScope` 提取为**纯谓词搬家**，逻辑逐字不变。
- 不新发明除 `platform:status-log:create` 外的权限点；不改 auth/rbac/token/session；不动 presence/files/forms/notification 代码与事件链路。
- `deleted_at` 不进任何 DTO/响应/写端点；近况 content 不整文落审计。
- platform 不被其它模块跨 schema 读写；近况读写只在 platform 进程内、只经 `StatusLogService`。

## 7. 完成后更新文档

- `docs/security-baseline.md`：**通常不改**——仅按 §0 核对 §5.3 已含近况批量写授权句（M8-2a 写入）；若实际缺失才同变更补回（§16 原子性）。
- `docs/foundation-progress.md`：M8 行 In Progress；M8 切片表标 M8-4a done + 下一步 M8-4b（人页脉络 UI）/ M8-5。
- `docs/platform-core.md`：新增 `POST /status-logs`、`GET /employees/:id/status-logs` API + `platform:status-log:create` 权限点 + `status_logs` 表/近况批量写授权语义。
- `docs/domain-glossary.md`：补"近况记录（status_logs，追加式事件脉络）"、"近况批量写授权（逐 subject profile 写范围）"术语。
- `docs/doc-index.md` §7：catalog 增 M8-4a 任务包行。
- `docs/architecture.md`：若需，一句话补"近况记录归 `platform.status_logs`，权限随 profile 范围，不发事件、前端聚合人页"。
- `docs/verification-log.md`：追加 `M8-4a Status Logs Backend` 锚点（含 §16 判定（核对 §5.3 结论）+ reviewer 结论 + Postgres-gated 是否真跑 + 批量写全有或全无 / 越权 404 双向断言结果 + 假绿核查 + 真实全门禁数字）。

## 8. 提交规范

- 代码分支由 Codex 负责（`feat/...`），走 PR；本任务包属纯文档，由规划方提交 main。
- 代码提交 Conventional Commits：`feat(platform): status logs with batch per-subject profile write authorization`。
- 提交信息说明：① `status_logs` 新表 + 双实现 + `0003` 迁移；② `POST /status-logs` 批量逐 subject 写授权（全有或全无）+ `GET /employees/:id/status-logs` 分页读范围；
  ③ 新增 `platform:status-log:create` 权限点；④ `matchScope` 提取为 scope service 公开谓词（行为零变化）；⑤ 不发事件；⑥ §16 判定（核对 §5.3，通常不改 baseline）+ security-reviewer 结论。
- 合并前过 §0 的 security-reviewer；交付前跑完 §4 命令，结论贴进 `docs/verification-log.md`。
