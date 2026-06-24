# Task: M8-5a 人页聚合数据后端使能（forms `profile.employee` 记录按 subject 读/写 + presence 按人在位 + `PlatformScopePort` 暴露 `matchesScope` 谓词；均按数据范围授权；档案照片下载延后）

## 状态

Ready for execution（独立 general sub-agent 二审已完成并修订：2 Blocking + 6 Major + 4 Minor 全部采纳）。
关键修订：B1 `matchesScope` 端口签名改 `(subject, scope)` 与既有实现同序、**零改调用点**（原稿 `(scope, subject)` + "适配重载" 是错的，已删）；
B2 forms service/controller 透传 `CurrentUserDto` 的类型与链路写死；M2 presence 按人读**沿用既有 board 快照下推授权**（不引实时部门/不新增 employeeLookup，快照陈旧另记 §7 follow-up）；
M3 seed **已实证 admin 开箱可端到端**（不改 seed）；M5 forms 新 controller 对齐 presence 范式（只 `@RequirePermissions`、不 `@UseGuards`）；
M4 数据门范式取自 employee/status-log service（非照搬 `getRecord`）；M6 含点 slotKey 路由须 e2e 实测命中。二审总评：**改完可执行**。

## 0. 任务定位（含 RFC 前提勘误 —— 必读）

M8-5（人页聚合）按 RFC §17 的设定是"**前端聚合 + 联调**，依赖只有『M6 已交付 + M8-2』"。
**规划期核查发现该设定的三处前提不成立**——人页要聚合的四类数据里有三类没有可消费的 HTTP 接缝，
因此 M8-5 被拆为 **M8-5a（后端使能，本切片）** + **M8-5b（人页 + 填报 UI，后续切片）**。本切片**纯后端**，
补齐 5b 人页聚合所需的两个读端点 + 一个写端点 + 一处共享授权谓词。

### 0.1 三处前提勘误（实证，附文件/行）

| 人页分区   | 数据源                             | RFC §10 假定                        | 实际现状（已核）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 本切片处理                                                             |
| ---------- | ---------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 固定字段   | `GET /employees/:id`               | 已交付                              | ✅ M8-2a 已交付，本切片不动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                      |
| 近况脉络   | `GET /employees/:id/status-logs`   | 已交付                              | ✅ M8-4 已交付，本切片不动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                      |
| 自定义字段 | forms `profile.employee` 记录      | "shell 调 forms 记录 API getRecord" | ❌ `forms/api` controller 只有 `forms/definitions/:slotKey`（GET/PUT）+ `forms/health`；**记录的读、写 HTTP 端点都不存在**。`FormsService.getRecord(actor, recordId)` 仅按 **recordId** 取且无 controller 暴露；`createRecord` 同样无 controller。记录数据模型按 `(enterprise_id, slot_key, subject_type, subject_id)` 建好（`forms.form_records`，singleton 唯一索引 `0001_singleton_record_unique.sql`），但**无"按 subject 取"的 repo 方法**。授权是一刀切 `forms:record:view/submit`，**不查 profile 数据范围**。 | **本切片补：forms 记录按 subject 读 + upsert 写，按 profile 范围授权** |
| 在位状态   | presence                           | "调 presence API"                   | ❌ presence controller 只有 `presence/board`（`presence:board:view` + presence 范围）与 `presence/status-records`（`mine`/POST/DELETE）；**无"按 employeeId 取在位"端点**。`PresenceStatusService` 已注入 `PLATFORM_SCOPE_SERVICE` 并用 `resolveScope(user,'presence')`（有范式）。                                                                                                                                                                                                                                   | **本切片补：presence 按 employeeId 取当前在位，按 presence 范围授权**  |
| 档案照片   | files（forms image 字段值=fileId） | files + forms 文件字段              | ❌ `files/api` 只有 `POST files`（上传）+ `GET files/:id`（**元数据**，`files:object:view:own` **仅本人**）；**无二进制内容下载端点、无跨人查看授权**。                                                                                                                                                                                                                                                                                                                                                               | **本切片不做**（决策见 §0.3，延后单独切片）                            |

### 0.2 授权单源问题（本切片的安全核心）

forms 记录读/写、presence 按人在位都要回答同一个问题：**"当前用户能不能看/改 subject 这个员工？"**——
这正是 platform 的 `profile`/`presence` 数据范围判定。范围解析 `PlatformScopePort.resolveScope` 已端口化、
forms/presence 都能注入；**但范围匹配谓词 `matchesScope` 只活在 `apps/platform-api/src/scope/platform-scope.service.ts:68`，
其它模块无法 import（跨 `apps`→`module` 依赖被 Nx 拦）**。若 forms/presence 各自重写一份匹配逻辑 = **第二/第三套数据范围判定，
必然漂移成越权漏洞**。

