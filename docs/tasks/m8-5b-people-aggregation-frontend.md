# Task: M8-5b 人页聚合前端 —— 以人为中心的详情人页抽屉（固定字段 + 自定义字段 + 在位 + 近况脉络 + 照片占位）+ HR 自定义字段填报（定义驱动动态表单，轻字段类型）

## 状态

Ready for execution ｜ 起草 2026-06-25 ｜ 独立 general sub-agent 二审已过并修订（2 Blocking + 3 Major + 数条 Minor，全部代码实证后采纳）。
关键修订：**B1** `@work/ui` `Drawer` 的 `width` 是枚举 `'default'(540)|'narrow'(384)` 无 480px 数值档 → 取 `'default'` 并把"480 vs 540"登记为还原度门禁容差（不改 @work/ui），§0.1/§2.2/§2.6 改；**B2** `Select` 用 `children`(`<option>`) 非 `options` prop → §1.9/§2.5 改；**M1** 在位中文标签照抄 `presence/web StatusBadge` 权威 5 值（在岗/出差/外出调研/外出/休假），删早期错草拟；**M2** upsert 透传只取 `{fieldKey,value}` 丢 snapshot + 保原始类型；**M3** 必填语义校准（前端比后端严，仅 UX）；**m3** presence "未调用"按 url 子串断言（mock 共享 get）；**m4** 空定义(`fields:[]`)编辑态提示。二审实证核心骨架扎实：跨模块 createHttpClient 多 base、Nx tag 禁 import 他模块 contract、5a 端点形状/`displaySnapshot`/upsert 覆盖式语义、专稿锚点、权限串均属实。
消费 M8-5a 已交付（origin/main `b56eb47`）的三条接缝：forms `profile.employee` 记录按 subject 读/upsert、presence 按 employeeId 取当前在位、`PlatformScopePort.matchesScope`（后端，本切片不碰）。

> **PR #29 实现后 code-review（workflow high + 人工合成复核）已回灌本规约**：发现并修订一个**数据丢失簇**——**B1** 编辑入口门控漏 `forms:record:view` + `startEditing` 吞 record 错误 → 空表单全量覆盖抹数据（§2.5 编辑门已改：三权限缺一不可 + record 加载失败/非 404 不得进入编辑）；**B2** 读 record 裸 catch 把 500/403 伪装成空态（§2.5 改：仅 `ApiError.status===404`/空 values 才空态，余者 error 态）；**B3** 409 重载后表单不重挂仍显旧值（§2.5 改：加 `key` 强制重挂）；**M1** presence 裸 catch 伪装"无在位"（§2.4 改：error vs null 区分）；**M2** 409 判定改用 `ApiError.status===409` 而非中文子串；**L1** number `Number()` NaN 静默丢值（§2.5 加 NaN 防护）；**L2** 抽屉标题须含员工名（§2.2 改）。另 Codex GitHub 自动审查抓到一条 workflow 漏的真 bug——**自定义字段 `displaySnapshot` 是对象/对象数组**（`{key,label}`/`[EmployeeLookupDto]`），直接 `String()` 渲染成 `[object Object]`，须共享 `formatCustomFieldDisplay` helper 提 label/name（§2.5 已补）。全部修复见 PR #29 提交 f86ff77 + e91ccad。

## 0. 任务定位

M8-5 按 RFC §17 = "HR 自定义字段联调 + 人页聚合（固定+自定义+在位+近况）+ 档案照片"，规划期拆为
**M8-5a（后端使能，已交付）** + **M8-5b（人页 UI，本切片）**。本切片**纯前端**，全部落 `modules/platform/web`，
把"以人为中心的人页"做成员工管理页里的**详情抽屉**，并在其中接通 HR 自定义字段的**看（聚合展示）+ 填（定义驱动填报）**。

### 0.1 本切片交付（纯前端）

1. **以人为中心的详情人页抽屉 `EmployeeProfileDrawer`**（`@work/ui` `Drawer`，可关闭；**宽度见 §2.6-B1 还原偏差**）——照设计稿
   `组织成员.html` 成员详情抽屉（`openDetail`，**有专稿**，见 §2.6）还原，分区（stacked `d-sec`）聚合：
   - **profile 头部**：照片**占位**（`@work/ui` `Avatar`，姓名首字 + 渐变底，files 下载延后见 §0.3）+ 姓名 + `职位 · 部门` + 状态 Tag。
   - **固定字段区**（来自列表行已加载的 `EmployeeDto`，**不新增 platform 端点**）：账号信息（工号/登录账号/首登）、组织与角色（部门名/职位/角色 Tag）、联系方式（手机/邮箱）。
   - **在位状态区**（5a `GET /presence/status-records/by-employee/:id` → `{record}`）：在位卡；无权限/无记录**分区降级**，不整页报错。
   - **自定义字段区**（5a `GET /forms/records/profile.employee/subjects/:id` → 记录值；**只读展示用记录值自带的 `fieldLabelSnapshot`/`displaySnapshot`，无需拉定义**）：404/无记录 → "暂无自定义字段记录"分区留空（RFC §10 优雅降级）；有 `forms:record:submit`(+`forms:profile-definition:view`) → 显"编辑"入口（§2.5 填报）。
   - **近况脉络区**（M8-4 `GET /employees/:id/status-logs`）：分页 timeline，**吸收 M8-4b 现有 `StatusTimeline` 逻辑**为本抽屉内一区（见 §2.3）。
2. **HR 自定义字段填报 `ProfileCustomFieldsForm`**（自定义字段区的编辑态）：拉 forms 定义（`GET /forms/definitions/profile.employee`）按字段类型渲染**定义驱动动态表单** → `PUT /forms/records/profile.employee/subjects/:id`（`{definitionRevision, values}`，乐观锁）。**本期支持轻字段类型**：`text/textarea/number/date/single_select/multi_select`；`file/image/employee` 三类**本期只读透传不可编辑**（§0.3 / §2.5-5）。
3. **跨模块 web 客户端**（runtime 扩展）：新增 `/api/forms/`、`/api/presence/` 两个 base 的 http client + 对应 api client；**DTO 类型本地镜像**（不 import 他模块 contract，见 §2.1 模块边界）。
4. **设计还原度门禁**（development-workflow §7）：本屏**有专稿**（`组织成员.html` 详情抽屉）——L1 严格还原详情抽屉版式（profile 头部 / `d-sec` 3px 蓝竖条标题 / `.kv` 网格 / 在位卡 / token），自定义字段区/近况脉络区无专稿部分锚设计系统 + 沿用同款 `d-sec`/`kv` 范式（§2.6）。

### 0.2 与 M8-4b 的关系（吸收，不并存）

M8-4b 已交付 `EmployeesPage` 真列表 + 单人 `StatusTimeline` 近况抽屉 + `BatchStatusLogModal` + `EmployeePicker`。
本切片把"近况"这个**独立抽屉**升级/吸收为**详情人页抽屉里的一个分区**：

