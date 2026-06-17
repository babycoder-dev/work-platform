# RFC: M8 人员 / 组织 / 档案

## 状态

Draft（独立二审已修订，待最终拍板）｜ 起草 + 二审修订 2026-06-17 ｜ 依据 `docs/product-requirements.md` §4.4、§3、§8，`docs/adr/0005-product-replan-roadmap.md`

> 二审（独立 sub-agent）发现并已修订：B1 M7 未实现 `profile.updated` 订阅器（M8 须自建消费）、B2 复用既有
> `platform:org:*` 不新发明部门权限、M2 `profile` scope 首次用于写授权属数据范围模型扩展（同变更补 baseline）、
> M3 `me` 路由顺序 + 窄 DTO 防越权、M4 platform-contract 事件契约本期新建。详见 §3/§6/§7/§8/§9/§13/§17/§19。

> 阅读约定沿用需求文档：每项能力标 **【本期做】/【预留】/【不做(vNext)】**。预留项必须留好
> 数据模型 / 接口 / 事件名并写清未来用途，不留无人知晓的空白字段。

## 1. 目标

把"以人为中心的组织管理"补成可用基座：部门管理、账号创建与首登补全、档案（系统固定字段 +
HR 可自定义字段）、个人信息编辑（本人 / 按数据范围管他人）、近况记录。M8 是**第一个真正"用满"
前面三块共用基建（M5 角色/数据范围、M6 动态表单/文件、M7 通知/调度）的核心业务里程碑**——
不重造已有能力，而是把 platform 里半成品的 org/employee 补满，并把档案的自定义字段、被改通知、
照片文件等接到 M5/M6/M7 已建的接缝上。

本期具体交付：

1. **部门管理做满**：树形结构（本期展示两层）的增删改、人员归属调整、负责人设置；现仅有 list/create。
2. **账号创建 + 首登补全**：HR/管理员后台建账号 → 员工首次登录改密（复用既有 `must_change_password` +
   `POST auth/change-password`）+ 补全个人信息。
3. **档案编辑**：本人改本人；HR 等按 `profile` 数据范围改他人；所有"写档案"操作**收口到一个 service**，
   未来插审核关只改一处。
4. **被他人修改 → 通知本人**：M8 作为生产者发 `profile.updated` 事件，**并在 notification 模块新增该事件的
   订阅器 + handler**（M7 只预留了事件名字符串，订阅消费一行未写——见 §3/§6），接通 M7 ④触发点。
5. **HR 自定义档案字段**：直接消费 M6 forms `profile.employee` 槽位（已 active），不重造表单引擎。
6. **近况记录**：事件脉络节点（记录人/时间/纯文本内容），支持批量给多人添加；可见/新增权限随档案数据范围。
7. **预留位落地**：注册/审核状态位、Excel 批量导入、建档审核关——本期均**留好数据/接口位**，不实现。

## 2. 非目标

- **不新建 `modules/profile` 业务模块**（§4 决策）：人员/组织/账号/档案核心是全系统身份与组织主干，
  留在 platform-api / `platform.*`；新建独立模块会击穿安全基线与既有端口，无收益。
- **不重造表单引擎**：HR 自定义字段=消费 M6 forms `profile.employee` 槽位；M8 不写第二套字段定义/记录表。
- **不做建档审核 / 员工自助注册审核**【预留】：本期录入即 `active`；留状态位 + 写操作收口 service，未来插关。
- **不做 Excel 批量导入**【预留紧随其后】：本期做查看/导出方向的数据就绪，导入接口位留好不实现。
- **不做部门多层嵌套的完整展示与管理**：表结构已树形（`parent_id`），本期只展示/管理两层；多层属 vNext。
- **不做在位 v2 / 日报**：那是 M9 / M10；M8 只把档案数据与事件备好供其消费。
- **不把在位（presence）并入人员域 schema**：presence 保持独立模块独立 schema，人页的"档案+在位+近况"
  一体由**前端聚合**（§3 UX 原则的技术注解），不在后端合并 schema。

## 3. 现状盘点（现状决定本期只补缺口，不重造）