→ **本切片把 `matchesScope` 提升为 `PlatformScopePort` 的公开谓词**（platform-contract 接口 + platform-api 实现），
**forms 与 platform 自身共用同一份判定**（杜绝 forms 自写第二套）。这是**数据范围模型表面的扩展**（把既有内部谓词暴露成跨模块端口契约），
按 RFC §13/§16 属安全敏感面，**强制 security-reviewer**，并按 §16 评估是否补 `security-baseline.md`（见 §4）。

> 注：**presence 不消费该谓词**——其按人读端点沿用既有 `getBoard` 的"按 record 部门下推查询"授权口径以保持 presence 内部一致（取舍详见 §2.4）；
> 故谓词的跨模块消费者本切片只有 forms。

### 0.3 已拍板的边界决策（规划期 AskUserQuestion）

1. **M8-5 拆 5a 后端 + 5b 人页 UI**（用户选定）：本切片只交后端端点 + 谓词，**不写任何前端/人页/填报 UI**（→ M8-5b）。
2. **档案照片下载延后**（用户选定）：跨人看照片需新建 files **二进制内容流端点** + 一套跨人授权链（file→forms 附件→record subject→profile 范围），
   授权模型尚未定、跨三模块耦合、风险最高。**本切片完全不碰 files**；人页（5b）先把照片位留占位。**留作独立切片 M8-5-照片**。
3. **联调含读+写**：RFC §10 只点了"读 getRecord"，但 forms 记录**写端点同样不存在**——没有写，HR 无从给员工**填**自定义字段值，
   人页永远空、"HR 自定义字段联调"无法端到端演示。写与读**共用同一套 profile 范围授权设计**，分两片落会让 forms 授权面被 reviewer 审两遍。
   故**读 + upsert 写同片交付**。（此为规划者判断，非用户逐条点过——二审/PR 评审若反对可回退为只读。）

### 0.4 本切片明确不做（划清边界）

- **任何前端**（人页聚合 / HR 填报 UI / 字段配置 UI / 像素级还原）→ **M8-5b**（走还原度门禁）。本切片零 `*.spec.tsx`、零 `web` 改动。
- **档案照片 / files 任何改动** → 延后独立切片（§0.3-2）。本切片不动 `modules/files`。
- **forms 记录的删除 / 历史版本 / append 槽位（report.\*）** → 不做。本切片只碰 `profile.employee`（singleton）的读 + upsert。
- **presence 写/取消/board** → 不动（已交付）。本切片只加一个按人读端点。
- **部门 CRUD（M8-1）/ 档案读写（M8-2a）/ 首登（M8-2b）/ `profile.updated`（M8-3）/ 近况（M8-4）** → 已交付，复用不改。
- **交付验证门禁（verify:full / docker:build 全量 + 浏览器 smoke + 文档总同步）** → **M8-6**。

### 0.5 安全门禁判定（写进任务包供二审 + security-reviewer 复核）

- **`matchesScope` 暴露为端口谓词 = 数据范围模型表面扩展**：不改最宽取值算法、不改 `resolveScope` 语义、不增删 `PlatformDataType`/`PlatformScopeKind`，
  仅把既有内部纯谓词暴露成 `PlatformScopePort` 契约方法。**按 §16：判定为"既有模型内扩展、非改规则本身"，但因把范围判定跨进程契约化、且首次供他模块做授权**，
  **强制 security-reviewer**；reviewer 须确认"暴露后 platform 自身读语义零变化"（既有 `listEmployees`/档案写/status-logs 测试仍绿）。是否补 `security-baseline.md` §5 一句"profile/presence 范围谓词经 `PlatformScopePort` 供 forms/presence 跨模块授权"由 reviewer 定（倾向补一句，code-only 可能不完整）。
- **forms 记录读/写首次按 profile 范围授权**：现状 forms 记录授权只有一刀切功能权限；本切片叠加 profile 数据范围作为**数据门**。属把 M8-2a 已立的 profile 读/写范围规则**应用到 forms 消费侧**，非新范围模型。reviewer 须确认越权统一 404 不泄露存在性、`enterpriseId` 恒取自 `currentUser`。
- **presence 按人读**：复用既有 presence 范围，属既有模型内扩展。reviewer 关注越权返回 null/空不泄露存在性。
- **security-reviewer：强制**（RFC §13 blanket + 本切片触及三模块授权面）。
- **任务包二审**：独立 general sub-agent（带本节决策真值清单），见记忆 `feedback_independent_subagent_review`。