- 列表行操作从"近况"按钮（开 `StatusTimeline` 抽屉）改为**打开 `EmployeeProfileDrawer`**（人页抽屉），近况脉络成为其中**一个 `d-sec` 分区**。
- 现 `StatusTimeline`（自带 `Drawer` 壳 + timeline + Pager + 加载/空/错误态）**重构为无壳的 `StatusTimelineSection`**（去掉自身 `Drawer`，只保留 timeline 主体 + Pager + 三态），由 `EmployeeProfileDrawer` 作为一区内嵌。**timeline/分页/记录人降级/纯文本防 XSS 等既有逻辑与文案一字不改，只搬不改**。
- `BatchStatusLogModal` + `EmployeePicker` **保持不变**（页级批量记录近况能力不动）。批量记录成功后若人页抽屉正展示其中某 subject → 重载该抽屉近况区（沿用 M8-4b `timelineRefreshKey` 范式）。

> **不并存**：不要保留旧的独立 `StatusTimeline` 抽屉 + 再加一个"详情"按钮（两个抽屉职责重叠、近况在两处出现，违和）。列表行**单一入口**打开人页抽屉，近况是其一区。

### 0.3 已拍板的边界决策（规划期对话 2026-06-25）

1. **人页形态 = 详情抽屉**（被专稿定死）：`组织成员.html` 的成员详情即 480px 右滑抽屉、stacked `d-sec` 分区。不做独立整页路由。
2. **5b = 看（只读聚合）+ 填（HR 自定义字段填报）同片**：RFC §17 M8-5 的"HR 自定义字段**联调**"本就是读写一个回路、且都挂在同一详情抽屉，拆开割裂。
3. **照片本期占位**：跨人看照片需 files 二进制内容流端点 + 跨人授权链（5a §0.3 已延后为独立切片 M8-5-照片）。本切片 profile 头部用 `Avatar` 姓名首字占位，**不碰 files**。
4. **填报本期只做轻字段类型**：`text/textarea/number/date/single_select/multi_select` 可编辑；`file/image/employee` 三类（依赖文件上传 / 人员选择器深度集成）**本期只读透传**（§2.5-5），随照片/重字段后续切片。
5. **员工固定字段的管理写操作 UI 不在本切片**：原型详情抽屉 footer 的"重置密码/停用账号/编辑"+ 编辑表单抽屉（`openMemberForm`：改姓名/部门/职位/角色/状态/首登）是**独立的管理面**，M8-4b 已明确延后。本切片人页**固定字段只读**；档案管理写操作 UI 留**独立切片（M8-7 档案管理操作 UI）**。本切片 footer **不放**重置密码/停用/固定字段编辑。

### 0.4 本切片明确不做（划清边界）

- **任何后端 / 契约 / 迁移 / 权限点 / 事件改动**：5a 已交付三端点 + 谓词；M8-2a/M8-4a 已交付固定字段/近况端点。本切片**一行后端不改**。
- **档案照片 / files 任何改动**（§0.3-3）→ 独立切片。
- **员工固定字段管理写 UI（建档/编辑/状态/角色/重置密码）**（§0.3-5）→ M8-7。
- **`file/image/employee` 自定义字段的编辑**（§0.3-4）→ 后续切片（本期只读透传）。
- **forms 字段定义配置 UI**（HR 配"有哪些字段" = M6 `forms:profile-definition:manage`，M6 已交付其 API；其专属配置 UI 不在 M8 范围）→ 不做。
- **改 `@work/ui` 共享组件**：靠组合既有件（`Drawer`/`Avatar`/`Tag`/`Input`/`Textarea`/`Select`/`Checkbox`/`Pager`/`EmptyState`/`Button`）+ token 化样式实现，避免另起还原门禁面。
- **全链路浏览器 smoke / verify:full / docker:build** → M8-6。本切片只到 web 单测 + `pnpm verify` 快路径。

### 0.5 门禁判定（写进任务包供二审复核）

本切片**只落 `modules/platform/web/src`（前端）**，**不触及** `apps/platform-api/src/{auth,scope,audit,security,repositories}`、guard、data-scope、token/session、迁移、契约、权限点——**不属安全敏感面，security-reviewer 非强制**（同 M8-2b / M8-4b 判定）。走两道既有门禁：

1. **任务包独立 general sub-agent 二审**（带本节决策真值清单）——见记忆 `feedback_independent_subagent_review`。
2. **设计还原度门禁**（§2.6，本屏有专稿，L1 从严）。

> **§0.5 UX 安全自洽点（前端诚实，非后端改动）**：人页聚合**多端点各自独立鉴权**（固定字段=列表已过滤；在位=`presence:board:view`；自定义读=`forms:record:view`；自定义写=`forms:record:submit`+`forms:profile-definition:view`）。前端必须**分区按各自鉴权结果优雅降级**：在位 403/无记录 → 在位区降级不渲染卡/显"暂无在位"，**不整页报错**；forms 记录 404 → 自定义区"暂无自定义字段记录"，**不整页报错**（RFC §10）；写端越权返回 404 信封 → 如实显错、不假装成功、不泄露存在性。**不替服务端预判可写性**，最终以 `PUT` 结果为准。

