# Task: M8-4b 近况记录前端 —— 员工管理页落地（真列表）+ 单人近况脉络抽屉（分页 timeline）+ 批量记录近况（自建人员多选器）

## 状态

Ready for execution ｜ 起草 2026-06-23 ｜ 独立 general sub-agent 二审已过并修订（1 Blocking + 2 Major，已逐条复核修订：① **B1 列表/脉络读端点鉴权是 `platform:employee:view` 非 create** → §2.2 补门控真值 + §4.2 mock 权限集改为含 `platform:employee:view` 的两组；② **M1 响应形状已实读确证**（GET 返 `{items,total}` 不包、POST 返 `StatusLogDto[]`，e2e 佐证）→ §2.1 措辞改断言式；③ **M2 主数据失败不可静默吞错** → §2.2 注明 `listEmployees` 失败须走 error 态、不可照搬 OrganizationPage 的 `.catch(()=>[])`）。Minor（记录人多显 id、query 手拼、整批 404 全有或全无）经核确认无误。契约/EmployeeDto/@work/ui 组件签名/运行时与测试范式/forms 无 web 模块/占位符现状/权限 seed 均经实读核验吻合。｜ 消费 M8-4a 已交付的 `POST /status-logs` + `GET /employees/:id/status-logs` 两端点

## 0. 任务定位

M8-4a（近况记录**后端**：`platform.status_logs` 新表 + 批量逐 subject 写授权 + 分页读范围 + `platform:status-log:create`）已交付。
本切片交付其**前端消费**：把近况记录做成员工管理页里可用的能力。

> **⚠️ 起草前实证发现两处与 RFC §10 字面假设的偏差（已据实读纠正，写进本节供二审核对）：**
>
> 1. **RFC §10「人页脉络 timeline」的宿主『以人为中心聚合人页』尚不存在**——人页聚合（固定字段 + forms 自定义字段 + presence 在位 + 近况一体）属 **M8-5**（RFC §17 M8-5 行）。本切片**不造人页**，把近况脉络做成员工列表页里的**单人抽屉（Drawer）**；M8-5 再把同一 timeline 折进聚合人页。
> 2. **RFC §10 / M8-4a §0「复用 M6 forms 人员字段选择器组件」是空中楼阁**——经实读：`employee` 只是 forms 的一个**字段类型**（`modules/forms/contract/src/fields.ts:10`），`modules/forms` **没有 web 模块**（只有 `api` + `contract`），**不存在任何可复用的人员选择 React 组件**。本切片的批量人员多选器**只能自建**，数据源 = 既有 `platform-roles-api-client.listEmployees()`（服务端已按 `profile` 读范围过滤）。本切片把它做成 platform web 内的 `EmployeePicker`，**未来可提升为 `@work/ui` 共享件**（本期不提升，避免顺带改共享件另起还原门禁面）。
>
> 第三处现状：**`EmployeesPage` 当前是纯占位符**（`PlatformAdminPlaceholder`，无员工列表/详情 UI）。本切片**把它落地为真列表**作为近况能力的宿主（用户 2026-06-23 拍板"方案 A：落地员工页 + 近况"）。

本切片交付（**纯前端**，全部落 `modules/platform/web` + 复用 `@work/ui`）：

1. **web api client 扩展**（`modules/platform/web/src/api/platform-roles-api-client.ts`）：新增 `listStatusLogs(employeeId, query)` → `GET employees/:id/status-logs`、`createStatusLogs(input)` → `POST status-logs`（复用既有 `/api/platform/` base + `@work/http-client`；契约类型 M8-4a 已在 `@work/platform-contract`）。
2. **`EmployeesPage` 落地为真员工列表**（替换占位符）：`listEmployees()`（服务端 scope 过滤）→ `@work/ui` `Table`；每行有「近况」操作打开脉络抽屉；页头「批量记录近况」按钮（按 `platform:status-log:create` 门控）。
3. **单人近况脉络抽屉 `StatusTimeline`**（`@work/ui` `Drawer` 承载，**可关闭**）：分页 timeline，调 `GET /employees/:id/status-logs`，展示 记录人 / 时间 / 纯文本内容；空态 EmptyState；`@work/ui` `Pager` 翻页（1-based → offset）。
4. **批量记录近况 `BatchStatusLogModal`**（`@work/ui` `Modal` 承载，可关闭）：自建 `EmployeePicker`（搜索 + 多选 + 已选计数）+ `Textarea` 内容 → `createStatusLogs({ subjectEmployeeIds, content })`；客户端校验（≥1 人、content 非空、≤100 人、content ≤2000 字，**镜像后端 DTO 约束仅作即时反馈，不代表服务端保证**）；成功后刷新（若当前抽屉正展示其中某 subject 的脉络则重载）。
5. **设计还原度门禁**（development-workflow §7）：本屏**无专属设计稿**（交接包只有登录页 + 外壳 + 工作台 + 5 个业务屏，无员工管理/近况屏），还原基准锚定**既有设计系统**（`@work/ui` `Table`/`Drawer`/`Modal`/`Checkbox`/`Tag`/`Button`/`Input`/`Textarea`/`Pager`/`EmptyState` + tokens），A 类机器自证全做、B 类对照设计系统组件态、L1/L2 边界写清（§2.6）。