> reviewer 关注点清单：① `matchesScope` 暴露后 platform 自身行为零变化（回归绿）；② forms 记录读/写**先功能权限再 profile 范围**双门，越权/不存在/跨企业统一 404 不泄露；
> ③ forms 写为 **upsert singleton**：`definitionRevision` 乐观校验、`enterpriseId`/`submittedBy` 恒取 `currentUser`、subjectId 来自路径且经范围校验，不得从 body 读身份；
> ④ presence 按人读越权或无记录**同样返回空/null**（不区分"无权"与"无记录"，防枚举）；⑤ 三端点 `enterpriseId` 全取自 `currentUser`；
> ⑥ 审计覆盖 forms 记录写（actor/subject/slotKey/revision，不整文落值）；⑦ 无任何 `web`/`files`/照片改动；⑧ forms/presence **新增注入一律显式 `@Inject`**（见 §1-7 gotcha）。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界：**module 只依赖自身 contract + `packages/*` + `platform-sdk`，不得依赖他 module**；**统一错误信封**；提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则（架构/权限/数据范围/schema 变更需文档审查）
3. `docs/rfc/m8-people-org-profile.md`（**本切片上位规格**）——重点：
   - **§4.3 自定义字段消费 M6 forms、聚合在前端**（"shell 分别调 platform 档案 API + forms 记录 API，不做后端跨进程编排"——本切片只交 forms/presence 各自端点，**不在 platform 里编排聚合**）
   - **§10 优雅降级**（forms `getRecord` 缺权限/无记录返 404 防枚举；人页须容忍"固定字段有、自定义字段 404"——本切片读端点须落实此 404 语义）
   - **§7 归属/范围校验段**（"以 `resolveScope(user,'profile')` 为准；越权返回统一错误信封不泄露存在性，沿用 forms `getRecord` 404 范式"）
   - **§8 数据范围与写收口**（profile 读=过滤、写=授权门；本切片把同规则用到 forms 记录读/写）
   - **§13 安全**（M8 强制 reviewer；最小披露）、**§16 退出标准**第 7 条（"HR 自定义字段经 forms 槽位可配可填，前端人页聚合"——本切片交"可填/可读"的后端半边）、**§17 切片计划** M8-5 行
4. `docs/security-baseline.md` **§5 数据范围**（profile 读/写范围规则，§4 判定基准）、**§16 变更门禁**、**§7 输入校验**（DTO 白名单/拒未知字段）、**§6 审计基线**
5. `apps/platform-api/CLAUDE.md`（**安全敏感子树** `scope`/`repositories`/迁移须 reviewer；§16 改规则同变更补 baseline；repository driver 默认 postgres）
6. `apps/gateway-api/CLAUDE.md`（两个全局 Guard `PlatformAuthGuard`+`PermissionGuard` 对每条嵌入路由生效；forms/presence 路由经 gateway 装配，带 `@RequirePermissions` 的端点需对应权限点已 seed）
7. `modules/presence/CLAUDE.md` + `modules/forms` 同款（**显式 `@Inject` gotcha**——esbuild 不发 `emitDecoratorMetadata`，新增构造注入一律显式 `@Inject(TOKEN)`，裸类型注入运行时 `undefined` → 500）
8. `packages/CLAUDE.md`（`packages/*` 单向依赖：package 不可依赖 module，module→package 合法——forms/presence-api 依赖 `@work/platform-contract` 是合法 module→package）
9. 既有范式代码（**照搬，不要另起炉灶**）：
   - **scope 解析 + 谓词**：[platform-scope.service.ts](apps/platform-api/src/scope/platform-scope.service.ts)（`resolveScope` 已可用；`matchesScope(employee, scope):boolean` 在 L68——本切片把它暴露到 `PlatformScopePort`，见 §2.1）
   - **scope 谓词消费范式**：[employee.service.ts](apps/platform-api/src/users/employee.service.ts)（`resolveScope(user,'profile')` → `matchesScope` → 越权 NotFound）；[status-log.service.ts](apps/platform-api/src/status-log/status-log.service.ts)（同款读/写范围校验 + 失败审计）
   - **presence 范围消费范式**：[presence-status.service.ts](modules/presence/api/src/status/presence-status.service.ts)（`getBoard` 里 `resolveScope(user,'presence')` 按 `scope.kind` 分支——本切片按人读复用此谓词）
   - **forms 记录服务范式**：[forms.service.ts](modules/forms/api/src/forms/forms.service.ts)（`createRecord`/`validateRecordValues`/`requirePermission`→404、`assertActiveSlot`、审计 `forms.record.create`、文件附件 `attachFiles`——本切片读/upsert 的**功能门 + 校验 + 落库**照此扩展）。
     **⚠️ 数据门（profile 范围 404）不在 forms 现有代码里**：既有 `getRecord(actor, recordId)`（L220）只做功能权限 + recordId 查不到 404，**不查 profile 数据范围**（§0.1 已述）。本切片新增的 profile 范围细门是**全新逻辑**，其范式取自 [employee.service.ts](apps/platform-api/src/users/employee.service.ts) / [status-log.service.ts](apps/platform-api/src/status-log/status-log.service.ts) 的 `resolveScope + matchesScope + 越权 NotFound`，**不要照搬 `getRecord`**。
   - **forms repository 接口 + 双实现**：[forms.repository.ts](modules/forms/api/src/db/forms.repository.ts)（接口加 `findRecordBySubject`）；[postgres-forms.repository.ts](modules/forms/api/src/db/postgres-forms.repository.ts) + [in-memory-forms.repository.ts](modules/forms/api/src/db/in-memory-forms.repository.ts)（按 `(enterpriseId, slotKey, subjectType, subjectId)` 查 singleton 记录 + values）
   - **forms controller 范式**：[forms.controller.ts](modules/forms/api/src/forms/forms.controller.ts)（`@Controller('forms/...')`、`@UseGuards`、`@RequirePermissions`/自定义 guard、`toActor(request)`、`dtoValidationPipe`、`buildAuthAuditContext`——新增 `forms/records` controller 照此）
   - **presence controller 范式**：[presence-status.controller.ts](modules/presence/api/src/status/presence-status.controller.ts) + [presence-board.controller.ts](modules/presence/api/src/status/presence-board.controller.ts)（`@Controller('presence/...')`、显式 `@Inject`、`@RequirePermissions`、`request.currentUser`）
   - **platform-contract 端口范式**：[scope.ts](packages/platform-contract/src/scope.ts)（`PlatformScopePort` 接口 + `PLATFORM_SCOPE_SERVICE` Symbol——本切片在此加谓词方法）

