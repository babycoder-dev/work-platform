# Task: M9-2 自助登记 v2 + forms 泛化（激活 `presence.status.<key>` 槽位 + forms 记录服务泛化（subject 授权从无到有）+ 按 id 读 HTTP + presence 出站端口经宿主适配器建 forms append 记录并原子落 `form_record_id`；看板反转 / web UI / 导出均不在本切片）

## 状态

- 里程碑：M9（在位状态 v2，RFC `docs/rfc/m9-presence-v2.md` 已 Accepted 2026-07-01）
- 切片：M9-2（RFC §16），依赖 M9-1（已合并 `85ea16d`，PR #31）、M6 forms 基建、M8-5a subject 授权范式
- 交付形态：`feat/m9-2-self-registration-forms` 分支 + PR，合并前过 security-reviewer（RFC §13/§15-9 对 M9-2 的指定关注点：forms 读写门不越权）

## 0. 任务定位

打通 RFC §5.2 自助登记 v2 的**后端整链**：员工登记某状态时，若该状态配了 `presence.status.<key>` 表单
定义，登记请求随带填报值 → presence 服务端经**出站端口（宿主适配器）**调 forms 建一条 **append** 记录 →
`form_record_id` 随 presence 记录**一次落库**。同时把 forms 记录服务从 profile.employee 单例硬编码中
泛化出来，并补上**按 id 读**的 HTTP 路径（收口 foundation-progress §7.5 的 `getRecord` follow-up）。

具体七件事：

1. **forms 契约**：`slots.ts` 的 `FormSlotDefinition` 增加 `dataType` / `subjectType` 字段（槽位家族 →
   数据范围类型映射的**单一来源**）；`presence.status.<key>` fallback 从 `reserved` 激活为 `active`，
   权限码字面量改引用常量；`formsPermissions` / `formsPermissionDefinitions` / `formsPlatformManifest`
   注册 `forms:presence-definition:{view,manage}`。
2. **seed 守护测试翻转**：`seed-data.spec.ts` 两处（arrayContaining 白名单追加、
   `.not.toContain` → `toContain`；精确清单断言是运行时从 manifest 派生的，自动同步、无需改）；
   `forms-definition.e2e-spec.ts` 对 presence 槽位的 reserved-404 断言翻转为激活后语义。
3. **forms 服务泛化（安全命门）**：`FormsService.createRecord`（现无任何 subject 授权、无消费者）
   增加 **subject 数据范围授权**（`loadAuthorizedProfileSubject` 参数化为按 `slot.dataType` 解析）；
   新增 `getRecordById`（slot 家族数据范围门）+ `GET /forms/records/by-id/:recordId` HTTP。
4. **presence 出站端口**：presence api 自定义窄端口 `PresenceFormsLinkPort`（**不 import
   forms-contract**，本地窄类型），`PresenceStatusService` 以 `@Optional() @Inject` 消费。
5. **宿主适配器**：gateway 组合宿主提供 `@Global()` 适配器模块，把端口实现为进程内直调
   `FormsService`（actor 从真实 `currentUser` 构建、subject 硬编码本人）——服务拆分时适配器换 HTTP
   实现，presence 代码不变（同 web 模块加载器「先静态后远程」范式，ADR-0003 组合宿主职责）。
6. **presence 登记编排**：`CreatePresenceStatusRecordInput` 增可选 `form` 块（**不接受裸
   `formRecordId`**）；服务编排次序 ①key 校验 → ②重叠 409 → ③a 建 forms 记录 → ③b presence 记录带
   `form_record_id` 一次落库 → ④审计 + 事件。repository 双实现写路径同步（**无新迁移**，列已在 M9-1 建好）。
7. **角色配置口径落文档**：普通员工跑通自助登记 = `presence:status:create` + `forms:record:submit` +
   `forms:presence-definition:view`（登记页读定义，沿 M8 profile.employee 先例）三件套。数据范围
   **无需显式配置**——`resolveScope` 对未授权 dataType 回退 `self`
   （`apps/platform-api/src/scope/platform-scope.service.ts:24-25`），而登记链路 subject 恒为本人，
   self 必过；显式 `presence` 范围只影响**读他人**填报记录（by-id）的管理者角色。**seed 不建员工角色**
   （RFC §7「seed 的默认员工角色须相应补齐」与实况不符——seed 只有 admin 一个角色，普通角色是运行时
   经 M5 角色管理配置的；此为对 RFC 的事实修正，验收在 e2e 里现搭角色验证）。

### 对 RFC 的显式偏差 / 补充声明（任务包决策，评审按此口径）