> reviewer 关注点清单：① 不 import 他模块 contract（forms/presence 类型本地镜像，§2.1）；② 在位/自定义读各自 404/403 **分区降级不整页崩**；③ 填报 upsert **必须回传全部既有值**（含 file/image/employee 不可编辑字段的原值），否则 `replaceRecordValues` 会**抹掉**未编辑字段（§2.5-5，最易踩的数据丢失坑）；④ 乐观锁 409 → 重载定义/记录再编辑，不静默吞；⑤ 纯文本字段渲染防 XSS（不 `dangerouslySetInnerHTML`，沿用 M8-4b 近况范式）；⑥ 无后端/契约/权限点/`@work/ui` 改动；⑦ 还原门禁对专稿（详情抽屉）L1 从严。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界：**`web` 模块只依赖 `platform-sdk` + 自身 `contract`(=`@work/platform-contract`) + `packages/*`，不得依赖他 module 的 contract/internals**；**统一错误信封**；提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m8-people-org-profile.md`（**本切片规格来源**）——重点：
   - **§4.3 自定义字段消费 M6 forms、聚合在前端**（"shell 分别调 platform 档案 API + forms 记录 API，不做后端跨进程编排"——本切片在**前端**聚合多端点，不在后端编排）
   - **§10 前端范围 + 优雅降级**（"人页（以人为中心聚合）：固定字段 + forms 自定义字段 + presence 在位 + 近况脉络，聚合在前端"；"forms `getRecord` 缺权限/无记录返 404，人页须容忍'固定字段有、自定义字段 404'——显示固定字段 + 自定义区留空，**不得整页报错**"）
   - **§13 安全最小披露**、**§16 退出标准**第 7 条（"HR 自定义字段经 forms 槽位可配可填，前端人页聚合固定+自定义字段"——本切片交"可填/可读"的前端半边）、**§17 切片计划** M8-5 行 + 末尾 M8-5 勘误脚注
4. `docs/tasks/m8-5a-people-aggregation-backend.md`（**后端契约权威**，已交付）——§2.2 forms 按 subject 读（404-hide 语义）、§2.3 forms upsert（singleton、`definitionRevision` 乐观锁、`validateRecordValues` 校验、`replaceRecordValues` **覆盖式**写）、§2.4 presence 按人读（`{record}`、越权/无记录统一 null）。**本切片只消费这些端点，不改后端**。
5. `docs/tasks/m8-4b-status-logs-frontend.md`（**最近的同款前端切片范本** + 本切片要吸收的 `StatusTimeline`）——§2.1 web api client 范式、§2.3 单人脉络抽屉（本切片改造为区）、§2.6 还原门禁写法、§4 测试范式、§4.1 命令（`NODE_ENV=test` + Node25 `localstorage-file`）。**照搬其门禁/测试范式**。
6. `docs/development-workflow.md` **§7 设计还原度门禁**（A1–A5 机器自证 + B 类交互态抽查 + L1/L2 边界）——本切片必过，且**有专稿从严**。
7. `apps/workbench-shell/CLAUDE.md`（host 如何挂模块；`web` 测试 `*.spec.tsx` 走 `vitest.web.config.mts`）；根 `CLAUDE.md` 测试矩阵 + **本机陷阱**：web 测试必须 `NODE_ENV=test`（生产模式剥离 `React.act` 致假挂——记忆 `reference_web_tests_node_env_production_trap`）；Node 25 须 `NODE_OPTIONS=--localstorage-file=<ws>/.ls-test`（记忆 `reference_node25_localstorage_jsdom_trap`，CI Node22 不受影响）
8. **设计稿（专稿，必读）**：`docs/design/ui-handoff/design/组织成员.html`（成员详情抽屉的 DOM/CSS：`.profile`/`.d-sec`/`.kv`/`.pres-detail` 规格）+ `组织成员.js` 的 `openDetail`（详情抽屉分区内容）+ `presenceDetailHtml`（在位卡）+ `tokens.css`（token 真源）。`docs/design/ui-handoff/README.md` §3 高保真要求 + §5.4 组织成员模块说明。
9. 既有范式代码（**照搬，不要另起炉灶**）：
   - **页面骨架 + 运行时 + Table/EmptyState/三态 + `readError`**：`modules/platform/web/src/pages/EmployeesPage.tsx`（本切片改其行操作入口 + 挂人页抽屉）、`OrganizationPage.tsx`（`LoadState` 三态、权限门控 `permissions.some` 范式）。
   - **运行时 / 多 base http client**：`modules/platform/web/src/runtime.ts`（`runtime.createHttpClient({ baseUrl })` 已支持任意 base——本切片加 `/api/forms/`、`/api/presence/` 两个 client，见 §2.1）。
   - **web api client + spec**：`modules/platform/web/src/api/platform-roles-api-client.ts`（接口 + 实现 + `http.get/put` + `encodeURIComponent` + `{items}` 解包范式）+ 其 `.spec.ts`（按 url 断言）。
   - **要吸收的近况**：`modules/platform/web/src/pages/StatusTimeline.tsx`（重构为 `StatusTimelineSection`，§2.3）；`BatchStatusLogModal.tsx` / `components/EmployeePicker.tsx`（不动）。
   - **web 测试范式**：`OrganizationPage.spec.tsx` / `EmployeesPage.spec.tsx`（`setPlatformRuntime({ currentUser, createHttpClient })` mock、`get.mockImplementation((url)=>...)` 按 url 路由、`render`/`userEvent`/`findBy*`/`waitFor`、按权限渲染断言）。
   - **`@work/ui` 组件（已读签名，按真实 props 用）**：
     - `Drawer`{title,open,width?,children,footer?,onClose}——`width` 是**枚举 `'default'|'narrow'`，无数值入参**；`'default'`=540px、`'narrow'`=384px（`packages/ui/src/components/Drawer/Drawer.tsx:15` + `tokens.css` `--drawer-width:540px`）。自带"关闭"按钮 + 遮罩 + Esc 关闭，**传真实 `onClose`**。**专稿是 480px，组件给不出（见 §2.6-B1 还原偏差登记，本切片不改 @work/ui）**。
     - `Select`{label,...}——**用 `children`（`<option>`）非 `options` prop**（`Select.tsx:8` `{label,size,className,id,children,...props}`，渲染 `<select>{children}</select>`）；动态表单把 `field.options` map 成 `<option value={key}>{label}</option>`。`label` 设 `aria-label`，断言用 `getByLabelText`。
     - `Avatar`{name,size}、`Tag`{color}、`Input`/`Textarea`（`aria-label={label}`，断言用 `getByLabelText`）、`Checkbox`{label,checked,onChange}、`Pager`{page,total,pageSize,onChange}（page 1-based → API `offset=(page-1)*pageSize`）、`EmptyState`{title,description}、`Button`{variant,size,disabled}、`Dot`。见 `packages/ui/src/components/*`，**用前实读对应组件源文件确认 props（勿凭本表推定）**。
   - **forms / presence 契约形状（仅作本地镜像类型的参照，勿 import）**：`modules/forms/contract/src/forms.dto.ts`（`FormDefinitionDto`/`FormFieldDto`/`FormRecordDto`/`FormRecordValueDto`/`UpsertProfileRecordDto` 形状）+ `fields.ts`（`FORM_FIELD_TYPES` 9 类 + `FORM_FIELD_LIMITS`）；`modules/presence/contract/src/status.dto.ts`（`PresenceStatusRecordDto`）+ `events.ts`（`PresenceStatus = 'working'|'business_trip'|'field_research'|'out'|'leave'`，**5 个，按真实枚举映射中文，勿照搬原型 4 个**）。

## 2. 设计要点（严格遵守）

> 总原则：**前端聚合多端点、各自独立鉴权、分区优雅降级**；**不 import 他模块 contract**（forms/presence 类型本地镜像）；**身份/范围由服务端裁决**，前端不预判、不静默吞错、不伪装成功。

### 2.1 跨模块 web 客户端（runtime 扩展 + 本地镜像类型）

**模块边界（关键）**：`modules/platform/web`（`scope:platform`）**只能** import `@work/platform-contract`（自身 contract）、`packages/*`、`platform-sdk`。
forms / presence 的类型在 `@work/forms-contract` / `@work/presence-contract`（**他模块 contract，scope:forms / scope:presence**），**Nx tag 规则禁止 import**。
→ 跨模块只走 **HTTP 公共 API**（合法），所需 DTO **在 platform web 内本地镜像**最小形状。

- `modules/platform/web/src/api/forms-types.ts`（新）：本地镜像 forms 所需最小类型（注释标明"镜像自 `@work/forms-contract`，因模块边界不可 import；后端契约变更需同步"）：
  ```ts
  export type FormFieldType =
    | 'text'
    | 'textarea'
    | 'number'
    | 'date'
    | 'single_select'
    | 'multi_select'
    | 'file'
    | 'image'
    | 'employee';
  export interface FormFieldOption {
    key: string;
    label: string;
  }
  export interface FormField {
    fieldKey: string;
    label: string;
    fieldType: FormFieldType;
    required: boolean;
    description?: string;
    sortOrder: number;
    options?: FormFieldOption[];
    status: 'active' | 'disabled';
  }
  export interface FormDefinition {
    revision: number;
    status: 'active' | 'disabled';
    fields?: FormField[];
  }
  export interface FormRecordValue {
    fieldKey: string;
    fieldLabelSnapshot: string;
    fieldTypeSnapshot: FormFieldType;
    value: unknown;
    displaySnapshot?: unknown;
    sortOrderSnapshot: number;
  }
  export interface FormRecord {
    definitionRevision: number;
    values?: FormRecordValue[];
  }
  export interface UpsertProfileRecordInput {
    definitionRevision: number;
    values: { fieldKey: string; value: unknown }[];
  }
  ```
- `modules/platform/web/src/api/presence-types.ts`（新）：
  ```ts
  export type PresenceStatus = 'working' | 'business_trip' | 'field_research' | 'out' | 'leave';
  export interface PresenceStatusRecord {
    id: string;
    status: PresenceStatus;
    startAt: string;
    endAt?: string;
    remark?: string;
    userName: string;
    departmentName: string;
  }
  export interface EmployeePresence {
    record: PresenceStatusRecord | null;
  }
  ```
- `modules/platform/web/src/api/forms-api-client.ts`（新）：base `/api/forms/`：

  ```ts
  getProfileDefinition(): Promise<FormDefinition>;                       // GET definitions/profile.employee
  getProfileRecord(subjectId: string): Promise<FormRecord>;             // GET records/profile.employee/subjects/:id
  upsertProfileRecord(subjectId: string, input: UpsertProfileRecordInput): Promise<FormRecord>; // PUT 同路径
  ```

  - slotKey `profile.employee` 写死常量（不从外部传）；`encodeURIComponent(subjectId)`。
  - **路径含点号**（`profile.employee`）已由 5a e2e 实测命中（任务包 5a §2.2-M6）；前端按 `records/profile.employee/subjects/...` 直拼即可。

- `modules/platform/web/src/api/presence-api-client.ts`（新）：base `/api/presence/`：
  ```ts
  getEmployeePresence(employeeId: string): Promise<EmployeePresence>;   // GET status-records/by-employee/:id
  ```
- `modules/platform/web/src/runtime.ts`（扩）：新增两个缓存 client，由 `setPlatformRuntime` 用 `runtime.createHttpClient({ baseUrl: '/api/forms/' })` / `'/api/presence/'` 构造；导出 `getFormsApi()` / `getPresenceApi()`（沿用既有 `getPlatformRolesApi` 范式 + `__resetPlatformRuntimeForTest` 一并清空）。
- **错误**：沿用 `@work/http-client` 抛出的统一信封 `Error`；调用方用 `readError(error, fallback)`（照搬 EmployeesPage helper）。
- **spec**：`forms-api-client.spec.ts` / `presence-api-client.spec.ts` 断言命中正确 url（`definitions/profile.employee`、`records/profile.employee/subjects/emp-1`、`status-records/by-employee/emp-1`）+ PUT payload 形状。

### 2.2 详情人页抽屉 `EmployeeProfileDrawer`（`@work/ui` `Drawer`，可关闭）

新建 `modules/platform/web/src/pages/EmployeeProfileDrawer.tsx`：

- props（建议）：`{ employee: EmployeeDto | null; open: boolean; onClose: () => void; departmentNameById: Map<string,string>; roleNameById: Map<string,string>; employeeNameById: Map<string,string>; statusLogRefreshKey: number }`。`employee=null`/`open=false` 不渲染。
- 承载 = `Drawer`（`title` **必须含员工名**（PR #29 审查 L2，读屏多行切换才能分辨是谁），取 `${employee.name} · 成员详情`（兼顾专稿"成员详情"文案与 a11y）；`open`、`onClose`——**可关闭**，传真实 `onClose`；`width="default"`，**专稿 480px vs 组件 540px 的偏差按 §2.6-B1 登记容差，本切片不改 @work/ui**）。
- **抽屉体 = stacked `d-sec` 分区**（照专稿 §2.6 版式）：
  1. **profile 头部**：`Avatar`（姓名首字占位）+ 姓名 + `职位 ?? '—' · 部门名` + 状态 `Tag`（沿用 EmployeesPage `statusLabel`/`statusTagColor`）。
  2. **固定字段区**（来自 `employee` prop，**不再请求**）：
     - 账号信息：工号 `employeeNo` / 登录账号 `account` / 首登 `mustChangePassword ? '需修改密码' : '已完成初始化'`。
     - 组织与角色：部门 `departmentNameById.get(departmentId) ?? departmentId ?? '—'` / 职位 `title ?? '—'` / 角色 `roleIds.map(roleNameById.get ?? id)` 渲染为 `Tag` 串（空则"—"）。
     - 联系方式：手机 `mobile ?? '—'` / 邮箱 `email ?? '—'`。
  3. **在位状态区**（`PresenceSection`，§2.4）。
  4. **自定义字段区**（`CustomFieldsSection`，§2.5 读 + 填）。
  5. **近况脉络区**（`StatusTimelineSection`，§2.3）。
- 各区**独立加载 + 独立降级**：一区失败/无权限**只影响该区**，固定字段区永远在（人页主体不崩）。
- 打开抽屉时各异步区按需拉取（§2.3/2.4/2.5）；`statusLogRefreshKey` 变化时重载近况区（批量记录后）。

### 2.3 近况脉络区 `StatusTimelineSection`（吸收 M8-4b `StatusTimeline`）

- **重构** `StatusTimeline.tsx`：抽出**无 `Drawer` 壳**的 `StatusTimelineSection`（timeline 列表 + `Pager` + loading/空/错误三态 + 记录人降级 + 纯文本 `white-space:pre-wrap` 防 XSS）。**既有逻辑/文案一字不改，只搬不改**（"暂无近况记录"/"该员工还没有近况记录。"/分页 offset 换算/`created_at DESC` 不重排/记录人不在集显 id 等全保留）。
- 由 `EmployeeProfileDrawer` 以一个 `d-sec`（标题"近况脉络"）内嵌；`open`/`employee.id`/`refreshKey` 触发拉取（沿用现 `StatusTimeline` 的 effect 范式）。
- 调 `getPlatformRolesApi().listStatusLogs(employee.id, { limit: PAGE_SIZE, offset })`（已在 api client，不改）。
- **门控**：近况读后端鉴权是 `platform:employee:view`（M8-4b §2.2-B1 已确认）；整页路由已 gate `platform:employee:view`，故进得来列表即可读近况，本区无需再分支权限。

### 2.4 在位状态区 `PresenceSection`（5a presence 按人读）

- 打开时调 `getPresenceApi().getEmployeePresence(employee.id)` → `{ record }`。
- **渲染**（照专稿 `pres-detail` 在位卡）：
  - `record` 非 null → 在位卡：状态中文标签（按 `PresenceStatus` 枚举映射，见下）+ 起止时间（`startAt`～`endAt ?? '长期'`）+ 备注 `remark`。
  - `record === null` → 区内 `EmptyState` 或一行"当前无在位记录"（5a 对越权/无记录统一返 null，非异常）。
  - **error vs null 必须区分（PR #29 审查 M1）**：请求**抛错**（500/网络）时**不得**裸 `catch` 设成 `record:null` 伪装"无在位记录"——加 error 态显降级文案。权限已前置门控（见下），故 catch 主要覆盖 500/网络，如实显错。
- **状态标签映射（权威值，逐字照抄勿改）**：`PresenceStatus` = `working|business_trip|field_research|out|leave`（5 个）。**权威中文文案在 `modules/presence/web/src/components/StatusBadge.tsx` `STATUS_LABELS`**：`working:'在岗' / business_trip:'出差' / field_research:'外出调研' / out:'外出' / leave:'休假'`。`StatusBadge` 在 `scope:presence`，platform web **不可 import**（同 §2.1 边界）→ **本地复刻这份正确映射**（注释"镜像自 presence/web StatusBadge，不可 import 故本地复刻；后端枚举/文案变更需同步"），用 `Tag`/`Dot` 语义色，**写进规范文案表逐字断言**（§2.6-A3）。**勿照搬原型的 4 个标签**（原型 在岗/请假中/休假中/出差中 与真实枚举不符）；**也勿用早期草拟的 出差中/外勤/请假中**（与看板页文案分裂）。
- **门控（403 降级）**：在位读需 `presence:board:view`。前端**提交前判 `currentUser.permissions` 是否含 `presence:board:view`**：
  - 无 → **整区不渲染**（或显"无在位查看权限"一行），**不发请求**（避免必然 403）。
  - 有 → 发请求；万一仍 403/异常 → 区内显降级文案（`readError`），**不整页崩**。

### 2.5 自定义字段区 `CustomFieldsSection`（读 + HR 填报）

**读（默认态）**：

- 打开时调 `getFormsApi().getProfileRecord(employee.id)` → `FormRecord`。
- **只读展示用记录值自带快照**（**无需拉定义**）：`record.values`（按 `sortOrderSnapshot` 排序）每条渲染 `fieldLabelSnapshot` → 值（**优先 `displaySnapshot ?? value`**）。用 `.kv` 网格（同固定字段区）。纯文本防 XSS（不 `dangerouslySetInnerHTML`）。
- **⚠️ `displaySnapshot` 是对象/对象数组，不是字符串（PR #29 审查线程2，select/employee 显示 `[object Object]` 坑）**：后端 `forms.service.ts` 写入——`single_select`=`{key,label}` 对象、`multi_select`=`[{key,label}]`、`employee`=`[EmployeeLookupDto]`(含 `.name`)、`file`/`image`=fileId `string[]`(无 displaySnapshot)。**严禁直接 `String(value)`/`value.map(String)`**（对象 → `[object Object]`）。须用一个**共享 `formatCustomFieldDisplay` helper**(读态 + 编辑态只读区共用、附单测)：对象有 string `label` → 取 label、有 string `name` → 取 name、其它对象 → `JSON.stringify` 兜底（不得出 `[object Object]`）、数组逐元素提取后 `、` 拼接、原始值 `String`、空 → "—"。
- **404 vs 真失败必须区分（PR #29 审查 B2，最易踩的"假空态"坑）**：`@work/http-client` 失败抛 `@work/errors` 的 `ApiError`（带 `.status`/`.code`）。**只有 `error instanceof ApiError && error.status === 404`（确无记录）或 `values` 空 → 显"暂无自定义字段记录"（`EmptyState`）**；其它错误（500/403/网络）→ **error 态**显信封 message + 重试，**不得裸 `catch` 一律设空**（伪装空既违 A5 诚实，又会诱导覆盖写丢数据，见下编辑门）。
- **门控**：读需 `forms:record:view`。无该权限 → 整区降级（显"无自定义字段查看权限"或不渲染），不发请求。

**填（编辑态，`ProfileCustomFieldsForm`）**：

- **入口门控（PR #29 审查 B1，数据丢失根因——三权限缺一不可）**：仅当 `currentUser.permissions` **同时含 `forms:record:view`（读）+ `forms:record:submit`（写）+ `forms:profile-definition:view`（拉定义）** 时才显"编辑"按钮。**`forms:record:view` 必须在内**——读不到现有值就允许编辑，保存时会以空表单全量覆盖、抹掉员工已有自定义字段（后端 upsert 只校验 `record:submit` 挡不住）。缺任一则只读，不显编辑入口（前端诚实门控，最终仍以服务端为准）。
- **进入编辑前必须成功载入 record（B1，绝不在 record 加载失败时开放保存）**：点"编辑" → 拉 `getProfileDefinition()` + `getProfileRecord()`：
  - record 命中 → 以其值为初值进入编辑；
  - record GET 抛 `ApiError.status === 404`（确无记录，首次建档）→ 以**空表单**进入编辑（合法 create）；
  - **record GET 任何其它错误（500/403/网络）→ 不进入编辑，显 error 态**（`.catch(() => null)` 吞错会让 record=null → 全量空值覆盖丢数据，**严禁**）。
  - definition GET 失败 → error 态。
- 进入编辑后 → `FormDefinition`（`fields` + `revision`）。**注（二审 m4）**：后端无定义时返回 `{revision:0, status:'active', fields:[]}`（不 404）——`fields` 为空 → 编辑态显"暂无可填字段"提示（HR 尚未配置字段），`revision` 仍取 0 用于乐观锁。有字段时以**当前记录值**为初值（按 `fieldKey` 映射 `record.values`），渲染**定义驱动动态表单**：
  - `text` → `Input`（`maxLength` 镜像 `FORM_FIELD_LIMITS.textMaxLength=512`）。
  - `textarea` → `Textarea`（`maxLength` 10000）。
  - `number` → `Input type=number`。
  - `date` → `Input type=date`。
  - `single_select` → `Select`（**`children` 渲染 `<option>`，非 `options` prop**；把 `field.options` map 成 `<option value={key}>{label}</option>`，含一个空值 option 表"未选"）。
  - `multi_select` → 多选（`Checkbox` 组，镜像 `maxMultiSelectValues=100`）。
  - **`file` / `image` / `employee` → 本期不可编辑**：显**只读**当前值（`displaySnapshot ?? value`）+ 一行提示"该字段本期暂不支持在此编辑"（§0.3-4）。
- **必填即时反馈**：`field.required` 为真且值空（未选 / 空串 / 空数组）→ 提交前拦截 + 文案。**语义校准（二审 M3）**：后端必填判定是"字段**缺失**(`!valueByKey.has(fieldKey)`)才拦"，发了 `{fieldKey, value:''}` 空串后端**不**判必填失败；前端把"空串/空选"也拦是**更严的 UX 反馈**，仅本地即时反馈、不代表服务端保证。
- **提交** → `getFormsApi().upsertProfileRecord(employee.id, { definitionRevision, values })`：
  - **⚠️ `values` 必须包含全部字段的当前值（reviewer 关注点 ③，最易踩的数据丢失坑）**：后端 `upsertRecordBySubject` 走 `replaceRecordValues`（**覆盖式**，已二审实证 `forms.service.ts` `validateRecordValues` 循环 `if(!valueByKey.has(fieldKey)) continue` → 未发字段被丢弃），只发被编辑字段会**抹掉**未发字段（尤其 `file/image/employee` 不可编辑字段的原值）。故 payload 须**回传所有字段值**：可编辑类型用表单当前值，`file/image/employee` 等不可编辑类型**透传 record 原值**。
    - **透传只取 `{fieldKey, value}`，丢弃 `fieldLabelSnapshot`/`fieldTypeSnapshot`/`displaySnapshot`**（upsert input 仅接受 `{fieldKey, value}`，多带字段会被 DTO 拒）。
    - **保型**：`value` 按后端校验期望的原始类型回传——`number` 回原始数字（**不是** `displaySnapshot` 的格式化串）、`date` 回 ISO 串、`single_select` 回 option key、`multi_select`/`file`/`image`/`employee` 回 `string[]`。只读展示用 `displaySnapshot ?? value`，但回传永远用原始 `value`。
    - 空值字段：必填空 → 客户端先拦（§下）；非必填空按后端校验语义。
  - `definitionRevision` 取自**编辑时拉到的定义** `revision`（乐观锁）。
  - **乐观锁 409（PR #29 审查 M2 + B3）**：判定用 **`error instanceof ApiError && error.status === 409`**（**不要**靠 message 子串 `.includes('定义')`——信封文案一变就失效）。命中 → 重新拉定义 + 记录让用户重编，不静默吞、不强写。**重载后表单值必须刷新（B3）**：`ProfileCustomFieldsForm` 的初值若用惰性 `useState` 只初始化一次，重载换入新 props 后**无 `key` 不重挂、仍显旧值**——须在渲染处加 `key={`${definition.revision}:${record?.id ?? 'new'}`}` 强制重挂（或 `useEffect` 依 `[definition, record]` 重置 values）。
  - 校验失败 400 / 越权 404 → 如实显信封 message，停留编辑态、不假装成功（§0.5）。
  - **number 字段 NaN 防护（L1）**：`Number(value)` 对非数字得 `NaN` → JSON 序列化成 `null` 静默丢值；提交前若 `Number.isNaN` 则按校验失败拦截给"请输入有效数字"，不静默写 null。
  - 成功 → 退出编辑态、重载只读记录、toast/message"已保存自定义字段"。
- 编辑态加载/提交中按钮 `disabled` + 文案，防重复提交。

> **注**：定义可能含本期不可编辑类型字段（file/image/employee）。这些字段**在编辑态只读展示 + 透传原值**，不阻塞其它字段编辑；这是本期的有意取舍（§0.3-4），非 bug。

### 2.6 设计还原度门禁（development-workflow §7）—— **有专稿（详情抽屉），L1 从严**

> **关键还原决策**：本屏**有专稿** = `组织成员.html` 成员详情抽屉（`openDetail`）。L1 严格还原其版式；M8 新增的自定义字段区/近况脉络区无专属截图，**沿用同款 `d-sec`/`kv` 范式 + 设计系统组件**渲染真实流程（L2）。还原以 `tokens.css` 为唯一色值/间距真源。

- **专稿版式锚点（L1，逐项对齐 `组织成员.html` CSS）**：
  - **profile 头部**：大头像（专稿 60px 圆形渐变 + 姓名首字，本切片用 `@work/ui` `Avatar` 等价呈现）；姓名 18px/600；`pmeta` 13px/`--ink-4`，`职位 · 部门` + 状态 Tag；下边框 `--line-2` + `margin-bottom`。
  - **`d-sec` 分区标题**：13px/600/`--ink-2`，标题左侧 **3px×13px 蓝色竖条**（`--blue-500`，圆角 2px）；区间距 `margin-bottom:24px`。
  - **`.kv` 网格**：`grid-template-columns: 84px 1fr`，`row-gap:14px`/`column-gap:12px`，14px；key `--ink-4`、value `--ink-1`；mono 字段（工号/账号）用等宽。
  - **在位卡 `pres-detail`**：`--fill-1` 底 + `--line-1` 边 + `--r-md` 圆角 + 14px padding；左 38px 状态图标方块（语义色底）+ 右标题/副标。
  - **抽屉**：右滑、可关闭（自带关闭 + 遮罩/Esc）。**B1 已知还原偏差（登记容差，非缺陷）**：专稿抽屉 480px，但 `@work/ui` `Drawer` 只接受枚举 `width: 'default'(540px)|'narrow'(384px)`，无 480px 档；本切片**不改 @work/ui 共享组件**（§0.4/§6），取 `'default'`(540px) 并把"480 vs 540"登记进还原度门禁 deviation（同 M8 既有 `@work/ui` Modal fidelity follow-up 范式，见 foundation-progress §7.2）。未来若要精确 480px，由 `@work/ui` 增宽度档统一处理，不在本切片就地 hack。
- **A 类（实现方交付前机器自证，全做）**：
  - **A1 零硬编码 hex**：本切片新增任何 CSS 颜色只引 `var(--*)`（落地前 Grep 定位 `platform-employees__*`/新增类所在表）；唯一可出现 hex 的是 `tokens.css`（不动）。
  - **A2 零 emoji 当图标**：状态/选择/竖条等一律 token 化 CSS 或 `@work/ui` 件，不得 emoji/首字母（头像姓名首字属设计占位，非图标）。
  - **A3 关键文案逐字一致**：在 `*.spec.tsx` 断言抽屉标题、各 `d-sec` 区标题（"账号信息"/"组织与角色"/"联系方式"/"在位状态"/"自定义字段"/"近况脉络"）、字段 label、空态（"暂无自定义字段记录"/"当前无在位记录"/"暂无近况记录"）、在位状态中文标签、填报按钮/校验/错误文案、不可编辑提示等精确字符串（**落地时定稿一份规范文案表并逐字断言**）。
  - **A4 间距/圆角/阴影/字体只引 token**：`--sp-*`/`--r-*`/`--shadow-*`/`--font(-size)-*`；专稿具体值（60px 头像 / 84px kv 列 / 3px 竖条 / 38px 在位图标）用 token 或 `calc(token …)`，**非 4px 网格的专稿固定值**（如 84px=`calc(var(--sp-1)*21)` 或直接注释为专稿版式常量）就近注释来源，不写无来源裸魔法值。
  - **A5 真实接线 / 诚实占位**：固定字段/在位/自定义/近况全调真实端点，**不造假数据**；照片用 `Avatar` 姓名首字诚实占位（不塞假图）；空态用诚实 `EmptyState`；各区加载失败给诚实降级文案；记录人无法解析显 id（沿用 M8-4b）。**不塞任何虚构内容**。
- **B 类（评审方人工抽查，定稿前）**：并排对照 `组织成员.html` 详情抽屉截图 —— profile 头部/`d-sec` 竖条标题/`.kv` 网格/在位卡视觉同系、无违和魔法值。**必须覆盖交互态**：抽屉打开/关闭、在位有/无记录/无权限、自定义读有值/404 空/无权限、自定义编辑态（各字段类型渲染、不可编辑类型只读、必填拦截、提交 loading、乐观锁 409、越权 404 错误、长报错不撑破）、近况翻页/空/失败。可无头浏览器逐态截图比对。
- **L1 / L2 边界**：
  - **L1（严格还原专稿）**：详情抽屉的 profile 头部、`d-sec` 竖条标题、`.kv` 网格、在位卡 `pres-detail` 版式、抽屉宽度/交互、token 化间距/圆角/字体、文案逐字。
  - **L2（无专稿部分，仅"用设计系统组件 + 同款 d-sec/kv 渲染真实流程"）**：自定义字段区的填报动态表单、各字段类型控件版式无专属截图，按 `@work/ui` 既有控件 + `.kv`/`.fld` 范式自然组织即可，**待未来补专稿再收口**（登记为后续可选）。

## 3. 模块结构增量

### `modules/platform/web`

- `src/api/forms-types.ts`（新）：forms 本地镜像类型（§2.1）。
- `src/api/presence-types.ts`（新）：presence 本地镜像类型（§2.1）。
- `src/api/forms-api-client.ts`（新）+ `.spec.ts`：forms 记录读/upsert + 定义读（§2.1）。
- `src/api/presence-api-client.ts`（新）+ `.spec.ts`：presence 按人读（§2.1）。
- `src/runtime.ts`（扩）：加 `/api/forms/`、`/api/presence/` client + `getFormsApi`/`getPresenceApi` + `__resetPlatformRuntimeForTest` 清空。
- `src/pages/EmployeeProfileDrawer.tsx`（新）：详情人页抽屉 + 固定字段区（§2.2）。
- `src/pages/StatusTimeline.tsx` → 重构出 `src/pages/StatusTimelineSection.tsx`（无壳近况区，§2.3）；`EmployeeProfileDrawer` 内嵌。
- `src/pages/PresenceSection.tsx`（新或并入 Drawer 文件）：在位区（§2.4）。
- `src/pages/CustomFieldsSection.tsx` + `ProfileCustomFieldsForm.tsx`（新）：自定义字段读 + 填报（§2.5）。
- `src/pages/EmployeesPage.tsx`（改）：行操作单一入口改为打开 `EmployeeProfileDrawer`（吸收原"近况"按钮 → 打开人页抽屉）；并行 `listRoles()` 以建 `roleNameById`（失败降级显 id，辅助数据可 `.catch`）；保留 `BatchStatusLogModal` 页级能力 + 成功后重载人页近况区（`statusLogRefreshKey`）。
- platform web 样式表（`platform-employees__*` 所在表，落地前 Grep 定位；建议新增 `employee-profile__*` / `profile-kv__*` / `presence-card__*` 类）：仅引 token（A1/A4），对齐专稿版式常量。
- 测试（`*.spec.tsx`，`NODE_ENV=test`）：
  - `EmployeeProfileDrawer.spec.tsx`（新）：打开抽屉 → profile 头部 + 固定字段区渲染（姓名/工号/账号/部门名/职位/角色 Tag/手机/邮箱）；各区标题逐字（A3）；各异步区按权限/响应渲染或降级（在位有/无/无权限、自定义有值/404 空/无权限、近况列表/空/翻页）。
  - `CustomFieldsSection.spec.tsx` + `ProfileCustomFieldsForm.spec.tsx`（新）：只读展示用快照 label/displaySnapshot；编辑态各轻类型渲染 + file/image/employee 只读透传；**提交 payload 含全部字段值（含透传原值）**；必填拦截未发请求；乐观锁 409 提示重载；越权 404 如实显不关闭。
  - `forms-api-client.spec.ts` / `presence-api-client.spec.ts`（新）：url + payload 断言。
  - `StatusTimelineSection.spec.tsx`（由现 `StatusTimeline` 测试迁移/改造，覆盖原断言）。
  - `EmployeesPage.spec.tsx`（改）：行操作打开人页抽屉（非旧近况抽屉）；批量记录成功后人页近况区重载；`listRoles` 失败降级。

### `docs`

- 见 §7（progress / platform-core / verification-log / doc-index；**本切片无 §16 触发，不改 security-baseline / architecture**）。

> 不动任何后端代码 / 契约 / 迁移 / 权限点 / 事件 / 调度；不动 presence/files/forms 的 api/contract；不碰 M8 其它切片成果；不改 `@work/ui` 共享组件；不 import 他模块 contract。

## 4. 验证

### 4.1 命令（全过，`NODE_ENV=test`）

```bash
pnpm install                    # 无新依赖，通常免
NODE_ENV=test pnpm lint && NODE_ENV=test pnpm typecheck
NODE_ENV=test pnpm test         # 单元 + web（务必 NODE_ENV=test，否则 React.act 被生产剥离致 web 测试假挂——见记忆）
NODE_ENV=test pnpm test:e2e     # in-memory e2e（本切片不新增 e2e，跑回归确认不破）
NODE_ENV=test pnpm build
```

> 本切片**无后端 / 无迁移 / 无部署形态变更**：`test:db` / `test:e2e:postgres` / `docker:build` **非必跑**（留 M8-6）。
> 本机若 Node 25 致 jsdom `localStorage` 报错，按记忆用 `NODE_OPTIONS=--localstorage-file=<ws>/.ls-test` 绕过（CI Node22 不受影响）。
> Nx tag 校验（lint）会拦"platform web import 他模块 contract"——**若出现 tag 报错，是 import 越界（应改本地镜像），不是改 tag**。

### 4.2 断言（必须覆盖）

> **查询范式（避坑）**：字段控件断言用 `getByLabelText`（`Input`/`Textarea`/`Select` 设 `aria-label={label}`）；标题/区标题/按钮/文案用 `getByText`/`getByRole`；异步加载用 `await findBy*`/`waitFor`，勿同步 `getBy*` 抢跑（照 OrganizationPage.spec / M8-4b §4.2）。

- **人页抽屉聚合**：mock 列表 → 点行打开 `EmployeeProfileDrawer` → profile 头部 + 固定字段区逐字；mock forms 记录/presence/status-logs get → 各区渲染。
- **分区优雅降级（核心，逐项）**：
  - 在位：`{record}` 有 → 在位卡 + 中文标签；`{record:null}` → "当前无在位记录"；无 `presence:board:view` 权限 → 整区降级不发请求。**断言写法（二审 m3）**：现有测试 mock 的 `createHttpClient` 忽略 baseUrl 返回同一组 `get`/`put`，forms/presence/platform client 共享同一 mock，**无法按 client 实例区分**；故"presence 未被调用"须按 url 子串断言，如 `expect(get).not.toHaveBeenCalledWith(expect.stringContaining('status-records/by-employee'))`。
  - 自定义读：有值 → 按 `fieldLabelSnapshot`/`displaySnapshot` 渲染；`getProfileRecord` reject 404 → "暂无自定义字段记录"，**固定字段区仍在**（断言不整页崩）；无 `forms:record:view` → 降级。
  - 近况：列表/空/翻页（offset 换算）/失败（沿用迁移后的断言）。
- **HR 填报（编辑态）**：
  - 入口门控：含 `forms:record:submit`+`forms:profile-definition:view` → "编辑"在；缺任一 → 不在（只读）。
  - 点"编辑" → 拉定义 → 按字段类型渲染：text/textarea/number/date/single_select/multi_select 可编辑；file/image/employee 只读 + 不可编辑提示。
  - **提交 payload 含全部字段值**：编辑某 text 字段 + 存在一个 image 字段 → `upsertProfileRecord` 收到的 `values` **同时含**被编辑字段新值**与** image 字段透传原值（断言 image 字段未丢）。
  - 必填拦截：required 字段空 → 拦截文案、`upsertProfileRecord` **未被调用**。
  - 乐观锁 409：`upsertProfileRecord` reject（版本冲突信封）→ 提示重载、不静默；可断言重新拉定义。
  - 越权 404 / 校验 400：reject → 如实显 message、停留编辑态不关闭。
  - 成功：resolve → 退出编辑、重载只读、显"已保存自定义字段"。
- **EmployeesPage 改动**：行操作打开人页抽屉（非旧 `StatusTimeline` 独立抽屉）；批量记录成功后人页近况区重载（`statusLogRefreshKey`+1）；`listRoles` 失败 → 角色显 id 降级、列表不崩。
- **api client spec**：`getProfileDefinition` → `http.get('definitions/profile.employee')`；`getProfileRecord('emp-1')` → `http.get('records/profile.employee/subjects/emp-1')`；`upsertProfileRecord('emp-1', {...})` → `http.put('records/profile.employee/subjects/emp-1', {definitionRevision, values})`；`getEmployeePresence('emp-1')` → `http.get('status-records/by-employee/emp-1')`。
- **A 类自证**：A1 无新 hex、A2 无 emoji 图标、A3 文案逐字断言、A4 token-only（专稿固定值就近注释）、A5 真实接线 + 诚实占位（照片 Avatar 占位、无虚构数据）。
- **回归**：platform web 既有测试（OrganizationPage/RolesPage/EmployeesPage/api client/BatchStatusLogModal/EmployeePicker）**全绿**；shell + 其它包单元/e2e 全绿。
- 验收禁止假数据/占位蒙混；source-review 判定。

## 5. 退出标准

1. 跨模块 web 客户端：`/api/forms/`、`/api/presence/` 两 client + 本地镜像类型落地，**不 import 他模块 contract**（Nx tag 绿）；api client spec 命中正确 url + payload。
2. 以人为中心详情人页抽屉：`@work/ui` `Drawer` 480px 可关闭、stacked `d-sec` 分区聚合 profile 头部 + 固定字段 + 在位 + 自定义字段 + 近况脉络，**照专稿（组织成员详情抽屉）L1 还原**。
3. 分区优雅降级：在位 403/无记录、自定义 404/无权限**各自分区降级不整页崩**（RFC §10）；固定字段区永远在。
4. 照片**占位**（Avatar 姓名首字），不碰 files。
5. 近况脉络吸收 M8-4b `StatusTimeline` 为无壳区，既有逻辑/文案不改；列表行单一入口打开人页抽屉（不并存旧近况抽屉）；批量记录后人页近况区重载。
6. HR 自定义字段填报：定义驱动动态表单（text/textarea/number/date/single_select/multi_select 可编辑，file/image/employee 只读透传），**upsert payload 回传全部字段值不丢**，乐观锁 409 重载、越权 404 如实显、成功重载只读。
7. **设计还原度门禁过**（§2.6）：A1–A5 机器自证；B 类对专稿详情抽屉 + 交互态抽查；L1/L2 边界落实；无硬编码 hex/裸魔法值/emoji 图标。
8. **纯前端**：不改后端/契约/迁移/权限点/事件；不做照片下载、不做固定字段管理写 UI（M8-7）、不做 file/image/employee 字段编辑、不做浏览器 smoke（M8-6）；不改 `@work/ui`。
9. 任务包独立 general sub-agent 二审通过；`NODE_ENV=test pnpm verify` 快路径全绿（lint/typecheck/test/test:e2e/build）。

## 6. 必须保持不变（避免越界）

- **不改任何后端代码 / contract / 迁移 / 权限点 / 事件**（5a + M8-2a/4a 已交付端点）。
- **不 import `@work/forms-contract` / `@work/presence-contract`**（他模块 contract，Nx tag 禁止）——类型本地镜像。
- **照片占位不碰 files**；**file/image/employee 字段本期不可编辑**（只读透传原值）。
- **upsert 必须回传全部字段值**（后端 `replaceRecordValues` 覆盖式，漏发即丢值）。
- **固定字段在人页只读**，不做管理写操作 UI（建档/编辑/状态/角色/重置密码 = M8-7）。
- 前端不替服务端预判鉴权、不静默吞错、不伪装成功（越权/版本冲突如实显）；纯文本防 XSS。
- 不删除/替换 platform web 既有真实接线为虚构数据（A5）；不改 `@work/ui` 共享组件（组合既有件）。
- 列表行**单一入口**打开人页抽屉，不并存旧 `StatusTimeline` 独立抽屉。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：M8 切片表标 **M8-5b done**（人页聚合前端 + HR 自定义字段填报）+ 下一步 **M8-6 交付验证门禁**；记一句"人页=列表行打开的详情抽屉，吸收近况为一区；照片占位 + file/image/employee 字段编辑延后独立切片；固定字段管理写 UI 留 M8-7"。
- `docs/platform-core.md`：补一句"platform web 人页（详情抽屉）前端聚合 `GET /employees`(固定) + `/forms/records/profile.employee/subjects/:id`(自定义) + `/presence/status-records/by-employee/:id`(在位) + `/employees/:id/status-logs`(近况)，各自独立鉴权 + 分区优雅降级；HR 自定义字段填报消费 forms 定义 + upsert"。
- `docs/verification-log.md`：追加 `M8-5b People Aggregation Frontend` 锚点（含还原度门禁 A/B 结论 + 专稿=组织成员详情抽屉的还原基准 + 跨模块本地镜像类型说明 + upsert 全值回传防丢说明 + verify 结论 + 真实门禁数字）。
- `docs/doc-index.md` §7：catalog 增 M8-5b 任务包行。
- **不改** `docs/security-baseline.md`（本切片无 §16 触发——未改数据范围/鉴权/敏感字段/token；纯前端消费既有端点）。
- **不改** `docs/architecture.md`（前端聚合人页拓扑 RFC §4.3/§10 已述，无新拓扑）。

## 8. 提交规范

- 代码分支由 Codex 负责（`feat/...`），走 PR；本任务包属纯文档，由规划方提交 main。
- **本切片无 §16 原子性例外**：所有文档（progress/platform-core/verification-log/doc-index）均纯文档，由规划方在切片合并后提交 main（与代码 PR 解耦）；代码 PR 只含 `modules/platform/web` 改动 + 测试。
- 代码提交 Conventional Commits：`feat(platform-web): people profile drawer aggregating fixed/custom/presence/status with HR custom-field entry`。
- 提交说明：① 详情人页抽屉聚合固定+自定义+在位+近况+照片占位（照专稿还原）；② 跨模块 forms/presence web client（本地镜像类型，不越界 import）；③ HR 自定义字段定义驱动填报（轻字段类型 + 全值回传 + 乐观锁）；④ 吸收 M8-4b 近况为抽屉内区、单一入口；⑤ 分区优雅降级（404/403 不整页崩）；⑥ 设计还原度门禁（有专稿，L1 从严）；⑦ 纯前端无后端/契约改动。
- 合并前：本切片**非安全敏感面，security-reviewer 非强制**；过设计还原度门禁 + 任务包独立二审；交付前跑完 §4 命令，结论贴进 `docs/verification-log.md`。