## 2. 实施

> 总原则：**端点只暴露能力，授权=功能权限（已 seed）+ 数据范围谓词（本切片单源）双门**；`enterpriseId`/actor 身份**恒取自 `currentUser`，绝不从 body/query 读**；
> 越权/不存在/跨企业**统一不泄露存在性**（forms→404、presence→null/空）。

### 2.1 `PlatformScopePort` 暴露 `matchesScope` 谓词（platform-contract + platform-api）

**契约**（`packages/platform-contract/src/scope.ts`）：给 `PlatformScopePort` 增一个**同步纯谓词**方法，输入用**最小 subject 形状**（不要求完整 `EmployeeDto`，便于 forms 用 `EmployeeLookupDto`、presence 用 record 拼装）：

```ts
export interface ScopeSubject {
  id: string;
  enterpriseId: string;
  departmentId?: string;
}

export interface PlatformScopePort {
  resolveScope(user: CurrentUserDto, dataType: PlatformDataType): Promise<PlatformScope>;
  matchesScope(subject: ScopeSubject, scope: PlatformScope): boolean; // 新增
}
```

> **⚠️ 参数顺序必须是 `(subject, scope)`，与既有实现同序——零改调用点（二审 B1）**：
> 现有 `apps/platform-api/src/scope/platform-scope.service.ts:68` 的实现签名就是 `matchesScope(employee: EmployeeDto, scope: PlatformScope)`（subject 在前），
> 既有 5 处生产调用点（`employee.service.ts:37,49,82`、`status-log.service.ts:42,90`）+ 2 处测试 mock（`employee.service.spec.ts:377`、`status-log.service.spec.ts:356`）+ 谓词单测（`platform-scope.service.spec.ts:201-223`）全按 `(employee/subject, scope)` 传参。
> **端口照此顺序定义，则 `EmployeeDto` 结构兼容 `ScopeSubject`、所有既有调用点零改动**。**不要**把端口定成 `(scope, subject)`——那会反转语义、强迫改全部调用点，且 TS `interface` 方法**不能重载成两种参数语义**（原稿"保留适配重载"是错的，已删）。

**实现**（`apps/platform-api/src/scope/platform-scope.service.ts`）：现有 `matchesScope(employee: EmployeeDto, scope)` 在 L68——
**只把形参类型从 `EmployeeDto` 放宽到 `ScopeSubject`（最小形状），判定逻辑一字不改**（`EmployeeDto` 满足 `ScopeSubject` 子集，既有内部调用零改动）。
确认该 service 已注册为 `PLATFORM_SCOPE_SERVICE` 端口提供者（presence 已注入证明已注册）；放宽后新方法对 forms/presence 经端口可见。

**断言**：

- A1：`PlatformScopePort` 接口含 `matchesScope(subject, scope)`（subject 在前，与既有实现同序）；`ScopeSubject` 导出；既有 5 处调用点 + 2 mock **零改动仍编译通过**。
- A2：platform 自身 `listEmployees`/档案写/status-logs 的范围判定**结果零变化**——既有这三处的单测/e2e **全部仍绿**（reviewer 实证，非裸 grep）。
- A3：`matchesScope` 为纯函数（无 I/O），`self`/`department`/`department_tree`/`company` 四 kind 判定与 L68 原实现逐分支一致（补/迁移既有谓词单测覆盖四 kind + 跨企业 false）。