- **编排方式 = 出站端口 + 宿主适配器（拍板 2026-07-04）**：RFC §5.2 次序①→④写的是服务端闭环流，但
  模块边界规则禁止 presence import forms-contract/`FORMS_SERVICE`（AGENTS + Nx tags：模块只依赖自身
  contract + `packages/*` + platform-sdk）。经拍板选依赖反转：presence 定义自己的出站端口，组合宿主
  （gateway）注入实现。RFC 次序语义完整保留在 presence 服务端；`form_record_id` 可信（客户端无法注入）。
- **通用 `POST /forms/records` HTTP 面本期不做（预留）**：RFC §6「新增 append 创建（返回记录 id）／按
  id 读路径」中，append 创建泛化到 **service/port 层**即止（消费者 = 宿主适配器）。M9-2 后 HTTP create
  没有任何消费者（web 登记只打 presence 端点），按「本期做/预留分明」原则不开无消费者的 HTTP 授权面；
  M10 日报等需要时再补，届时授权骨架（subject 门）已就位。
- **`getRecordBySubject` / `upsertRecordBySubject` 的 subject 路径本期不泛化**：两条 M8 路径保持
  `assertProfileEmployeeSlot` 硬编码不动（M8 行为零变化）。presence 填报值的读取走**按 id**新路径，
  不走 by-subject（append 语义下 by-subject 单条读也不成立）。
- **跨 schema 非原子性接受**：③a 成功、③b 失败会留下**孤儿 forms 记录**——良性（不可达、无越权面、
  审计可追溯），本期不做补偿事务/清理 job。③b 的现实失败面是 **DB 故障类**（连接/约束异常）；注意
  「并发重叠」**不是**③b 的失败面——重叠 409 只是②的服务层判定、DB 无排他约束，并发窗口下两条重叠
  记录会都落库（M4 既有竞态，本切片不新增也不修）。反向（③b 前置 ③a）会在 forms 失败时留下无填报的
  presence 记录，语义更差，故次序固定 ③a→③b。

### 安全门禁判定（security-reviewer 重点，RFC §13）

1. `FormsService.createRecord` 的 subject 授权是**从无到有**的门：self 之外的 subject、scope 外
   subject、不存在 subject 一律 404（不泄露），不得因「端口内部调用」而跳过任何一道 forms 门。
2. `GET /forms/records/:recordId` 新 HTTP 面：slot 家族 → `dataType` 映射正确（`profile.employee` →
   `'profile'`、`presence.status.*` → `'presence'`）；越权 / 不存在 / 缺权限统一 404（`requirePermission`
   缺权限即 404 防枚举，**不是 403**）。
3. 宿主适配器无提权：actor 从真实 `currentUser` 构建（同 `toActor` 口径），权限集来自该用户本人；
   **绝不用 admin/system actor 代填**；subjectId 硬编码 `currentUser.id`（不可能替他人建填报记录）。
4. `presence.status.<key>` 激活是权限面扩面：定义 GET/PUT 对该家族开始生效，seed 必须先注册两条权限，
   否则 guard 永 403；激活不得绕过 `FormsDefinitionPermissionGuard`。
5. `CreatePresenceStatusRecordInput` 不接受 `formRecordId`（防裸 id 注入 → confused-deputy 展示完整性
   缺口）；`form_record_id` 只能由服务端编排写入。
6. 无跨 schema 读写：presence 只经端口 → `FormsService` 全套门（permission + slot + revision + subject
   scope + 字段校验），不碰 `forms.*` 表。
7. 守护测试翻转两处一致（arrayContaining 白名单 + not.toContain→toContain）；精确清单断言
   （`seed-data.spec.ts:47-57` 的 `expectedPermissionCodes`）是从 manifest **运行时派生**的，两侧自动
   同步——**不得**把它改成硬编码清单。
8. slotKey 拼接无注入面，但须**用校验后的规范值拼**：`presence.status.${statusType.key}`（字典命中后
   的 `statusType.key`，不用原始 `input.status`）。安全依据：字典 key 受
   `presence-status-type.dto.ts:5` 的 `^[a-z][a-z0-9_]{1,63}$` 约束（无 `.`/`/`，拼不出越界槽位如
   `presence.status.../profile.employee`）——该字符集约束是这条安全性的**隐式依赖**，未来放宽 key
   格式时必须重审此处。
9. 事件 payload 不新增敏感值（本切片不改事件契约）。

### 本切片不做（越界即打回）