**本切片不做**（划清边界，留后续切片）：

- **以人为中心聚合人页**（固定字段 + forms 自定义字段 + presence 在位 + 近况一体）→ **M8-5**。本切片的近况脉络是员工列表的**单人抽屉**，非聚合人页。
- **员工建档 / 编辑 / 状态 / 角色 / 重置密码 UI**：RFC §10 提到的员工页其它管理能力**不在本切片**——本切片 `EmployeesPage` **只读列表 + 近况能力**，建档/编辑等留 M8-5（或独立切片）。**只做"列表 + 看近况 + 批量记近况"，不做员工写操作 UI**（避免单片过大；后端档案写端点 M8-2a 已在，UI 另切）。
- **近况的撤销 / 编辑 UI** → 预留不做（M8-4a 后端只追加 + `deleted_at` 预留，无删除/编辑端点，前端无可调之 API）。
- **HR 自定义字段联调 / 档案照片** → **M8-5**。
- **任何后端 / 契约 / 迁移 / 权限点改动**：M8-4a 已交付两端点 + `status-log` 契约 + `platform:status-log:create` 权限点；本切片**一行后端不改**。
- **全链路浏览器 smoke**（建账号→批量记近况→各人脉络可见 端到端）→ **M8-6**（本切片只做 web 单测层）。