### 2.2 forms：`profile.employee` 记录按 subject 读（`forms-api`）

**repository**（`forms.repository.ts` 接口 + 双实现）：新增
`findRecordBySubject(enterpriseId, slotKey, subjectType, subjectId): Promise<FormRecordDto | undefined>`（含 values），
postgres 按 `(enterprise_id, slot_key, subject_type, subject_id)` 命中 singleton 唯一索引取一行 + 关联 values；memory 实现对应过滤，**复用既有 `findRecordWithValues` 的 values 组装路径**（避免 values 形状漂移）、**返回深拷贝**（照搬既有 record 读范式，避免活引用泄漏）。

**service**（`forms.service.ts`）：新增
`getRecordBySubject(actor, currentUser, { slotKey, subjectType, subjectId })`：

1. `assertActiveSlot(slotKey)`；**本切片只接受 `slotKey==='profile.employee'`**（其它 slot 的范围语义不同，直接 404 防误用）。
2. **功能门**：`requirePermission(actor, formsPermissions.recordView)`（不具 → 404，沿用既有 `requirePermission`→`NotFoundException` 范式）。
3. **数据门（profile 读范围）**：`scope = await scopePort.resolveScope(currentUser, 'profile')`；
   经 `employeeLookup.listEmployeesByIds(enterpriseId, [subjectId])` 取 subject 的**当前** `{id, departmentId}`（拼 `enterpriseId` 成 `ScopeSubject`）→ `scopePort.matchesScope(subject, scope)`（**参数顺序 `(subject, scope)`，见 §2.1**）。
   subject 不存在 / 不在范围 → **`NotFoundException`（统一 404，不泄露存在性）**。
   > 注（二审 M1）：subject 自身 `departmentId` 缺失时，`department`/`department_tree` 范围一律判 false → 404——这是**既有 `matchesScope`（service L79-81 要求 `departmentId!==undefined`）的既定语义，不是 bug，勿改谓词**。
4. `repository.findRecordBySubject(...)`：无记录 → **404**（人页据此走"自定义区留空"优雅降级，RFC §10）。命中 → 返回 `FormRecordDto`（含 values）。
5. 读不写审计（读操作不强制审计，与既有 `getRecord` 一致）。

> **注入与 `currentUser` 透传（二审 B2，链路必须写死）**：
>
> - `FormsService` 已注入 `PLATFORM_EMPLOYEE_LOOKUP_SERVICE`；**新增显式注入 `@Inject(PLATFORM_SCOPE_SERVICE) scopePort: PlatformScopePort`**。
> - service 新方法形参 **`currentUser: CurrentUserDto`**（`import type { CurrentUserDto } from '@work/platform-contract'`——合法 module→package，presence 已这么做，见 `presence-status.service.ts:4`）。**`actor`（`toActor(request)`）仍保留**，提供功能门所需 `permissionCodes`/`account`/`enterpriseId`；**`currentUser` 仅用于 `resolveScope`**（既有 `FormActorContext` 不含 departmentId/部门树，无法本地判范围，勿用 actor 自判）。
> - controller 里从 `request.currentUser`（如 presence 范式 `presence-status.controller.ts`）取 `CurrentUserDto` 透给 service。

**controller**（新增 `modules/forms/api/src/forms/forms-record.controller.ts`，`@Controller('forms/records')`）：
**对齐 presence 范式——只用 `@RequirePermissions(...)`，不写 `@UseGuards`**（gateway 已全局挂 `PlatformAuthGuard`+`PermissionGuard`，对每条嵌入路由生效；既有 `presence-status.controller.ts` 即如此，**勿照搬 `forms.controller.ts` 的自定义 `FormsDefinitionPermissionGuard`/`@UseGuards`**——那是 definition 专用、本切片不需要）。构造注入显式 `@Inject(FormsService)`。

- `GET /:slotKey/subjects/:subjectId` → `getRecordBySubject(toActor(request), request.currentUser, {...})`。`subjectType` 对 `profile.employee` **固定为服务端常量 `'employee'`**（不从客户端读）。
  `@RequirePermissions(formsPermissions.recordView)` 作为粗门 + service 内 profile 范围细门（双门）。
  > 注（二审 M6）：路径段 `:slotKey` 取值 `profile.employee` **含点号**。Nest/Express path 参数可吃点号，但 gateway 前缀拼装下须**实测路由命中**（仓库现有带点 slot 的 HTTP 路由无先例）；e2e 必须真打 `/api/forms/records/profile.employee/subjects/:id` 验证不被截断。若实测有问题，回退为固定子路径 `forms/records/profile-employee/subjects/:id`（slotKey 服务端固定，不再做 path 参数）。