- 看板实时化 / 数据来源反转 / `PlatformEmployeeLookupPort.listEmployeesByScope`（M9-3a）。
- 一切 web/UI 改动（M9-3b；含登记页动态表单、档案补全、`PresenceSection` 语义迁移）。
- Excel 导出（M9-4）。
- 通用 `POST /forms/records` HTTP、by-subject 路径泛化、forms 记录列表/查询 API（见偏差声明）。
- forms 新表 / 新迁移；presence 新迁移（`form_record_id` 列 M9-1 已建）。
- 补偿事务 / 孤儿记录清理 job。
- seed 新增员工角色或改 admin 角色权限集（admin 经 manifest 全量授权自动获得新权限，无需手改）。
- M4 遗留 follow-up（`cancelRecord` 仓库层 `enterprise_id` 复核等）——已登记，不顺手修。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md` —— 模块边界（跨模块只许 URL 导航/公开 API/领域事件）、统一错误信封、提交规范。
2. `docs/rfc/m9-presence-v2.md` §3（现状盘点：forms API 面硬编码点）、§5.2（登记次序①→④）、§6（forms
   侧三步）、§7（权限三步 + 角色配置口径）、§9-C（forms 填报值不共享 board:view 门）、§13（M9-2
   security-reviewer 关注点）、§15-3/5（退出标准）。
3. `docs/adr/0003-gateway-boundary.md` —— gateway = 组合宿主，适配器属于组装职责；业务逻辑不入 gateway。
4. `modules/forms/api/src/forms/forms.service.ts` —— 通读。重点：`createRecord`（:139-186，**无 subject
   授权**）、`loadAuthorizedProfileSubject`（:392-413，data_type 硬编码 `'profile'`）、
   `assertProfileEmployeeSlot`（:478-483）、`getRecord`（:330-338，port-only 警告注释）、
   `requirePermission`（:665-669，**缺权限 404**）、`saveRecord`（:340-390，append 走 `reserveRecord`）。
5. `modules/forms/contract/src/slots.ts`（fallback :59-70）、`permissions.ts`、`platform-manifest.ts`、
   `ports.ts`、`forms.dto.ts`（`CreateFormRecordInput` :45-51、`FormActorContext` :58-63）。
6. `modules/presence/api/src/status/presence-status.service.ts` —— M9-1 合并后现状：`createRecord`
   :105-192（校验次序、`exemptStatusKey` 解析、审计、事件）。
7. `modules/presence/CLAUDE.md` —— **显式 `@Inject` gotcha**（esbuild 不 emit decorator metadata，
   裸类型注入静默 undefined）；`apps/gateway-api/CLAUDE.md` —— 双全局 guard。
8. `apps/platform-api/src/seeds/seed-data.ts` / `seed-data.spec.ts`（:47-57 派生精确清单——自动同步
   勿改、:68-83 白名单、:84-89 守护断言）—— 权限 seed 来源是 **manifest.permissions**
   （`platformSeedPermissions` 由 active manifest flatMap 而来），所以注册权限必须进
   `formsPlatformManifest`，只加 `formsPermissionDefinitions` 不会进 seed。
9. e2e 先例：`apps/gateway-api/src/people-aggregation.e2e-spec.ts`（`createAndLoginUser(permissions,
dataScopes, prefix)` 助手 + subject 授权断言范式）、`presence-status-types.e2e-spec.ts`（M9-1 新
   spec 的 env 保存/恢复范式）、`forms-definition.e2e-spec.ts`（:99-106 reserved-404 断言，**本切片要翻转**）。
10. `docs/security-baseline.md` §5（数据范围）、§7（错误信封）；`docs/verification-log.md` M9-1 小节
    （PR #31 修复轮，了解 key 长度 64 / 错误映射现状）。

## 2. 设计要点（严格遵守）

### 2.1 forms 契约：`modules/forms/contract`

`slots.ts`：

```ts
export interface FormSlotDefinition {
  slotKey: FormSlotKey;
  ownerModule: 'profile' | 'presence' | 'report';
  status: FormSlotStatus;
  cardinality: FormRecordCardinality;
  permissions: Record<FormDefinitionPermissionAction, string>;
  /** 记录 subject 授权用的数据范围类型（resolveScope 第二参），槽位家族单源 */
  dataType: 'profile' | 'presence' | 'report';
  /** 记录 subject 类型；本期全部 'employee' */
  subjectType: 'employee';
}
```

- registry 三行补 `dataType`（profile.employee→`'profile'`，report.daily/weekly→`'report'`）+
  `subjectType: 'employee'`。
- `presence.status.<key>` fallback（:59-72）：`status: 'reserved'` → `'active'`；权限码字面量改为
  `formsPermissions.presenceDefinitionView / presenceDefinitionManage`（消除双源）；补
  `dataType: 'presence'`、`subjectType: 'employee'`。
- `permissions.ts`：`formsPermissions` 增 `presenceDefinitionView: 'forms:presence-definition:view'`、
  `presenceDefinitionManage: 'forms:presence-definition:manage'`；`formsPermissionDefinitions` 增两条
  （名称：`查看在位表单定义` / `管理在位表单定义`）。
- `platform-manifest.ts`：`formsPlatformManifest.permissions` 增同两条（`moduleName: 'forms'`）——
  **这一步才真正进 seed**（见 §1-8）。
- `ports.ts`：`FormsPort.createRecord` 签名改为
  `createRecord(actor, currentUser: CurrentUserDto, input, auditContext?)`（subject 授权需要
  currentUser；port 层无任何生产消费者，签名变更无运行时破坏面——但 `forms.service.spec.ts` 有约
  12 处 `service.createRecord(actor(), {...})` 直调会被编译破坏，须机械补 `currentUser` 参数，spec
  现有 `currentUser()` fixture / matchesScope-true mock 可直接复用）；新增
  `getRecordById(actor, currentUser, recordId): Promise<FormRecordDto>`；`getRecord` 保持原样 +
  原警告注释（port-only 旧方法，不动）。

### 2.2 seed 守护测试翻转：`apps/platform-api/src/seeds/seed-data.spec.ts`

两处**同一提交内**同步：

1. `:68-83` `arrayContaining` 白名单：追加两条新码。
2. `:84-89` 两个 `.not.toContain('forms:presence-definition:*')` → `toContain`（不改则 CI 红）。

⚠️ **没有第三处**：`:47-57` 的 `expectedPermissionCodes` 是**运行时从 manifests flatMap 派生**的
（不是硬编码清单），manifest 加权限后断言两侧自动同步保持绿——**不得**把它改成硬编码清单，也不存在
「漏加必红」一说。

同时翻转 `apps/gateway-api/src/forms-definition.e2e-spec.ts:99-106`：`presence.status.business_trip`
从 reserved-404 循环中移出，改断言**激活后语义**——无 view 权限用户 GET → 403（guard 生效）、带
`forms:presence-definition:view` 用户 GET → 200 空定义（revision 0）。`missing.slot` / `report.weekly`
保持 404 断言不变。另 `grep -r "presence.status." --include="*.spec.ts"` 清点其余引用 reserved 语义的
存量断言（如 forms contract/service 单测），一并翻转，不得留「碰巧还绿」的语义过期断言。

### 2.3 forms 服务泛化：`modules/forms/api/src/forms/forms.service.ts`

**(a) subject 授权参数化。** `loadAuthorizedProfileSubject` 改名 `loadAuthorizedSubject`，签名
`(currentUser, subjectId, dataType: FormSlotDefinition['dataType'])`；内部 `resolveScope(currentUser,
dataType)`，其余逻辑（employeeLookup 实时部门 + `matchesScope`、不存在/越权统一 404『表单记录不存在』）
不变。两条 by-subject 旧路径改传 `'profile'`（行为零变化）。

**(b) `createRecord` 加 subject 门（安全命门）。** 新签名
`createRecord(actor, currentUser, input, auditContext?)`：

```
requirePermission(actor, recordSubmit)          // 保持（缺权限 404）
slot = assertActiveSlot(input.slotKey)          // 保持
if (input.subjectType !== slot.subjectType) throw NotFoundException('表单记录不存在')
await this.loadAuthorizedSubject(currentUser, input.subjectId, slot.dataType)   // 新增
// 定义存在/revision 校验、saveRecord、审计、事件 —— 全部保持
```

审计 metadata 保持现有字段（slotKey/recordId/subjectType/subjectId 已够）。

**(c) 新增 `getRecordById`（HTTP 用，收口 §7.5 follow-up）。**

```
requirePermission(actor, recordView)
record = repository.findRecordWithValues(actor.enterpriseId, recordId)
if (!record) throw NotFoundException('表单记录不存在')
slot = resolveFormSlot(record.slotKey)          // 注意：resolveFormSlot 非 Active 变体——
                                                // 记录存在即读，槽位后续被改回 reserved 不应锁死历史记录；
                                                // slot 未知（记录残留）同 404