> **门禁判定（写进任务包供二审复核）**：本切片**只落 `modules/platform/web/src`（前端）**，**不触及** `apps/platform-api/src/{auth,scope,audit,security,rbac,repositories}`、guard、data-scope、token/session、迁移、契约——**不属安全敏感面，security-reviewer 非强制**（同 M8-2b 判定）。走两道既有门禁：① **任务包独立 general sub-agent 二审**（带本节决策真值清单）；② **设计还原度门禁**（§2.6）。§2.5 列一条 UX 安全自洽点（读范围候选 vs 写授权全有或全无）须前端诚实处理，非后端改动。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、**统一错误信封**、提交规范；`web` 模块只依赖 `platform-sdk` + 自身 `contract` + `packages/*`）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m8-people-org-profile.md`（**本切片规格来源**）——重点 **§7 近况记录 API**（`GET /employees/:id/status-logs` 分页 + `POST /status-logs` 批量 + 权限列 + 越权 404 不泄露存在性）、**§10 前端范围**（"近况记录录入（含人员选择器批量选）"、"前端测试走 `vitest.web.config.mts`，`NODE_ENV=test`"——但 §0 已纠正其"复用 forms 人员选择器""人页宿主"两处假设）、**§15 本期做/预留/不做**（近况含批量给多人=本期做；撤销/编辑=只追加）
4. `docs/tasks/m8-4a-status-logs-backend.md`（**后端契约权威**）——§2.1 契约形状、§2.5 写"全有或全无 + 越权整批 404"、§2.6 端点落点（`POST /api/platform/status-logs`、`GET /api/platform/employees/:id/status-logs`）、§2.2 DTO 约束（`@ArrayMaxSize(100)`、content 非空 + `@MaxLength(2000)`、去重）——**前端客户端校验镜像这些上限作即时反馈**
5. `docs/development-workflow.md` **§7 设计还原度门禁**（A1–A5 机器自证 + B 类交互态抽查 + L1/L2 边界）——本切片必过
6. `docs/tasks/m8-2b-first-login-wizard.md` §2.5 / §4.2（**最近的"无专稿→锚定设计系统"前端切片范本**：Modal `onClose`/`getByLabelText` 查询陷阱/A 类自证写法，照搬其门禁与测试范式）；`docs/tasks/ui-foundation-fidelity.md` §2/§3（门禁立意 + L1/L2）
7. `apps/workbench-shell/CLAUDE.md`（host 如何挂模块；web 测试 `*.spec.tsx` 走 `vitest.web.config.mts`）；根 `CLAUDE.md` 测试矩阵 + **本机陷阱**：web 测试必须 `NODE_ENV=test`（生产模式剥离 `React.act` 致假挂）；Node 25 须 `NODE_OPTIONS=--localstorage-file=<ws>/.ls-test`（记忆 `reference_node25_localstorage_jsdom_trap`，CI Node22 不受影响）
8. 既有范式代码（**照搬，不要另起炉灶**）：
   - **页面 + 运行时 + Table/Select/EmptyState 范式**：`modules/platform/web/src/pages/OrganizationPage.tsx`（`getPlatformRolesApi()`/`getPlatformCurrentUser()`、`LoadState` loading/ready/error 三态、`canManage = currentUser.permissions.some(...)` 按钮门控、`Table` + `TableColumn` 渲染、`EmptyState`、`readError(error, fallback)` helper——**近况页照搬这套骨架**）
   - **运行时 / api client 接法**：`modules/platform/web/src/runtime.ts`（`getPlatformRolesApi`/`getPlatformCurrentUser`、`__resetPlatformRuntimeForTest`）；`modules/platform/web/src/api/platform-roles-api-client.ts`（接口 + 实现 + `http.get/post` + `{ items }` 解包范式——**status-log 方法照此加**）
   - **web 测试范式**：`modules/platform/web/src/pages/OrganizationPage.spec.tsx`（`setPlatformRuntime({ currentUser, createHttpClient: () => ({get,post,put,patch,delete}) })` mock、`get.mockImplementation((url)=>...)` 按 url 路由、`render`、`userEvent`、`findBy*`/`waitFor` 异步、按权限渲染断言——**EmployeesPage/EmployeePicker spec 照此**）
   - **`@work/ui` 组件（已读签名，按真实 props 用）**：
     - `Drawer`（`packages/ui/src/components/Drawer/Drawer.tsx`）：`{ title, open, width?, children, footer?, onClose }`——**自带「关闭」按钮 + 点遮罩/Esc 关闭**（脉络抽屉**可关闭**，与 M8-2b 不可关闭向导相反，勿传 noop）。
     - `Pager`（`Pager.tsx`）：`{ page, total, pageSize, onChange }`——**page 1-based**，渲染"共 N 条 / 上一页 / page/pageCount / 下一页"；**前端把 1-based page 换算成 API 的 `offset = (page-1)*pageSize`**。
     - `Modal`（`Modal.tsx`）：`{ open, onClose, title, description?, footer?, children }`——批量 Modal **可关闭**（传真实 `onClose`，与 M8-2b 不同）。
     - `Checkbox`（`Checkbox.tsx`）：`{ label, ...inputProps }`（`checked`/`onChange`/`disabled`）——人员多选行用；原生 input 保留可达性。
     - `Textarea`（`Textarea.tsx`）：`{ label, ... }`，`aria-label={label}`——**内容字段断言用 `getByLabelText`**。
     - `Table`/`TableColumn`、`Input`、`Button`、`Tag`、`EmptyState`、`Avatar`：见 `packages/ui/src/components/*`（OrganizationPage 已示范用法）。
   - **契约（M8-4a 已在，勿新增）**：`packages/platform-contract/src/status-log.ts`（`StatusLogDto`/`CreateStatusLogsInput`/`ListStatusLogsQuery`/`ListStatusLogsResult`）；`packages/platform-contract/src/users.ts`（`EmployeeDto`：`id/employeeNo/account/name/departmentId?/title?/mobile?/email?/status/roleIds/mustChangePassword`）

## 2. 设计要点（严格遵守）

### 2.1 web api client 扩展（`modules/platform/web/src/api/platform-roles-api-client.ts`）

在 `PlatformRolesApiClient` 接口 + `createPlatformRolesApiClient` 实现里新增两方法（沿用同一 `http`，base `/api/platform/`）：

```ts
listStatusLogs(
  employeeId: string,
  query?: ListStatusLogsQuery,
): Promise<ListStatusLogsResult>;
createStatusLogs(input: CreateStatusLogsInput): Promise<StatusLogDto[]>;
```

实现：

```ts
listStatusLogs(employeeId, query) {
  const search = new URLSearchParams();
  if (query?.limit !== undefined) search.set('limit', String(query.limit));
  if (query?.offset !== undefined) search.set('offset', String(query.offset));
  const qs = search.toString();
  return http.get<ListStatusLogsResult>(
    `employees/${encodeURIComponent(employeeId)}/status-logs${qs ? `?${qs}` : ''}`,
  );
},
createStatusLogs(input) {
  return http.post<StatusLogDto[], CreateStatusLogsInput>('status-logs', input);
},
```

- **`GET` 返回 `ListStatusLogsResult`（`{ items, total }`）直接返回**，不像 `listDepartments`/`listEmployees` 那样解 `{ items }`。**响应形状已实读确证（二审）**：`employee.controller.ts` 的 `:id/status-logs` 直接 `return statusLogService.listStatusLogs(...)`，service 返回 `ListStatusLogsResult`；全 `apps/platform-api/src` **无 response 拦截器包裹**（grep 0 命中），e2e `platform-api.e2e-spec.ts` 断言 `body === { total, items:[...] }`——**GET 直接返回 `{ items, total }`，不解一层、不再包一层**。
- **`POST /status-logs` 返回 `StatusLogDto[]`（数组）**——已实读确证：`status-log.controller.ts` → service 返回 `StatusLogDto[]`，e2e 断言 `created.body` 是数组。**直接 `http.post<StatusLogDto[], CreateStatusLogsInput>`，不要把返回当成包了一层的对象。**
- `encodeURIComponent(employeeId)`（照 `updateDepartment`/`deleteDepartment` 范式）。
- 错误沿用 `@work/http-client` 抛出的统一信封 `Error`（页面用 `readError(error, fallback)` 取 `.message`，照搬 OrganizationPage helper）。
- **同步扩 `platform-roles-api-client.spec.ts`**：断言两方法命中正确 url + query 串（照该文件既有 `listDepartments`/`listEmployees` 断言范式）。

### 2.2 `EmployeesPage` 落地为真员工列表（替换占位符）

替换 `modules/platform/web/src/pages/EmployeesPage.tsx` 的 `PlatformAdminPlaceholder`，照搬 OrganizationPage 骨架（`LoadState` 三态 + `getPlatformRolesApi`/`getPlatformCurrentUser` + `readError`）：

- **访问前提（门控真值，二审 B1）**：整页访问门控是 **`platform:employee:view`**（已由 `module.ts` 的路由/菜单声明保障——`/platform/employees` route+menu permission = `platform:employee:view`，页面内**无需再对列表本身做权限分支**）。⚠️ **`GET /employees`（列表）与 `GET /employees/:id/status-logs`（脉络读）后端鉴权都是 `platform:employee:view`，不是 `platform:status-log:create`**（见 `employee.controller.ts`：列表 + `:id/status-logs` 均 `@RequirePermissions('platform:employee:view')`）。`platform:status-log:create` **只门控「批量记录近况」写入口**（§2.5）。三者权限独立：看列表/看脉络 = view，批量写 = create。
- **数据**：`listEmployees()`（服务端已按 `profile` 读范围过滤——**前端不再二次过滤范围**，列表即用户可见集）；可并行 `listDepartments()` 以把 `departmentId` 映射成部门名展示（照 OrganizationPage 的 `employeeNameById` Map 范式，做 `departmentNameById`）。
  > ⚠️ **主数据失败必须走 error 态（二审 M2）**：`listEmployees()` 是本页**主数据**，失败须进 `LoadState.error`（诚实错误 + 可刷新重试，A5）——**不可照搬 `OrganizationPage.tsx:42` 的 `api.listEmployees().catch(() => [])` 静默降级**（那里 employees 只是负责人下拉的副数据，本页不同）。`listDepartments()` 作为部门名映射的辅助数据，失败可降级为"departmentId 显原值/—"不阻塞列表（可 `.catch` 降级），但**员工列表本身不可静默吞空**。
- **`Table` 列**（建议）：姓名（`name`）、工号（`employeeNo`）、账号（`account`）、部门（`departmentId`→名，未设置显"—"）、职务（`title ?? '—'`）、状态（`status`→ `Tag`：`active`=绿"在职"/`disabled`=灰"停用"/`left`=灰"离职"）、操作（「近况」按钮 → 打开该员工脉络抽屉）。
- **页头**：标题「员工管理」+ 说明一句（本期定位：查看员工与近况记录）；右侧「批量记录近况」按钮——**仅当 `currentUser.permissions` 含 `platform:status-log:create` 时渲染**（照 OrganizationPage `canManage` 范式：`const canCreateStatusLog = currentUser.permissions.some(p => p.code === 'platform:status-log:create')`）；无该权限**整按钮不渲染**（不放灰色死按钮）。
- 列表空态：`EmptyState`（"暂无员工" 之类）。
- loading/error 态照 OrganizationPage（"加载中…" / 错误文案）。

> **本期 `EmployeesPage` 只读 + 近况**：不做建档/编辑/状态/角色/重置密码 UI（§0 边界，留 M8-5）。

### 2.3 单人近况脉络抽屉 `StatusTimeline`（`@work/ui` `Drawer`，可关闭）

新建 `modules/platform/web/src/pages/StatusTimeline.tsx`（或 `components/`，见 §3 落点）：

- props（建议）：`{ employee: EmployeeDto | null; open: boolean; onClose: () => void; employeeNameById: Map<string,string> }`。`employee=null`/`open=false` 不渲染。
- 承载 = `Drawer`（`title={`${employee.name} 的近况脉络`}`、`open`、`onClose`——**可关闭**：Drawer 自带「关闭」按钮 + 遮罩/Esc，**传真实 `onClose`**）。
- 打开即按当前 page 调 `getPlatformRolesApi().listStatusLogs(employee.id, { limit: PAGE_SIZE, offset: (page-1)*PAGE_SIZE })`；`PAGE_SIZE` 常量（如 20，≤ 后端 clamp 上限 100）。
- **timeline 渲染**：`items` 按后端已排好的 `createdAt DESC` 顺序（**前端不再重排**，后端 M8-4a 已 `created_at DESC, id DESC`）。每条：记录人名（`employeeNameById.get(authorEmployeeId) ?? authorEmployeeId`——**历史记录人可能不在当前可见员工集，诚实降级显示 id，不报错、不显"未知"伪装**）、时间（`createdAt` 格式化为本地可读串）、内容（`content` 纯文本，保留换行用 css `white-space: pre-wrap`，**不 `dangerouslySetInnerHTML`**——纯文本直接渲染防 XSS）。
- 空态：`EmptyState`（"暂无近况记录" / "该员工还没有近况记录。"）。
- 分页：`Pager`（`page`、`total`、`pageSize=PAGE_SIZE`、`onChange`）；翻页重新拉取。
- loading/error 态：抽屉体内"加载中…" / `readError` 错误文案 + 重试，不静默。
- **越权/不存在**：后端越权读返回 404 统一信封 → 抽屉体显错误文案（不泄露存在性，前端只如实显 message）。正常路径下列表里的人都在读范围内，故 404 主要是边缘（如刚被改范围/软删），诚实处理即可。

### 2.4 自建人员多选器 `EmployeePicker`（数据源 listEmployees，**非 forms 组件**）

新建 `modules/platform/web/src/components/EmployeePicker.tsx`（platform web 内部组件，**未来可提升 `@work/ui`，本期不提升**）：

- props（建议）：`{ employees: EmployeeDto[]; value: string[]; onChange: (ids: string[]) => void; maxSelected?: number }`。
- **数据源 = 调用方传入的 `listEmployees()` 结果**（服务端 `profile` 读范围过滤过；对 profile，读范围 == 写范围同一 `matchesScope`，故候选即"可写"——但**写授权最终以服务端 `POST /status-logs` 全有或全无为准**，前端不替服务端下结论，见 §2.5）。
- **搜索框**（`Input`）：客户端按 `name` / `employeeNo` / `account` 子串过滤（不发请求）；placeholder「搜索姓名 / 工号 / 账号」。
- **多选列表**：每行 `Checkbox`（label = `name`（`employeeNo`），如"张伟（000001）"）；`checked` 取自 `value`；点选 toggle `onChange`。
- **已选计数**：显示"已选 N 人"；可选「清空已选」。
- **上限保护**：`maxSelected`（默认 100，镜像后端 `@ArrayMaxSize(100)`）；达上限后未选中项的 checkbox `disabled` + 提示"最多选择 100 人"。
- 空态：无员工/搜索无结果 → 诚实提示。
- **纯受控组件、无副作用、不自己拉数据**（数据由 `BatchStatusLogModal` 传入），便于单测与未来提升共享件。

### 2.5 批量记录近况 `BatchStatusLogModal`（`@work/ui` `Modal`，可关闭）

新建 `modules/platform/web/src/pages/BatchStatusLogModal.tsx`（或 `components/`）：

- props（建议）：`{ open: boolean; employees: EmployeeDto[]; onClose: () => void; onCreated: (created: StatusLogDto[]) => void }`。
- 承载 = `Modal`（`open`、`onClose`——**可关闭**：点遮罩/Esc/无显式关闭按钮则靠遮罩，传真实 `onClose`；与 M8-2b 不可关闭向导相反）；`title`「批量记录近况」、`description` 一句说明。
- body：`EmployeePicker`（§2.4，`employees` 传入、本地 `selectedIds` 状态）+ `Textarea`（label「近况内容」、placeholder「输入要记录的近况内容…」、`maxLength` 2000 镜像后端）。
- footer：「取消」（`onClose`）+「记录近况」（提交）。
- **客户端校验（提交前，纯 UX 即时反馈，不代表服务端保证）**：
  - 已选 ≥ 1 人，否则拦截 + 文案「请至少选择 1 名员工」，不发请求。
  - `content.trim()` 非空，否则拦截 + 文案「请输入近况内容」（对齐 M8-1"可清空≠空串"教训：trim 后非空）。
  - 已选 ≤ 100、content ≤ 2000（镜像后端 DTO；UI 层亦应防超）。
- 提交 → `api.createStatusLogs({ subjectEmployeeIds: selectedIds, content: content.trim() })`。
  - 成功 → `onCreated(created)`（页面 toast/message「已为 N 名员工记录近况」+ 关闭 + 若脉络抽屉正展示其中某 subject 则重载该抽屉）；清空表单。
  - 失败（**含后端全有或全无的整批 404**：某 subject 越权/跨企业/不存在 → 整批拒、0 行落库）→ 取 `error.message` 显在 Modal 错误区，**停留 Modal、不关闭、不假装部分成功**。
- 加载态：提交中按钮 `disabled` + 文案"记录中…"，防重复提交。

> **§2.5 UX 安全自洽点（前端诚实，非后端改动）**：候选来自读范围（`listEmployees`）；对 `profile`，读/写范围同一 `matchesScope`，故正常候选即可写。但**最终写授权以服务端 `POST /status-logs` 全有或全无为准**——前端**不替服务端预判可写性、不静默吞错、不伪装部分成功**；整批 404 如实显信封 message。这是既有后端契约（M8-4a），本切片只如实消费。

### 2.6 设计还原度门禁（development-workflow §7）—— **无专稿，锚定设计系统**（照 M8-2b 范式）

> **关键还原决策**：交接包**无员工管理 / 近况脉络 / 人员选择器专属设计稿**。本屏属"真实存在但无专稿"——还原基准 = **既有设计系统**：`@work/ui` `Table`/`Drawer`/`Modal`/`Checkbox`/`Tag`/`Button`/`Input`/`Textarea`/`Pager`/`EmptyState`/`Avatar` + tokens。即"用 L1 视觉系统的现成组件与 token 搭建本屏"，**不为本屏发明视觉规范、不照搬任何业务屏的虚构内容**。

- **A 类（实现方交付前机器自证，全做）**：
  - **A1 零硬编码 hex**：本切片新增任何 CSS（platform web 样式表，落地前 Grep 定位 `platform-org__*` 所在表）颜色只引 `var(--*)`；唯一可出现 hex 的是 `tokens.css`（本切片不动）。
  - **A2 零 emoji 当图标**：操作/状态/选择图标一律 `@work/ui` `Icon` 线性 SVG 或组件自带（Checkbox 对勾、Tag 状态点），不得 emoji/首字母占位。
  - **A3 关键文案逐字一致**：在 `*.spec.tsx` 断言页面/抽屉/Modal 的标题、列头、按钮、placeholder、空态、校验/错误文案等精确字符串（如「员工管理」「批量记录近况」「{name} 的近况脉络」「暂无近况记录」「搜索姓名 / 工号 / 账号」「近况内容」「请至少选择 1 名员工」「请输入近况内容」「记录近况」等——**落地时定稿一份规范文案表并逐字断言**）。
  - **A4 间距/圆角/阴影/字体只引 token**：`--sp-*`/`--r-*`/`--shadow-*`/`--font(-size)-*`；非 4px 网格值用 `calc(token …)`，不写裸魔法值。复用 Table/Drawer/Modal/Card 既有 token 化样式。
  - **A5 真实接线/诚实占位**：列表/脉络/批量记录全调真实 `listEmployees`/`listStatusLogs`/`createStatusLogs`，**不造假数据**；空态用诚实 EmptyState；记录人无法解析时显 id（不伪装"未知"）；加载失败给诚实错误 + 重试。**不塞任何虚构内容**（无"48 个应用"式假数）。
- **B 类（评审方人工抽查，定稿前）**：因无专稿，并排对照物 = **既有设计系统组件态**（`Table`/`Drawer`/`Modal`/`Checkbox`/`Pager` 在登录页/外壳/工作台/组织页里的现有视觉），确认本屏视觉与之同系、无违和魔法值。**必须覆盖交互态**：列表 loading/空/错误、抽屉打开/翻页/空脉络/加载失败、Modal 选人/搜索/校验拦截/提交 loading/整批 404 错误/长报错不撑破布局。可用无头浏览器对每态截图比对。
- **L1 / L2 边界**：
  - **L1（严格还原既有视觉系统）**：所有 `@work/ui` 组件态、token 化间距/圆角/阴影/字体、文案逐字、交互态。
  - **L2（本屏特有、无专稿部分仅"用设计系统组件渲染真实流程"）**：员工列表 / 脉络抽屉 / 批量 Modal 的版式**无专属截图可对**，按现有组件自然组织即可，**待 M8-5 人页或未来补专稿再按专稿收口**（登记为后续可选）。

## 3. 模块结构增量

### `modules/platform/web`

- `src/api/platform-roles-api-client.ts`：接口 + 实现新增 `listStatusLogs`/`createStatusLogs`（§2.1）；`src/api/platform-roles-api-client.spec.ts` 扩断言。
- `src/pages/EmployeesPage.tsx`：**替换占位符**为真列表 + 近况入口（§2.2）。
- `src/pages/StatusTimeline.tsx`（新）：单人脉络抽屉（§2.3）。
- `src/components/EmployeePicker.tsx`（新）：自建人员多选器（§2.4）。
- `src/pages/BatchStatusLogModal.tsx`（新）：批量记录近况 Modal（§2.5）。
- platform web 样式表（`platform-org__*` 所在表，落地前 Grep 定位；建议新增 `platform-employees__*` / `status-timeline__*` / `employee-picker__*` 类）：仅引 token（A1/A4）。
- 测试：
  - `src/pages/EmployeesPage.spec.tsx`（**新建**，替换占位符无测试现状）：列表渲染（mock listEmployees/listDepartments）；「批量记录近况」按钮按 `platform:status-log:create` 权限渲染/不渲染；点「近况」打开抽屉并加载脉络（mock listStatusLogs）+ 翻页 + 空态；点「批量记录近况」打开 Modal、选人 + 填内容 + 提交调 `createStatusLogs` 收到正确 payload；校验拦截（0 人 / 空内容 → 未发请求）；整批 404 失败显 message 且不关闭。
  - `src/components/EmployeePicker.spec.tsx`（新）：搜索过滤、多选 toggle、已选计数、达 100 上限禁选 + 提示、空/无结果态。
  - `src/api/platform-roles-api-client.spec.ts`（扩）：两新方法命中 url + query。
  - （StatusTimeline/BatchStatusLogModal 若拆独立组件可各加 spec，或并在 EmployeesPage.spec 覆盖——以覆盖 §4.2 断言为准。）

### `docs`

- 见 §7（progress / platform-core / verification-log / doc-index；**本切片无 §16 触发、不改 security-baseline**）。

> 不动任何后端代码 / 契约 / 迁移 / 权限点 / 事件 / 调度；不动 presence/files/forms/notification；不碰 M8 其它切片成果；不改 `@work/ui` 共享组件（靠组合既有件实现，避免另起还原门禁面）。

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

### 4.2 断言（必须覆盖）

> **查询范式（避坑）**：`@work/ui` `Input`/`Textarea` 给控件设 `aria-label={label}`——**字段断言用 `getByLabelText`**（对齐 OrganizationPage.spec / M8-2b §4.2 范式）；标题/列头/按钮/文案用 `getByText`/`getByRole`。异步加载用 `await screen.findBy*` / `waitFor`，勿用同步 `getBy*` 抢跑（照 OrganizationPage.spec）。

- **`EmployeesPage.spec.tsx`（mock `setPlatformRuntime` 的 `createHttpClient` get/post）**：
  - **列表渲染**：mock `employees`/`departments` get → 渲染员工行（姓名/工号/账号/部门名/职务/状态 Tag），列头/标题逐字（A3）。
  - **权限门控（二审 B1：mock 权限集须真实，含 `platform:employee:view`）**：用两组 `currentUser.permissions`——
    - `[{code:'platform:employee:view'},{code:'platform:status-log:create'}]`（既能看列表/脉络又能写）→ 「批量记录近况」按钮**在**。
    - `[{code:'platform:employee:view'}]`（只能看、不能写）→ 按钮**不在**（`queryByRole(...).not.toBeInTheDocument()`），但列表与脉络抽屉**仍正常可用**（脉络读用 view 权限，非 create）。
    - **不要**只切 `platform:status-log:create` 的有无而漏掉 `platform:employee:view`——那会构造出"无 view 权限"的失真场景（真实下整页路由都进不来）。
  - **打开脉络抽屉**：点某行「近况」→ 抽屉标题「{name} 的近况脉络」在；`listStatusLogs` 被以正确 `employeeId` + `{limit, offset:0}` 调用；渲染返回的条目（记录人名 / 时间 / 内容）。
  - **脉络分页**：mock total > pageSize → `Pager` 显示；点「下一页」→ `listStatusLogs` 以 `offset=PAGE_SIZE` 再调。
  - **脉络空态**：`items=[]` → 「暂无近况记录」。
  - **记录人降级**：authorEmployeeId 不在 employee 集 → 显示该 id（不报错、不伪"未知"）。
  - **批量提交成功**：打开 Modal → 选 ≥1 人 + 填 content → 点「记录近况」→ `createStatusLogs` 收到 `{ subjectEmployeeIds:[...], content:'...' }`（content 已 trim）；成功后 Modal 关、显「已为 N 名员工记录近况」。
  - **批量校验拦截**：0 人 / 空（仅空白）content → 拦截文案、`createStatusLogs` **未被调用**。
  - **批量整批 404 失败**：`createStatusLogs` reject（统一信封 message）→ 显该 message、**Modal 不关闭**、不假装成功。
- **`EmployeePicker.spec.tsx`**：
  - 搜索过滤：输入子串 → 仅匹配 `name`/`employeeNo`/`account` 的行在。
  - 多选 toggle：点 Checkbox → `onChange` 收到含/去该 id 的数组。
  - 已选计数：选 N 个 → "已选 N 人"。
  - 上限：`maxSelected=100` 且已选 100 → 未选行 Checkbox `disabled` + 「最多选择 100 人」提示。
  - 空/无结果态：员工空 / 搜索无命中 → 诚实提示。
- **`platform-roles-api-client.spec.ts`（扩）**：`listStatusLogs('emp-1', {limit:20, offset:20})` → `http.get('employees/emp-1/status-logs?limit=20&offset=20')`；`createStatusLogs({subjectEmployeeIds:['a','b'], content:'x'})` → `http.post('status-logs', {...})`。
- **A 类自证**：A1 无新 hex（grep 新增 css）、A2 无 emoji 图标、A3 文案 spec 逐字断言、A4 token-only、A5 真实接线 + 诚实占位（无虚构数据）。
- **回归**：platform web 既有测试（OrganizationPage/RolesPage/RoleEditor/api client）**全绿**；shell + 其它包单元/e2e 全绿。
- 验收禁止假数据/占位蒙混；source-review 判定。

## 5. 退出标准

1. web api client 新增 `listStatusLogs`/`createStatusLogs`，命中 `/api/platform/employees/:id/status-logs`（带 limit/offset）与 `/api/platform/status-logs`，响应形状经**实读 M8-4a 后端确认**（非假设）。
2. `EmployeesPage` 落地为真员工列表（`listEmployees` 服务端 scope 过滤、Table 渲染姓名/工号/账号/部门/职务/状态、loading/空/错误三态）替换占位符。
3. 单人近况脉络抽屉：`Drawer` 可关闭、分页 timeline（记录人/时间/纯文本内容、`created_at DESC` 后端序、空态、`Pager` 翻页换算 offset、加载失败重试、纯文本防 XSS）。
4. 批量记录近况：自建 `EmployeePicker`（搜索 + 多选 + 已选计数 + ≤100 上限，**数据源 listEmployees，非 forms 组件**）+ `Textarea` 内容 + 客户端校验（≥1 人 / 非空 / ≤100 / ≤2000，镜像后端仅作即时反馈）+ 调 `createStatusLogs`；成功刷新、**整批 404 如实显信封不假装部分成功**。
5. 「批量记录近况」入口按 `platform:status-log:create` 权限门控（无则整按钮不渲染）。
6. **设计还原度门禁过**（§2.6）：A1–A5 机器自证全过；B 类交互态抽查（无专稿→对照设计系统组件态）；L1/L2 边界落实；**无硬编码 hex/魔法值/emoji 图标**。
7. **纯前端**：不改后端/契约/迁移/权限点/事件；不做人页聚合（M8-5）、不做员工写操作 UI（建档/编辑/状态/角色/重置密码）、不做近况撤销/编辑、不做浏览器 smoke（M8-6）；不改 `@work/ui` 共享组件。
8. 任务包独立 general sub-agent 二审通过；`NODE_ENV=test pnpm verify` 快路径全绿（lint/typecheck/test/test:e2e/build）。

## 6. 必须保持不变（避免越界）

- **不改任何后端代码 / contract 类型 / 迁移 / 权限点 / 事件 / 调度**（M8-4a 已交付两端点 + 契约 + 权限点）。
- **不造人页聚合**（固定+自定义+在位+近况一体 = M8-5）；近况脉络是员工列表的单人抽屉，非聚合人页。
- **不做员工写操作 UI**（建档/编辑/状态/角色/重置密码）；本期 `EmployeesPage` 只读列表 + 近况能力。
- **不做近况撤销/编辑 UI**（后端只追加 + `deleted_at` 预留，无可调 API）。
- **人员多选器自建**（数据源 `listEmployees`），**不假装复用不存在的 forms 人员选择器组件**；**不改 `@work/ui`**（靠组合既有件实现，避免另起还原门禁面）。
- 不删除/替换 platform web 既有真实接线（组织页/角色页）为虚构数据（A5）；不塞虚构内容凑版式。
- 前端不替服务端预判写授权、不静默吞错、不伪装部分成功（整批 404 如实显）。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：M8 切片表标 **M8-4b done**（员工列表 + 近况脉络 + 批量记录前端）+ 下一步 **M8-5**（HR 自定义字段联调 + 人页聚合 + 档案照片）；记一句"近况脉络本期为员工列表单人抽屉，聚合人页留 M8-5"。
- `docs/platform-core.md`：补一句"workbench-shell/platform web 消费 `GET /employees/:id/status-logs` + `POST /status-logs`：员工管理页 = 真列表 + 单人近况脉络抽屉 + 批量记录近况（人员多选器自建，数据源 `listEmployees`）"。
- `docs/verification-log.md`：追加 `M8-4b Status Logs Frontend` 锚点（含还原度门禁 A/B 结论 + 无专稿的还原基准说明 + RFC 两处假设纠偏（无 forms 选择器→自建 / 人页宿主属 M8-5→单人抽屉）+ verify 结论 + 真实门禁数字）。
- `docs/doc-index.md` §7：catalog 增 M8-4b 任务包行。
- **不改** `docs/security-baseline.md`（本切片无 §16 触发——未改数据范围/鉴权/敏感字段/token 规则；纯前端消费既有端点）。
- **不改** `docs/architecture.md`（无架构拓扑变化；近况归属/前端聚合 RFC/M8-4a 已述）。

## 8. 提交规范

- 代码分支由 Codex 负责（`feat/...`），走 PR；本任务包属纯文档，由规划方提交 main。
- **本切片无 §16 原子性例外**：所有文档（progress/platform-core/verification-log/doc-index）均为纯文档，由规划方在切片合并后提交 main（与代码 PR 解耦）；代码 PR 只含 `modules/platform/web` 改动 + 测试。
- 代码提交 Conventional Commits：`feat(platform-web): employees page with status-log timeline drawer and batch status-log entry`。
- 提交信息说明：① `EmployeesPage` 落地真列表替换占位符；② 单人近况脉络抽屉（分页 timeline，消费 `GET /employees/:id/status-logs`）；③ 批量记录近况 Modal + 自建 `EmployeePicker`（数据源 `listEmployees`，非 forms 组件）+ 调 `POST /status-logs`、全有或全无如实处理；④ web api client 加两方法；⑤ 设计还原度门禁（无专稿→锚定设计系统）；⑥ 纯前端无后端/契约改动。
- 合并前：本切片**非安全敏感面，security-reviewer 非强制**；但过设计还原度门禁 + 任务包独立二审；交付前跑完 §4 命令，结论贴进 `docs/verification-log.md`。