**断言**：

- B1：`GET /api/forms/records/profile.employee/subjects/:id` 在 subject 处于本人/部门/部门树/全公司 profile 读范围内时返回记录值；越权/跨企业/subject 不存在 → **404**；记录不存在 → **404**。
- B2：无 `forms:record:view` → 404（功能门）。
- B3：`subjectType` 恒为服务端常量 `'employee'`，客户端不可注入；`enterpriseId` 取自 `currentUser`。
- B4：非 `profile.employee` 的 slotKey → 404（本切片不开放其它 slot 的按-subject 读）。

### 2.3 forms：`profile.employee` 记录 upsert 写（`forms-api`）

**service**（`forms.service.ts`）：新增
`upsertRecordBySubject(actor, currentUser, { slotKey, subjectType, subjectId, definitionRevision, values }, auditContext)`：

1. `assertActiveSlot` + 只接受 `profile.employee`（同 §2.2-1）。
2. **功能门**：`requirePermission(actor, formsPermissions.recordSubmit)`（不具 → 404）。
3. **数据门（profile 写范围）**：`resolveScope(currentUser, 'profile')` + `matchesScope`（同 §2.2-3，**写范围与读范围同一 `profile` 范围**——M8-2a 已确立 profile 范围既用于读过滤也用于写授权）。越权/subject 不存在 → 404。
4. 取 `findDefinitionWithFields` → 校验 `status==='active'` + `definitionRevision === definition.revision`（乐观锁，不符 `ConflictException('表单定义版本已变化')`，照搬 `createRecord`）。
5. `validateRecordValues`（**完全复用既有**：大小上限、未知字段拒绝、必填校验、按字段类型归一化、文件/employee 字段 displaySnapshot）。
6. **upsert（singleton）**：`findRecordBySubject` 是否已有记录 →
   - 无 → `reserveRecord`（cardinality singleton）+ `replaceRecordValues`（照搬 `createRecord` 的 UoW + `attachFiles` 附件逻辑）。
   - 有 → 同一 UoW 内 `replaceRecordValues`（覆盖值 + 重附附件），`submittedBy` 更新为当前 actor、`definitionRevision` 更新为当前定义版本。
     （**保持 singleton 唯一索引不被违反**：已有则走 replace 而非二次 reserve。）
7. **审计（action 名钉死为 `forms.record.upsert`，二审 m3）**：成功 → 写审计，action **统一 `forms.record.upsert`**（不在 create/update/upsert 间摇摆，否则 e2e 断言对不上），metadata 记 `slotKey/recordId/subjectType/subjectId/revision`，**不整文落 values**（RFC §14 最小披露）。失败（越权/版本冲突）→ 失败审计（沿用既有失败审计范式，**审计写失败不得把业务结果变成 500**，呼应 §7.3 既有 follow-up）。
8. **事件：upsert 一律不发（二审 m2）**——读/写自定义字段值本切片都**不发任何 forms 领域事件、不接 `profile.updated`**（"复用 `recordCreated`" 对 update 路径语义不准，故弃用）。自定义字段被改是否通知本人属 5b / 后续决策，本切片不引入。

**controller**：`PUT /forms/records/:slotKey/subjects/:subjectId`（同 controller），body = `UpsertProfileRecordDto { definitionRevision: number; values: {fieldKey; value}[] }`（`dtoValidationPipe` 校验；`subjectType` 服务端固定）。`@RequirePermissions(formsPermissions.recordSubmit)` 粗门 + service profile 写范围细门。

**断言**：

- C1：有 `forms:record:submit` + subject 在 profile 写范围 → 首次 PUT 创建 singleton 记录、二次 PUT 覆盖值（不产生第二行，唯一索引不冲突）。
- C2：越权（subject 不在写范围）/ 跨企业 / subject 不存在 → 404，**不落任何行**。
- C3：`definitionRevision` 不符 → 409；未知字段 / 超限 / 必填缺失 → 400（复用 `validateRecordValues`）。
- C4：`enterpriseId`/`submittedBy` 恒取 `currentUser`；审计记 metadata 不整文落值。

### 2.4 presence：按 employeeId 取当前在位（`presence-api`）

**repository**（`presence.repository.ts` 接口 + 双实现）：若无可复用方法，新增
`findActiveRecordByUser(enterpriseId, userId, at): Promise<PresenceStatusRecordDto | undefined>`（取该用户在 `at` 时刻的活动记录；postgres 按 `enterprise_id=$ AND user_id=$ AND start_at<=at AND (end_at IS NULL OR end_at>at) AND cancelled_at IS NULL ORDER BY start_at DESC LIMIT 1`；memory 对应过滤，返回深拷贝）。