if (!slot) throw NotFoundException('表单记录不存在')
await this.loadAuthorizedSubject(currentUser, record.subjectId, slot.dataType)
return record
```

旧 `getRecord`（:330-338）**保持原样**（port-only + 警告注释），不删不改——`getRecordById` 是带门的
HTTP 变体，两者并存，注释可加一行指向新方法。

**(d) HTTP：`forms-record.controller.ts`** 新增
`@Get('by-id/:recordId') getRecordById(...)`（路由取 `forms/records/by-id/:recordId`；与现有
`GET :slotKey/subjects/:subjectId` 段数不同、本就不会互吞，`by-id` 前缀是**预留防御**——防未来加
单段路由时歧义），复用 `toActor`/`currentUser` 助手。**无新 DTO 管道需求**（无 body）。

### 2.4 presence 出站端口：`modules/presence/api/src/forms-link/`

新文件 `presence-forms-link.port.ts`（**零 forms-contract import**，本地窄类型，镜像 notification
本地重定义范式）：

```ts
import type { CurrentUserDto } from '@work/platform-contract';

export const PRESENCE_FORMS_LINK = Symbol('PRESENCE_FORMS_LINK');

export interface PresenceFormsLinkCreateInput {
  slotKey: string; // `presence.status.${statusKey}`，由 presence 服务拼
  definitionRevision: number;
  values: Array<{ fieldKey: string; value: unknown }>;
}