| 现状                             | 结论                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform.departments`           | 已是**树形**：`parentId`、`managerUserId`(→employees)、`sortOrder`、`status`、软删 `deletedAt`。结构齐全，**缺写操作**。                                                                                                                                                                  |
| `OrgService`                     | 仅 `listEnterprises/listDepartments/createDepartment`。**无 update/delete/移动/改负责人**；list 不按数据范围过滤（部门列表本期定性见 §7）。                                                                                                                                               |
| `platform.employees`             | 系统固定字段已全：`name/employeeNo/account/departmentId/title/mobile/email/status/mustChangePassword` + 软删 `deletedAt`。**缺 `registration_status` 预留位**。                                                                                                                           |
| `EmployeeService`                | 有 `listEmployees`(按 `profile` scope 过滤)/`createEmployee`/`updateStatus`/`assignRoles`/`resetPassword`。**无通用档案字段编辑、无本人自助编辑、无按 id 取详情、不发 `profile.updated`**。                                                                                               |
| 改密                             | `POST auth/change-password` + `AuthService.changePassword` 已清 `mustChangePassword`、校验旧密码/新旧不同/停用账号拒绝。**首登补全直接复用**。                                                                                                                                            |
| M6 forms `profile.employee` 槽位 | 已注册 `active / singleton / ownerModule='profile'`，权限 `forms:profile-definition:{view,manage}`。**HR 自定义字段即此槽位**，M8 消费不重造。                                                                                                                                            |
| M7 `profile.updated`             | **仅预留了事件名字符串常量**（`notification-contract` `events.ts` 注释明写 "reserved for M8; M7-2 does not subscribe"）。**订阅器/handler/recipient/文案一行未写**；platform-contract 里也**无** payload 类型。M8 要：① platform 侧定契约+生产事件；② notification 侧新增订阅器+handler。 |
| `platform:org:*` 权限点          | **已存在**：seed `platform-module-manifest.ts` 已有 `platform:org:view`/`platform:org:manage` + `/platform/org` 组织架构菜单，`modules/platform/web` 已有 `OrganizationPage`（半成品）。部门读写**复用 `platform:org:*`，不新发明**。                                                     |
| `profile` 数据范围               | `role_data_scopes.data_type IN ('profile','presence','report')`，`PlatformScopeService.resolveScope(user,'profile')` 已可用；`EmployeeService.listEmployees` 已按它过滤。**档案/近况的数据范围直接复用**。                                                                                |
| `PlatformOrgPort`                | M7 已落 `resolveDepartmentManager` / `listUserIdsByRole`（只读 id，进程内 Symbol 注入）。M8 视需要在同范式下扩读端口。                                                                                                                                                                    |
| 种子角色 code                    | 端口/需求按 `company_head/hr/assistant/department_manager` 语义解析（M5 seed 已建角色体系，admin 为系统角色）。                                                                                                                                                                           |

约束沿用：单 PostgreSQL、schema-per-module 隔离、统一错误信封、`@RequirePermissions`、领域事件协作、
phantom-token 跨进程鉴权、写档案审计（`AGENTS.md` / `docs/security-baseline.md` / `apps/platform-api/CLAUDE.md`）。

## 4. 模块边界（中心决策）

### 4.1 人员/组织/账号/档案核心 = 留在 platform-api / `platform.*`（不新建模块）

回答需求 §8 待解决 #1（人员域模块组织）。**决策：核心留 platform**，理由：

- `platform.employees` / `platform.departments` 是**全系统身份与组织主干**——`user_roles`、`sessions`、
  scope resolver、`PlatformEmployeeLookupPort` / `PlatformOrgPort`、phantom-token introspection 全部直接
  外键/依赖它们。搬出 `platform.*` 会击穿安全基线与 schema 隔离，代价极大且无收益。
- `apps/platform-api/CLAUDE.md` 明确 platform 职责即 "users / org / rbac / auth"。M8 是**补满已有半成品**
  （department CRUD、档案编辑、首登补全），不是新增业务模块。
- forms 槽位 `ownerModule='profile'` 是**逻辑归属标签**，不要求独立进程/schema。
- "以人为中心 UX" 是**前端聚合层**的事（人页拼档案+在位+近况），不要求后端合模块——与需求 §3 技术注解
  ("技术上仍受平台模块/schema 隔离约束")一致。

### 4.2 近况记录的归属（本 RFC 唯一真正"新"数据域）—— 决策：放 `platform.*`

近况记录可见/新增权限**随档案数据范围走**（需求 §2.2/§4.4），而 `profile` 数据范围解析就在
`PlatformScopeService`，且近况与 employee 强绑定（`subject_id = employee.id`）。**放 `platform.*` 可直接
复用 scope 解析与 employee 身份，避免把 scope 能力导出到新模块或跨 schema 读身份**。

- **选项 A（采纳）**：`platform.*` 新增 `status_logs` 表，归 platform-api。复用 platform scope/audit。
  代价=platform 轻微膨胀（承载一个偏"活动流"的表），可接受且**可逆**：未来若长成 CRM 活动流再抽
  `modules/profile`。
- **选项 B（否决）**：新建 `modules/profile`(独立 `profile.*`) 只装近况+自定义字段编排。更"纯"，但真正成本是
  **跨 schema 读 employee 身份 + 新模块脚手架**——复杂度显著上升，本期收益不足。（注：`profile` scope 解析
  **不必复制**，可像 M7 `PlatformOrgPort` 那样端口化暴露，这部分成本不高；反对理由不在 scope 复制，而在
  跨 schema 读身份与新脚手架。）

> **本项为二审重点质疑项**：若评审认为 platform 不应承载"活动流"语义、宁可现在就立 `modules/profile`，
> 在二审推翻并改 §5/§7/§11。

### 4.3 自定义档案字段 = 消费 M6 forms，聚合在前端

- HR 配置"员工信息表单有哪些字段" = M6 forms `profile.employee` 槽位的**字段定义管理**
  （`forms:profile-definition:manage`，M6 已交付 UI/API），M8 **不重造**。
- 一个员工的完整档案 = `platform.employees` 行（系统固定字段）+ forms `profile.employee` 单例记录
  （HR 自定义字段值，存 `forms.*`）。**二者聚合在前端人页完成**（shell 分别调 platform 档案 API +
  forms 记录 API），不做后端跨进程编排——符合"UX 层聚合 + 进程/schema 隔离"。
- 档案照片 / 自定义文件字段 = M6 files + forms 文件字段类型，M8 复用。

## 5. 数据模型与迁移

`platform.*`（沿用既有 `db:migrate` 入口，不新开迁移入口——核心留 platform）。

### 5.1 employees 增列（预留位）

- `registration_status varchar(32) NOT NULL DEFAULT 'active'` —— 取值 `active | pending`。
  【本期】HR 录入即 `active`；【预留】员工自助注册落 `pending` 待审核，未来只改写入 service 一处 + 审核接口。
  加 check 约束限定取值。

> 系统固定字段已齐，本期**不**给 employees 加业务档案字段（出生日期/性别等走 M6 自定义字段，存 `forms.*`）。

### 5.2 新增 `platform.status_logs`（近况记录）

- `id uuid pk`、`enterprise_id uuid notNull`、`subject_employee_id uuid notNull`(→employees，近况归属的人)、
  `author_employee_id uuid notNull`(→employees，记录人=当前用户)、`content text notNull`(纯文本)、
  `created_at timestamptz notNull default now()`、软删 `deleted_at`(预留撤销)。
  > 命名注：platform 里 user==employee（`user_roles.userId`→employees.id），scope 解析主键即 employee.id；
  > 字段用 `*_employee_id` 与 schema 既有外键命名一致，避免 user/employee 混用歧义。
- 索引：`(enterprise_id, subject_employee_id, created_at desc)`（按人取脉络）。
- **批量添加**=一次请求多个 `subjectEmployeeId` → 展开为多行（每人一条，`author/content/created_at` 同值）。

### 5.3 迁移与双实现

Drizzle schema 同步 + Repository 双实现（memory + postgres，沿用 `PLATFORM_REPOSITORY_DRIVER` gate）。
`db:setup` 链顺序不变（platform → presence → files → forms → notification → seed），M8 增列/表并入
platform 迁移。

## 6. 事件契约

- **`profile.updated`**【本期生产】：契约**本期在 `packages/platform-contract` 新建**（payload 类型 + 事件名
  常量）——现状是 platform-contract **空的**、notification-contract 里只有一个孤立字符串常量
  `notificationTriggerKeys.profileUpdated`；M8 新建 payload 类型后，让 notification 侧引用同一事件名（生产者
  platform 拥有事件契约，与 M7 §23-3 方向一致）。payload 至少：
  `{ enterpriseId, subjectUserId, changedBy, changedFields: string[] }`。
  > 依赖方向合法性：`modules/notification/api` 依赖 `@work/platform-contract` 属 module→package，符合
  > `packages/CLAUDE.md` 单向依赖规则（package 不可依赖 modules，反向合法）。
  - 发出时机：**他人**修改某员工档案成功后（本人改本人**不发**，避免自己通知自己——与需求 §4.4 "被他人修改
    → 通知本人" 一致）。`changedBy === subjectUserId` 时跳过。
  - **notification 侧本期新增**订阅器 + `handleProfileUpdated`：收到即给 `subjectUserId` 生成 `in_app` 通知。
    **接收人 = `subjectUserId` 本人**，直接取自 payload，**不经 RecipientResolver 的角色/部门负责人解析**
    （与 presence ③的 recipient 路径不同，勿套用）。文案最小披露（"你的个人信息被 X 修改"，不贴字段值，
    符合 M7 §15）。④是否要 `trigger_config` 的 enabled 开关由 M8-3 定（若要则 seed 一条 trigger config）。
- **明确不发事件**：给某人**新增近况记录不通知**本人（需求 §4.3/§4.4）——M8 不为 status_logs 注册任何触发点，
  并在事件契约注释标注此决策防误加（与 M7 `events.ts` 同款注释规约）。

## 7. HTTP API（契约）

部门（`/api/platform/...`，沿用 platform 路由前缀；权限走 `@RequirePermissions`）。**复用既有
`platform:org:view`（读）/ `platform:org:manage`（写），不新发明权限点**（§3 已盘点二者已 seed）：

| 方法   | 路径               | 说明                            | 权限                  |
| ------ | ------------------ | ------------------------------- | --------------------- |
| GET    | `/departments`     | 部门列表（树形，本期展示两层）  | `platform:org:view`   |
| POST   | `/departments`     | 新建部门（已存在）              | `platform:org:manage` |
| PUT    | `/departments/:id` | 改名/改负责人/改排序/移动父部门 | `platform:org:manage` |
| DELETE | `/departments/:id` | 删除部门（软删；占用校验见下）  | `platform:org:manage` |

> **占用删除 409 判定**：仅当存在 `status='active' 且 deleted_at IS NULL` 的归属人员、或存在
> `deleted_at IS NULL` 的子部门时拒删（软删的人员/子部门不计入），避免误触 409。

员工/档案（**`me` 字面量路由必须先于 `:id` 通配注册**，否则 `GET /employees/me` 会被 `:id` 捕获、
误要 `platform:employee:view`，使只有 self 范围、无 view 权限的普通员工拿不到本人档案）：

| 方法 | 路径                      | 说明                                               | 权限                                                |
| ---- | ------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| GET  | `/employees`              | 列表（已存在，按 `profile` scope 过滤）            | `platform:employee:view`                            |
| GET  | `/employees/:id`          | 档案详情（系统固定字段；自定义字段前端另调 forms） | `platform:employee:view` + 归属/范围校验            |
| POST | `/employees`              | 建账号（已存在）                                   | `platform:employee:create`                          |
| PUT  | `/employees/:id/profile`  | **管理改他人**档案（管理 DTO 含 departmentId 等）  | `platform:employee:manage` + `profile` 写范围（§8） |
| GET  | `/employees/me`           | 本人档案（自助查看/补全用）                        | 登录态                                              |
| PUT  | `/employees/me/profile`   | 本人改本人档案（首登补全复用）                     | 登录态                                              |
| PUT  | `/employees/:id/status`   | 改账号状态（已存在）                               | `platform:employee:manage`                          |
| PUT  | `/employees/:id/roles`    | 角色分配（已存在）                                 | `platform:role:assign`                              |
| PUT  | `/employees/:id/password` | 重置密码（已存在）                                 | `platform:employee:manage`                          |

近况记录：

| 方法 | 路径                         | 说明                                                    | 权限                                                                  |
| ---- | ---------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| GET  | `/employees/:id/status-logs` | 某人近况脉络（分页，按 `profile` 范围可见）             | `platform:employee:view` + 范围校验                                   |
| POST | `/status-logs`               | 新增近况（body 含 `subjectUserIds[]` 批量 + `content`） | `platform:status-log:create` + 对每个 subject 的 `profile` 写范围校验 |

> 首登补全**不引入新端点**：复用 `POST auth/change-password`（清 `mustChangePassword`）+ `PUT /employees/me/profile`
> （补全字段）。前端在 `mustChangePassword=true` 时强制走改密+补全向导。

归属/范围校验：`/employees/:id*` 与 `status-logs` 的可见/可写以 `PlatformScopeService.resolveScope(user,'profile')`
为准；越权返回统一错误信封（不泄露存在性，沿用 forms `getRecord` 404 范式）。

## 8. 数据范围与写档案收口

- **读**：`profile` 范围（`self/department/department_tree/company`）已在 `listEmployees` 生效；
  `:id`/详情/近况一并按此校验。
- **⚠️ `profile` scope 首次用于「写授权」（数据范围模型语义扩展，非单纯复用）**：现存代码里 `profile` scope
  **只用于读过滤**（`listEmployees`→`matchScope`）。M8 第一次把它用作**写授权门禁**（本人写自身、管理写他人、
  批量近况逐条写校验）。"把只读过滤的 scope 提升为写授权"属**数据范围模型的语义扩展**，按 §13/§16 须在
  落地切片**同变更补 `security-baseline.md` §5** 一段说明 profile 写范围规则，**不只是 reviewer 二审**。
- **写档案的两条路径**：
  1. **本人改本人**（`/employees/me/profile`）：登录态即可，但**用独立的窄 DTO**——字段白名单仅
     `name/title/mobile/email` 等自助字段，**在 DTO/controller 层强制剔除** `status/roles/departmentId`
     等管理字段（否则本人可借此给自己改部门=越权）。收口 service 接收的是已分流的字段集。
  2. **管理改他人**（`/employees/:id/profile`）：`platform:employee:manage` + 目标在 `profile` 写范围内
     （HR=全公司、部门负责人=本部门），用管理 DTO（含 departmentId 等管理字段）。
- **写档案收口到单一 service 方法**（需求 §4.4）：所有档案写（本人/管理/未来导入/未来自助注册）都经
  `EmployeeService` 的一个收口写方法，内部统一做：范围校验 → 落库 → 审计 → 按"是否他人改"决定发
  `profile.updated`。**未来插"HR/副负责人审核关"只改这一处**。

## 9. 权限点（platform manifest 增补）

- `platform:org:view` / `platform:org:manage`【**已存在**，复用】—— 部门读 / 增删改设负责人。**M8 不新发明
  department 权限点**（§3/§7：二者已 seed，再造会与 `org:*` 语义重叠、seed 双套组织权限）。
- `platform:status-log:create`【本期新增】—— 新增近况记录。挂有档案管理范围的角色（HR / 部门负责人等，
  具体由角色配置，不写死）。**唯一本期新增的权限点。**
- `platform:employee:view` / `platform:employee:create` / `platform:employee:manage`【已存在】—— 复用于
  列表/详情读、建账号、改他人档案/状态/密码。
- 自定义字段定义管理沿用 M6 `forms:profile-definition:manage`【已存在】，M8 不新增。

> 新权限点（仅 `platform:status-log:create`）必须同时进 **platform manifest + seed**（与 M5/M7 同规），
> 否则 RBAC 不认。`OrganizationPage` 已挂 `platform:org:view` 菜单，M8 在其上补部门 CRUD 即可。

## 10. 前端范围（workbench-shell + 模块页）

- **人员/组织管理页**（**扩展既有 `modules/platform/web` 模块**——`RolesPage`/`EmployeesPage`/`OrganizationPage`
  已在其中，M8 在 `OrganizationPage`（`platform:org:view` 菜单已挂）补部门 CRUD，在员工页补建档/编辑/近况；
  沿用 manifest 声明 route+menu 范式，`platform:org:manage`/`platform:employee:*` gate）：部门树管理、员工列表/
  建档/编辑/状态/角色/重置密码、近况记录录入（含人员选择器批量选）。
- **人页（以人为中心聚合）**：一个人的档案（固定字段 + 调 forms `profile.employee` 取自定义字段值）+ 当前在位
  状态（调 presence API）+ 近况脉络（调 status-logs）。**聚合在前端**，是 UX 一体的核心载体。
  > 前端聚合的鉴权可行性：forms 与 platform 经 gateway **同进程装配、同一令牌分别鉴权**（两个请求各过全局
  > `PlatformAuthGuard`+`PermissionGuard`），不引入跨进程编排。**优雅降级**：forms `getRecord` 缺权限/无记录返
  > 404（防枚举），人页必须容忍"固定字段有、自定义字段 404"——显示固定字段 + 自定义区留空，**不得整页报错**。
- **首登向导**：`mustChangePassword=true` → 强制改密（`auth/change-password`）+ 补全本人档案
  （`/employees/me/profile`）后才进工作台。
- **人员选择器**复用 M6 forms 的人员字段选择器组件（批量加近况、未来 @人 用）。
- 前端测试走 `vitest.web.config.mts`（jsdom，`NODE_ENV=test`，避免生产 React 剥离 `React.act` 假挂）。

## 11. Schema / 迁移落点小结

- `platform.employees` 增 `registration_status`（默认 `active` + check）。
- `platform.status_logs` 新表（§5.2）。
- 二者并入既有 `db:migrate`（platform 迁移入口），`db:generate` 同步 Drizzle，双实现 repository。
- 不新开迁移入口、不动 db:setup 链顺序。

## 12. 测试要求

- **单元**：写档案收口 service（本人 vs 他人范围分支、`profile.updated` 发/不发判定）、部门 CRUD（占用删除
  409）、近况批量展开、范围校验（self/department/company）。
- **e2e（in-memory）**：建账号 → 首登 `mustChangePassword` → 改密 + 补全 → 档案可见；他人改档案 →
  `profile.updated` → notification 新增 handler 落库通知本人（跨"platform 生产 + notification 消费"链路，
  在 gateway 同进程装配下验证）。**双向断言**：他人改 → notification 表出现 `recipient=subjectUserId` 记录；
  **本人改本人 → 不产生记录**（验证去自身逻辑，防假绿）。越权读/写他人档案被拒；近况批量给多人。
- **web**：人员管理页、人页聚合、首登向导、近况录入（`*.spec.tsx`）。
- **Postgres-gated**：platform repository 集成测试覆盖新表/新列（env-gated，注意"假绿"——确认 gate 真跑过，
  source-review 判定而非裸 grep）。
- 验收禁止假数据/占位蒙混。

## 13. 安全要求（**M8 属安全敏感，强制 security-reviewer**）

M8 落在 `apps/platform-api/src/{users,org,repositories}` + 迁移 + 新权限点 + 可能触及 `auth`（首登流）+
新增 `profile.updated` 事件携带的字段。按 `apps/platform-api/CLAUDE.md` 与 `docs/security-baseline.md` §16
变更门禁：

- **`profile` scope 首次用于「写授权」= 数据范围模型语义扩展（须同变更更新 baseline，不止 reviewer）**：
  详见 §8 ⚠️ 条。现存 `profile` scope 仅用于读过滤；M8 将其提升为写授权门禁（本人写自身字段子集 /
  管理写他人 / 批量近况逐条写校验）。按 `apps/platform-api/CLAUDE.md` 第 2 条与 security-baseline §16，
  "data-scope model 变化"属"改了规则本身"——M8-2 / M8-4 落地切片**同变更内补 `security-baseline.md` §5**
  说明 profile 写范围规则，**code-only 不完整**。
- **纯扩展项（不改规则本身）**：增列 `registration_status`(默认值不改鉴权)、新表 status_logs 结构、新功能
  权限点 `platform:status-log:create`——属既有模型内扩展，但**因落在 repositories/migrations 子树 + 触及档案
  读写范围，仍强制走 security-reviewer 独立二审**（本里程碑每个触及上述面的切片合并前都要过）。
- 若某切片**确实改了数据范围模型 / 鉴权规则 / 敏感字段定义**（如档案字段进入 token、自助注册改鉴权路径），
  §16 要求**同一变更内**更新 `security-baseline.md` 或新增 ADR，code-only 不完整。
- `profile.updated` 事件 payload **只带 id + 变更字段名，不带字段值**（最小披露，防越权信息泄露，沿用 M7 §15）。
- 档案详情/近况严格按 `profile` 范围校验，越权不泄露存在性。
- 写档案收口 service 是未来审核关的唯一插入点，**不得在 controller 旁路写档案**。

## 14. 审计

- 档案写（本人/他人）、部门增删改、近况新增、角色/状态/密码（已有）→ 写审计（actor、目标、前后值/变更字段）。
- 近况内容属业务数据，审计记 metadata（subject、长度/摘要）即可，不必整文重复落审计。

## 15. 本期做 / 预留 / 不做

| 能力                                          | 状态              | 说明                                               |
| --------------------------------------------- | ----------------- | -------------------------------------------------- |
| 部门树 CRUD + 设负责人 + 人员归属             | 本期做            | 展示两层，表结构树形                               |
| 账号创建 + 首登改密 + 补全                    | 本期做            | 复用 `mustChangePassword` + `auth/change-password` |
| 档案编辑（本人/按范围管他人）+ 写收口 service | 本期做            | 单一写入点，未来插审核关                           |
| 被他人修改→通知本人（`profile.updated` 生产） | 本期做            | 点亮 M7 ④预留链路                                  |
| HR 自定义档案字段                             | 本期做（消费 M6） | forms `profile.employee` 槽位，不重造              |
| 档案照片 / 文件字段                           | 本期做（消费 M6） | files + forms 文件字段                             |
| 近况记录（含批量给多人）                      | 本期做            | `platform.status_logs`，权限随 profile 范围        |
| 注册/审核状态位                               | 预留              | `registration_status` 增列，本期恒 `active`        |
| 员工自助注册 + 审核                           | 预留              | 写收口 service + 状态位就位，未来插审核接口        |
| 建档审核关                                    | 预留              | 写收口 service 单点，未来插 HR/副负责人审核        |
| Excel 批量导入员工                            | 预留（紧随其后）  | 导入走同一写收口 service；本期不实现接口           |
| 给近况新增→通知本人                           | 不做              | 需求明确不通知                                     |
| 部门多层嵌套完整展示/管理                     | vNext             | 表结构已 `parent_id` 预留                          |
| 把 presence 并入人员域 schema                 | 不做              | presence 独立模块，人页前端聚合                    |
| 新建 `modules/profile`                        | 不做（本期）      | 核心留 platform；近况长成活动流再抽（§4.2 可逆）   |

## 16. 后端退出标准

1. 部门 CRUD（增删改、设负责人、移动、占用删除 409）落地，OrgService 补满，双实现 + 迁移。
2. 员工档案：详情 `:id`、本人 `me` 读写、管理改他人 `:id/profile` 落地，**全部经写收口 service**，按
   `profile` 范围校验。
3. 首登链路跑通：建账号 → `mustChangePassword` → 改密 + 补全 → 档案生效（e2e 绿）。
4. `profile.updated` 契约在 platform-contract 新建 + platform 生产（他人改才发）+ **notification 侧新增订阅器/
   handler**（M7 未写），④ 端到端落库通知本人跑通（e2e 绿，双向断言：他人改才有、本人改无；非 mock 蒙混）。
5. `registration_status` 增列 + check，本期恒 `active`，写收口 service 为未来审核/注册预留单点（注释到位）。
6. 近况记录（含批量）落地，可见/新增按 `profile` 范围。
7. HR 自定义字段经 M6 forms `profile.employee` 槽位可配可填，前端人页聚合固定+自定义字段。
8. 新权限点进 platform manifest + seed；审计覆盖档案/部门/近况写。
9. security-reviewer 独立二审通过（每个触及安全敏感面的切片）。
10. `pnpm verify` 全绿；涉 schema 变更确认迁移 + 双实现 + Postgres-gated 真跑。

## 17. 切片计划（初拟，定稿后可微调）

| 切片  | 范围                                                                                                                                                                              | 依赖             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| M8-1  | 部门管理做满：OrgService update/delete/移动/设负责人 + 占用校验（软删不计）+ 复用 `platform:org:manage` + 审计 + 双实现/迁移 + `OrganizationPage` 部门树 UI                       | —                |
| M8-2a | 档案读写后端：`:id`/`me` 读、本人窄 DTO / 管理 DTO 经写收口 service + `profile` **写授权**范围校验 + 审计 + **同变更补 security-baseline §5**；`registration_status` 增列（预留） | —                |
| M8-2b | 首登向导（前端）：`mustChangePassword` → 改密 + 补全本人档案 → 进工作台                                                                                                           | M8-2a            |
| M8-3  | `profile.updated`：platform-contract **新建契约** + platform 生产（他人改才发）+ **notification 侧新增订阅器/handler（接收人=本人，不经 RecipientResolver）**；端到端通知本人     | M8-2a            |
| M8-4  | 近况记录：`platform.status_logs` + 批量新增 + 按 `profile` 范围读写 + **新增 `platform:status-log:create`** + 人页脉络 UI + 人员选择器复用                                        | M8-2a            |
| M8-5  | HR 自定义字段联调（消费 M6 forms `profile.employee`，含 404 优雅降级）+ 人页聚合（固定+自定义+在位+近况）+ 档案照片                                                               | M6 已交付 + M8-2 |
| M8-6  | 交付验证门禁（类比 M6-4/M7-5：verify/verify:full/docker:build + 假绿核查 + 浏览器 smoke + 文档同步）                                                                              | M8-1..5          |

> 每切片自包含、独立验收、追加 verification-log；触及安全敏感面的切片合并前过 security-reviewer。
> M8-2a 拆出后端单独成片（档案写收口 + 写授权 baseline 更新是安全核心），首登向导（M8-2b）为前端片，避免单片过大。

## 18. 文档影响

- **新增本 RFC** + `docs/doc-index.md` §7 收纳 + §2 增"开始 M8"阅读路径。
- `docs/foundation-progress.md`：M8 行 In Progress + 下一步。
- `docs/architecture.md`：人员/组织/档案落位说明（核心留 platform、近况记录归属、前端聚合人页、消费 M6 forms）。
- `docs/security-baseline.md`：按 §16 判定——若某切片改数据范围/鉴权/敏感字段则**同变更更新**；仅增列/新表/
  新权限点则**评估**是否补一句（非强制门禁），由 security-reviewer 二审定。
- `docs/platform-core.md`：新增部门 CRUD / 档案编辑 / 近况 API、`profile.updated` 事件、`registration_status`。
- `docs/domain-glossary.md`：补"近况记录"、"档案（固定字段+自定义字段）"、"注册状态"术语。
- `docs/deployment.md`：若仅 platform 迁移增列/表，确认 db:setup 链不变即可。
- `docs/verification-log.md`：各切片追加。

## 19. 已决定事项（起草前依据需求/ADR + 现状盘点）

1. **核心留 platform，不新建模块**（§4.1）：employees/departments 是身份/组织主干，搬出击穿安全基线。
2. **近况记录放 `platform.*`**（§4.2，推荐项，二审可挑战）：复用 profile scope/audit，避免跨 schema 读身份。
3. **自定义字段消费 M6 forms `profile.employee` 槽位，聚合在前端**（§4.3），不重造表单引擎。
4. **`profile.updated` 契约本期在 `packages/platform-contract` 新建**（现状两侧均无 payload 类型，M7 只在
   notification-contract 留了孤立字符串常量）；platform 生产、notification 侧本期新增订阅器消费；本人改本人不发。
5. **部门读写复用既有 `platform:org:view`/`:org:manage`**（§7/§9），不新发明 department 权限点。
6. **首登 `me` 路由先于 `:id` 注册 + 本人写走窄 DTO**（§7/§8），防本人借 `me/profile` 改部门越权。
7. **`profile` scope 首次用于写授权 = 数据范围模型扩展**，落地切片同变更补 security-baseline §5（§8/§13）。
8. **首登补全复用既有改密端点 + `me/profile`**，不引入新鉴权路径。
9. **写档案收口单一 service 方法**（需求 §4.4），未来审核/注册/导入都从这一点接入。
10. **M8 属安全敏感，强制 security-reviewer**（落 repositories/migrations + 档案读写范围）。

## 20. 待审查项（评审/二审决断）

1. **§4.2 近况记录归属**：platform `status_logs`（推荐）vs 现在就立 `modules/profile`？—— 仍是最大的开放决策，
   留给最终拍板（一审二审均倾向放 platform、可逆）。
2. **`profile.updated` payload 字段集**：`changedFields` 是否够（通知文案只需 changedBy），是否需 `subjectName`
   给文案（倾向不带，notification 按 id 解析，最小披露）。
3. **近况记录是否要"撤销/编辑"**：本期是否只追加不可改？（倾向只追加 + 软删预留，编辑属 vNext 活动流。）
4. **④ `profile.updated` 是否要 `trigger_config` enabled 开关**：复用 M7 触发点配置机制（要则 seed 一条）vs
   恒发（被改本人通知一般不需关）—— M8-3 定。

> 二审已结案项（不再开放）：部门权限点（复用 `platform:org:*`）、`me`/`:id` 端点划分（保留独立 `me`，
> 权限语义不同）、M8-2 切片粒度（已拆 M8-2a/2b）。