**service**（`presence-status.service.ts`）：新增
`getEmployeeStatus(currentUser, employeeId): Promise<{ record: PresenceStatusRecordDto | null }>`：

1. `scope = await scopeService.resolveScope(currentUser, 'presence')`。
2. **范围判定——与既有 `getBoard` 同款「按 record 部门下推查询」，保持 presence 内部授权口径一致（二审 M2 的取舍）**：
   既有 `getBoard`（`presence-status.service.ts:36-51`）的授权就是**把 `scope` 推进 record 查询**（`self`→`userIds:[scope.userId]`、`company`→不加部门过滤、`department*`→`departmentIds`），按 **record 行**的归属过滤。本按人端点**沿用同一模型**，`findActiveRecordByUser` 把 scope 下推：
   - `self`：仅当 `employeeId === scope.userId` 才查，否则 `record:null`。
   - `company`：直接查 `findActiveRecordByUser(enterpriseId, employeeId, now)`。
   - `department`/`department_tree`：查 `findActiveRecordByUser(...)` 且记录 `departmentId ∈ scope.departmentIds`，不符 → `record:null`。
     （**越权与无记录统一返回 `record:null`，不区分二者，防枚举**——presence 看板本就是软信息，null 降级即可，不抛 404。）
     > **取舍说明（二审 M2）**：reviewer 建议改用 `employeeLookup` 取 subject **实时**部门 + `matchesScope` 授权（与 platform profile 口径一致）。本切片**不采纳**，理由：① 既有 `getBoard` 的 presence 授权本就是 **record 快照部门下推**，按人端点改用实时部门会让**同一 presence 数据类型出现两套授权口径**，更不一致；② 会给 presence 新引 `PLATFORM_EMPLOYEE_LOOKUP_SERVICE` 注入 + 网关装配，扩大改动/风险面。"快照部门可能陈旧"是 **presence 全模块的既有性质**（board 同样如此），**不在本切片单独纠偏**——登记到 `docs/foundation-progress.md` §7 follow-up（presence 在位授权按登记快照部门、换部门后可能短暂错配，待 M9 在位 v2 统一）。故 presence **不新增 employeeLookup 注入**；本端点**不调用 §2.1 的 `matchesScope`**（仅 forms 用谓词；presence 走 board 同款下推）。
3. `presence:board:view` 作为功能门（controller `@RequirePermissions`）——人页看在位复用看板权限语义；无该权限 → 走 Guard 403（人页 5b 据此不渲染在位区，优雅降级）。

> 注入：`PresenceStatusService` 已注入 `PLATFORM_SCOPE_SERVICE`（`presence-status.service.ts:31`）——本端点**只需复用它 + repository**，**不新增任何注入**（与 board 同依赖面）。

**controller**（`presence-status.controller.ts` 增一路由，或新建）：
`GET /presence/status-records/by-employee/:employeeId`，`@RequirePermissions(presencePermissions.boardView)`，返回 `{ record }`。

**断言**：

- D1：viewer 有 `presence:board:view` 且目标在其 presence 范围内、有活动记录 → 返回该记录；无活动记录 → `record:null`。
- D2：目标不在 presence 范围（含 self 范围下查他人）→ `record:null`（不泄露存在性，不抛 404/403 区分）。
- D3：无 `presence:board:view` → Guard 403。
- D4：`enterpriseId` 取自 `currentUser`；跨企业不可见。

### 2.5 权限点与 seed

- **无新增权限点**：forms 复用 `forms:record:view`/`forms:record:submit`（已在 `formsPermissionDefinitions`），presence 复用 `presence:board:view`。
- **seed 无需改动（已实证，二审 M3）**：`seed-platform.ts` 的 `grantRolePermissions`（L244）把 `platformSeedPermissions` **全量**授予 admin 角色，而 `forms:record:view`/`forms:record:submit` 在该聚合权限清单内（`seed-data.spec.ts:76-77` 断言）；`seedAdminDataScopes`（L228）给 admin 的 `profile`/`presence`/`report` 全 `company` 范围。
  **故 admin 开箱即可端到端读/写 `profile.employee` 记录 + presence 按人读，e2e 直接可用，本切片不改 seed。** HR / 部门负责人等业务角色的 `forms:record:*` 授予与按部门 profile 范围配置**留 5b / 角色配置阶段**，不在本切片写死。（执行者只需复核上述事实仍成立并写进 verification-log，无需新增 seed 代码。）

## 3. 测试要求

- **单元**：
  - `matchesScope` 谓词四 kind + 跨企业（§2.1-A3）；platform 既有三处消费回归绿（§2.1-A2，实证）。
  - forms `getRecordBySubject`：范围内命中 / 越权 404 / subject 不存在 404 / 无记录 404 / 无功能权限 404 / 非 profile.employee slot 404（§2.2 B1-B4）。
  - forms `upsertRecordBySubject`：首次创建 + 二次覆盖不双行 / 越权不落行 / 版本冲突 409 / 校验 400 / 身份取 currentUser（§2.3 C1-C4）。
  - presence `getEmployeeStatus`：范围内有记录 / 无记录 null / 越权 null / self 查他人 null（§2.4 D1-D4）。