export interface PresenceFormsLinkPort {
  /** 以 currentUser 本人身份建一条 presence.status.<key> 的 forms append 记录，返回记录 id */
  createStatusFormRecord(
    currentUser: CurrentUserDto,
    input: PresenceFormsLinkCreateInput,
    audit: { traceId?: string; ip?: string; userAgent?: string },
  ): Promise<{ recordId: string }>;
}
```

从 `@work/presence-api` 包入口 export（token + 两个类型），供宿主 import。presence 模块内**不提供**
默认实现——`PresenceStatusService` 构造参数用 `@Optional() @Inject(PRESENCE_FORMS_LINK)`（注意模块
CLAUDE 的显式 `@Inject` gotcha），未接线时字段为 undefined。

### 2.5 presence 契约与编排：`modules/presence`

`contract/src/status.dto.ts`：

```ts
export interface CreatePresenceStatusRecordFormInput {
  definitionRevision: number;
  values: Array<{ fieldKey: string; value: unknown }>;
}

export interface CreatePresenceStatusRecordInput {
  status: PresenceStatus;
  startAt: string;
  endAt?: string;
  remark?: string;
  form?: CreatePresenceStatusRecordFormInput; // 可选；无填报字段时省略
}
```

**明确不加 `formRecordId`**（安全门禁判定 5）。controller 仍 `@Body()` 裸接收（服务层是唯一防线，
与 M9-1 口径一致）：服务须对 `input.form` 做形状校验（`definitionRevision` 为数,`values` 为数组），
非法即 400——不要信任 web。

`presence-status.service.ts` `createRecord` 编排（现有 ①key 校验 ②重叠判定之后、repo 落库之前插入 ③a）：

```
// ①② 保持 M9-1 现状（:114-143）
let formRecordId: string | undefined;
if (input.form !== undefined) {
  // 形状校验（400）
  if (this.formsLink === undefined) {
    throw new Error('presence forms link 未接线：宿主必须提供 PRESENCE_FORMS_LINK');  // 500，部署装配错误
  }
  ({ recordId: formRecordId } = await this.formsLink.createStatusFormRecord(
    currentUser,
    // slotKey 用①字典命中后的规范值 statusType.key 拼，不用原始 input.status（安全门禁判定 8）
    { slotKey: `presence.status.${statusType.key}`, definitionRevision: input.form.definitionRevision,
      values: input.form.values },
    { traceId: auditContext.traceId, ip: auditContext.ip, userAgent: auditContext.userAgent },
  ));
  // forms 侧异常（404/409/400）原样透传 —— 此时 presence 记录尚未创建，无孤儿 presence
}
const record =
  formRecordId === undefined
    ? await this.repository.createRecord(input, actor)          // ⚠️ 不带 form 时不得传第三参：
    : await this.repository.createRecord(input, actor, { formRecordId });
// 现有护栏断言 presence-status.service.spec.ts:78 用 toHaveBeenCalledWith 做全参数比对，
// 无条件多传 { formRecordId: undefined } 会令其必红，违反退出标准 6 的「断言零修改」。
// 审计 metadata 增补 formRecordId（可空；toHaveBeenCalledWith 忽略值为 undefined 的属性，不破现有断言）；
// 事件 payload 不变
```

透传语义：适配器进程内直调，forms 抛的 `HttpException`（404 权限/subject、409 revision、400 字段
校验）天然冒泡为该请求响应——**不要 catch 重包**，错误信封由全局 filter 统一（AGENTS）。

### 2.6 presence repository：`form_record_id` 写路径（双实现，无迁移）

- 接口：`createRecord(input, actor, options?: { formRecordId?: string })`。
- postgres：INSERT 列加 `form_record_id`（列已存在，M9-1 迁移 `0001` :23）；返回 DTO 已含
  `formRecordId?`（M9-1 已做只读映射，勿重复实现）。
- in-memory：记录对象存 `formRecordId`。
- **无新迁移文件、不动 `db:generate`**。PG 集成测试补一条：带 `formRecordId` 创建 → 读回含该 id。

### 2.7 宿主适配器：`apps/gateway-api/src/forms-link/`

```
presence-forms-link.adapter.ts   // class GatewayPresenceFormsLink implements PresenceFormsLinkPort
presence-forms-link.module.ts    // @Global() @Module({ imports:[FormsModule], providers:[{provide:
                                 //   PRESENCE_FORMS_LINK, ...}], exports:[PRESENCE_FORMS_LINK] })
```

- 适配器注入 `FormsService`。⚠️ Nest DI 层 `FormsModule` 已 export 该 provider，但 **TypeScript 包
  入口没有**：`modules/forms/api/src/index.ts` 现在只导出 `forms.module` 等，`FormsService` 类不可
  import——须在该 index.ts 增加 `export { FormsService } from './forms/forms.service';`（纯
  re-export，非边界破坏：gateway 本就依赖 `@work/forms-api`，不新增依赖、不动 lockfile）。实现：由
  `currentUser` 构建
  `FormActorContext`（口径同 `form-actor.ts` 的 `toActor`：enterpriseId/userId/account/
  permissionCodes——**权限集必须来自该用户本人**）；调
  `formsService.createRecord(actor, currentUser, { slotKey, subjectType: 'employee',
subjectId: currentUser.id, definitionRevision, values }, audit)`；返回 `{ recordId: record.id }`。
- `@Global()` 的理由：Nest 注入器按模块作用域隔离，`PresenceModule` 内的服务要解析到宿主提供的
  token，只有「provider 所在模块标 @Global」或「PresenceModule 动态注册」两条路；选前者（机械量最小，
  且该 token 全应用单义）。`GatewayModule` imports 数组加 `PresenceFormsLinkModule`。
- **业务逻辑禁止入适配器**：只做 actor 构建 + 参数转发 + 返回收窄，任何校验/编排都在 presence 或
  forms 服务内。适配器不 catch、不改写异常。
- `apps/gateway-api/package.json` 如缺 `@work/presence-api` 之外的依赖声明无需动（forms-api 已依赖）；
  Nx tags 对 `apps/*` 无模块边界限制（组合宿主的本职）。

### 2.8 装配与向后兼容

- `PresenceModule` 本身**零改动**（不 import forms 任何东西；`@Optional()` 使无宿主装配的单测/独立
  启动不炸）。
- 向后兼容：不带 `form` 的登记请求行为与 M9-1 完全一致（现有 `presence.e2e-spec.ts`、
  `presence-status.service.spec.ts` 必须不改断言全绿——它们就是回归护栏）。注意
  `presence.e2e-spec.ts` 在 **`test:e2e:postgres` 门内**（本地无 PG 会静默跳过），in-memory 侧的
  护栏由单测 + 新 e2e 的「不带 form」场景承担。

## 3. 模块结构增量

### `modules/forms/contract`

```
src/slots.ts             # FormSlotDefinition +dataType/+subjectType；presence fallback 激活+常量化
src/permissions.ts       # +presenceDefinitionView/Manage（常量+定义）
src/platform-manifest.ts # +两条权限（进 seed 的唯一通道）
src/ports.ts             # createRecord 签名 +currentUser；+getRecordById
```

### `modules/forms/api`

```
src/forms/forms.service.ts           # loadAuthorizedSubject 参数化；createRecord subject 门；+getRecordById
src/forms/forms-record.controller.ts # +GET by-id/:recordId
src/forms/forms.service.spec.ts      # 新增/翻转断言（见 §4.2）；存量 createRecord 直调点机械补 currentUser 参数
src/index.ts                         # +export FormsService（供宿主适配器 import，见 §2.7）
```

### `modules/presence/contract`

```
src/status.dto.ts        # CreatePresenceStatusRecordInput +form?；+CreatePresenceStatusRecordFormInput
```

### `modules/presence/api`

```
src/forms-link/presence-forms-link.port.ts   # 新：token + 端口接口（零 forms import）
src/index.ts                                 # export 端口
src/status/presence-status.service.ts        # @Optional 注入 + ③a 编排 + 审计 metadata
src/db/presence.repository.ts                # createRecord options.formRecordId
src/db/postgres-presence.repository.ts       # INSERT 列
src/db/in-memory-presence.repository.ts      # 同步
src/db/postgres-presence.repository.integration.spec.ts  # +formRecordId 写读断言
src/status/presence-status.service.spec.ts   # fake link 编排单测
```

### `apps/gateway-api`

```
src/forms-link/presence-forms-link.adapter.ts  # 新
src/forms-link/presence-forms-link.module.ts   # 新（@Global）
src/gateway.module.ts                          # imports +PresenceFormsLinkModule
src/presence-registration-forms.e2e-spec.ts    # 新：整链 e2e（见 §4.2）
src/forms-definition.e2e-spec.ts               # reserved-404 断言翻转（§2.2）
```

### `apps/platform-api`

```
src/seeds/seed-data.spec.ts   # 两处翻转（§2.2；派生精确清单不动）
```

### 根 `package.json`（⚠️ 必改，否则新 e2e 假绿）

`test:e2e` 是**显式文件枚举不是 glob**：`presence-registration-forms.e2e-spec.ts` 必须追加进该
script 字符串，并在本地确认 `pnpm test:e2e` 输出里**看到该文件被收集**（文件数从 9 变 10）。

### `docs`

见 §7。

## 4. 验证

### 4.1 命令（全过）

```bash
pnpm verify        # lint + typecheck + test + test:e2e + build
# 有本地 Postgres 时（formRecordId 写路径真跑，别假绿）：
pnpm verify:full
```

PG 门确认：`test:db` 输出必须显示 presence integration spec 实际执行（非 skip），断言数较 M9-1 基线
（38）增加。

### 4.2 断言（必须覆盖）

**forms 单测（`forms.service.spec.ts`）**

- `createRecord`：subject=self + `presence` self scope → 通过；subject=他人（self scope）→ 404；
  subject 不存在 → 404；`input.subjectType` 与 slot 不符 → 404；缺 `forms:record:submit` → 404
  （**不是 403**）；revision 不符 → 409；profile 家族槽位走 `'profile'` scope、presence 家族走
  `'presence'` scope（两个 dataType 分别断言，防映射写反）。
- `getRecordById`：本人记录 → 200；scope 外记录 → 404；不存在 → 404；缺 `forms:record:view` → 404；
  presence 家族记录按 `'presence'` scope 判定。
- slots：`resolveActiveFormSlot('presence.status.business_trip')` 返回激活槽位且
  `dataType==='presence'`、权限码 === `formsPermissions.presenceDefinition*` 常量。
- by-subject 两条旧路径行为不变（现有断言不改仍绿）。

**presence 单测（`presence-status.service.spec.ts`，fake `PresenceFormsLinkPort`）**

- 带 `form` 登记：fake 被调用且 slotKey === `presence.status.<key>`、subject 语义由适配器兜底（fake
  断言 currentUser 透传）；返回 recordId 落到 repo `options.formRecordId`；审计 metadata 含
  formRecordId。
- fake 抛 409/404 → 原样冒泡，repo.createRecord **未被调用**（次序 ③a→③b 的直接断言）。
- 带 `form` 但未注入 link → 抛错（500 语义），repo 未被调用。
- 不带 `form` → fake 不被调用、`formRecordId` undefined（向后兼容）。
- `form` 形状非法（revision 非数 / values 非数组）→ 400。

**e2e（`presence-registration-forms.e2e-spec.ts`，in-memory，整链）**

- admin PUT `/api/forms/definitions/presence.status.business_trip`（1 个必填 text 字段）→ 200
  （激活 + guard + 空定义自动建，一并验证）。
- `createAndLoginUser(['presence:status:create','forms:record:submit','forms:record:view',
'forms:presence-definition:view'], [{dataType:'presence',scope:'self'}], ...)` 员工。⚠️ 该助手建
  员工**不设 departmentId**（`people-aggregation.e2e-spec.ts:204-218`），而 presence 登记对无部门
  用户直接 403『缺少部门信息』（`presence-status.service.ts:110-112`）——登记用户必须先建部门并
  挂上（先例：`presence.e2e-spec.ts:202-227`）。之后：
  - GET 定义 → 200（读定义门 = view 权限，沿 M8 先例）；
  - POST `/api/presence/status-records` 带 `form{definitionRevision:1, values}` → 201，响应
    `formRecordId` 非空；
  - GET `/api/forms/records/by-id/<formRecordId>` 本人 → 200，values 回读一致；
  - **append 不覆盖**：第二次登记（不重叠时段）→ 新 `formRecordId` ≠ 第一次；两条 by-id 读各自
    values 独立完好；
  - 不带 `form` 登记（remark only）→ 201，`formRecordId` 为空（向后兼容）；
  - revision 过期 → 409，且本人 `GET /api/presence/status-records/mine` **无新增记录**（③a 失败不建
    presence 记录的整链断言）。
- 越权矩阵：
  - 另一 self-scope 用户 GET by-id 他人记录 → 404；
  - 缺 `forms:record:submit` 的用户（有 `presence:status:create`）带 `form` 登记 → 404 且 mine 无新增；
    （注意：**不要**写「缺 presence 数据范围登记 → 404」这类断言——`resolveScope` 对未授权 dataType
    回退 `self`，subject 恒本人时必过，该负例实际得 201；scope 门的真负例由 by-id 读他人 404 与
    forms 单测 subject=他人 覆盖，不得为凑绿改动 scope 回退语义）；
  - 请求体夹带 `formRecordId: '<uuid>'` → 被忽略（201 后记录的 formRecordId 为空或为服务端生成值，
    **绝不等于注入值**）。
- **自定义 key 整链**（RFC §15-3 的「建类型」起点，不能只用预置 key）：admin
  `POST /api/presence/status-types` 新建 `vip_visit` → PUT `presence.status.vip_visit` 定义 →
  员工登记该状态带填报 → 201 + `formRecordId` 关联 + by-id 回读一致（顺带覆盖安全门禁判定 8 的
  拼接链：slotKey 由服务端用字典规范 key 拼出）。
- 守护翻转联动：seed 权限含 `forms:presence-definition:{view,manage}`（unit 已断言，e2e 用 admin 拿
  定义即隐式覆盖）。

**PG 集成（`postgres-presence.repository.integration.spec.ts`）**

- `createRecord` with `formRecordId` → 读回一致；不带 → NULL。

## 5. 退出标准

1. `presence.status.<key>` 槽位激活，定义 GET/PUT 经 `FormsDefinitionPermissionGuard` 对该家族生效；
   `forms:presence-definition:{view,manage}` 进 contract 常量 + manifest + seed，守护测试两处翻转一致
   （派生精确清单保持派生，不硬编码）。
2. `FormSlotDefinition` 含 `dataType`/`subjectType` 单源；fallback 权限码引用常量（字面量双源消除）。
3. `FormsService.createRecord` 具备完整 subject 数据范围授权（矩阵 §4.2 全绿）；`getRecordById` +
   `GET /forms/records/by-id/:recordId` 落地，slot 家族映射正确、越权/缺权/不存在统一 404。
4. presence 出站端口 + gateway `@Global()` 适配器接线；适配器零业务逻辑、actor 无提权、subject 恒本人。
5. 登记整链 e2e 绿：配定义 → 带填报登记 → `formRecordId` 关联 → by-id 回读 → append 不覆盖 →
   403/404/409 负路径 + ③a 失败不建 presence 记录；预置 key 与**运行时新建自定义 key** 两条链都覆盖
   （RFC §15-3）。
6. `CreatePresenceStatusRecordInput.form` 可选、拒收 `formRecordId` 注入；不带 `form` 的现有链路
   断言零修改全绿（向后兼容护栏）。
7. repository 双实现 `formRecordId` 写路径同步，PG 集成真跑（非 skip）新断言。
8. 根 `package.json` `test:e2e` 已枚举新 spec 文件且本地确认被收集（9→10）。
9. `pnpm verify` 全绿；本地有 PG 则 `pnpm verify:full` 全绿并在 PR 描述给出计数。
10. security-reviewer 独立二审通过（§0 安全门禁判定 9 条逐条核）；PR 合并前 Codex-connector 线程全部
    resolve。

## 6. 必须保持不变（避免越界）

- `getRecordBySubject` / `upsertRecordBySubject` 行为与 M8 完全一致（`assertProfileEmployeeSlot` 不动）。
- 旧 `FormsPort.getRecord` port-only 方法与警告注释保留。
- presence 现有端点路由/守卫（`presence/status-records` 家族、status-type 家族）不变。
- `presence.status.changed` 事件契约不变（M9-1 已含 `statusLabel`）。
- M7 通知链路、M8-5b 人页聚合、profile 首登向导不受影响（现有 e2e 全绿即证）。
- 不动 `db:setup` 链、无新迁移、不改任何既有迁移文件。
- gateway 不新增任何业务端点（适配器只做 DI 接线）。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：§6.6 M9-2 行 Pending→Done（含 PR 号/要点）；§7.5 forms
  `getRecord` follow-up 行标注「已由 `getRecordById`（带 slot 数据范围门）收口（M9-2）」。
- `docs/module-contract.md`：forms 记录路由补 `GET /forms/records/by-id/:recordId`；forms 权限清单补
  两条 presence-definition；presence 登记请求体补 `form` 块；「自助登记角色配置口径」四件套写明。
- `docs/architecture.md`：forms 槽位表 presence 家族状态 reserved→active + dataType 映射说明；模块
  组合图补「宿主适配器（出站端口）」一笔（presence→(port)→gateway adapter→forms）。
- `docs/verification-log.md`：新增「M9-2 Self-Registration v2 + Forms Generalization」小节（命令
  输出计数 + 断言矩阵结论 + security-reviewer 结论）。
- `docs/doc-index.md` §7：登记本任务包。

## 8. 提交规范

- 分支 `feat/m9-2-self-registration-forms`；Conventional Commits（如
  `feat(forms): generalize record subject authorization and activate presence slots`、
  `feat(presence): orchestrate forms append record via host-provided forms link port`）。
- 不提交 `node_modules` / `.env` / 构建产物；lockfile 若无依赖变化不应有 diff（本切片**零新依赖**）。
- PR 描述给出 §4.1 命令输出计数（e2e 文件数 9→10 必须体现）与 §4.2 矩阵勾选。