- **e2e（in-memory，gateway 同进程装配）**：
  - HR（profile 全公司写范围 + forms:record:submit）PUT 某员工 profile.employee 记录 → 该员工本人 GET `/employees/me`（固定字段）+ 自定义字段读端点拿到值；**跨 platform 固定 + forms 自定义两端点**验证人页聚合数据链。
  - **越权双向断言**：部门范围 HR 读/写他部门员工自定义字段 → 404、不落行；presence 按人读他范围 → null。**防假绿**：确认 404/null 来自范围判定而非端点不存在。
- **Postgres-gated**：forms `findRecordBySubject` + upsert 命中 singleton 唯一索引的集成测试（env-gated；**确认 gate 真跑过，source-review 判定而非裸 grep**——见 CLAUDE.md "假绿"告警）。
- 验收禁止假数据/占位蒙混；端点必须真鉴权、真落库。

## 4. 文档影响（本切片同变更处理）

- `docs/security-baseline.md`：按 §0.5 / §16——`matchesScope` 经 `PlatformScopePort` 跨模块暴露用于 forms/presence 授权，**评估补 §5 一句**说明该谓词为 profile/presence 范围判定单源、forms/presence 经端口消费（reviewer 定是否强制；倾向补）。
- `docs/platform-core.md`：新增 `PlatformScopePort.matchesScope` 端口契约说明（供模块授权）。
- `docs/architecture.md`：人页聚合的"前端分别调 platform/forms/presence 端点、各自按数据范围授权、不在后端编排"落位补一句（呼应 RFC §4.3）。
- `docs/rfc/m8-people-org-profile.md`：在 §17 M8-5 行或 §3 现状盘点补一条勘误脚注——"forms 记录读/写 HTTP 端点、presence 按人在位端点 M8-5a 方补；照片下载延后"（避免后人再踩 §10 的"已交付"假设）。
- `docs/domain-glossary.md`：补"档案自定义字段（forms profile.employee 记录）"、"在位（按人查询）"术语。
- `docs/verification-log.md`：追加 `M8-5a People Aggregation Data Backend`（含 §2.5 seed 核查结论 + Postgres-gated 真跑实证）。
- `docs/foundation-progress.md`：M8 下一步从"M8-4 近况"推进到"M8-5a 已交付 → M8-5b 人页 UI"。

## 5. 退出标准（Definition of Done）

1. `PlatformScopePort.matchesScope` 谓词暴露，platform 自身三处消费回归全绿，谓词四 kind 单测覆盖。
2. forms `profile.employee` 记录**按 subject 读 + upsert 写**两端点落地，**功能权限 + profile 范围双门**，越权/不存在统一 404，singleton upsert 不双行，审计最小披露。
3. presence **按 employeeId 取当前在位**端点落地，presence 范围授权，越权/无记录统一 null。
4. forms repo 新方法双实现（memory + postgres）+ Postgres-gated 真跑；presence repo 新方法双实现。
5. 无 web/files/照片改动；无新增权限点（§2.5 seed 核查结论入 log）。
6. security-reviewer 独立二审通过；安全门禁 §0.5 各点经 reviewer 实证。
7. `pnpm verify` 全绿（lint/typecheck/test/test:e2e/build）。
8. 文档 §4 各项同变更同步；verification-log 追加。

## 6. 给执行者的提示（避免踩坑）

- **不要把聚合放后端**：本切片是"三个独立端点各自授权"，platform 里**不要**写"取员工档案+自定义+在位"的聚合方法（RFC §4.3 明确不做后端跨进程编排；聚合是 5b 前端的事）。
- **不要让 forms/presence import `apps/platform-api`**：范围判定经 `PlatformScopePort`（`@work/platform-contract` 端口）消费，**只依赖 contract 包**。
- **不要从 body/query 读身份**：`enterpriseId`/actor/`submittedBy` 恒取 `currentUser`；`subjectType` 服务端常量。
- **显式 `@Inject`**：forms/presence 新增构造注入务必显式 `@Inject(TOKEN)`（esbuild gotcha，否则 500）。
- **404/null 语义别漏**：forms 越权与不存在都 404；presence 越权与无记录都 null——**不区分二者**才不泄露存在性。
- **upsert 别违反 singleton 唯一索引**：已有记录走 `replaceRecordValues`，不要二次 `reserveRecord`。
- **`matchesScope` 重构零行为变化**：以 platform 既有测试全绿为准绳，**只搬不改判定**。
