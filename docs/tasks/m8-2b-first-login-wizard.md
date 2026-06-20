# Task: M8-2b 首登向导（前端）—— `mustChangePassword` 网关 → 强制改密 + 强制补全本人档案 → 进工作台

## 状态

Ready for execution ｜ 起草 2026-06-20 ｜ 独立 general sub-agent 二审已过（0 Blocking / 3 Major + 数条 Minor，已逐条复核并修订：① `http` 泛型写法点名 §2.2、② `Input` 双 label 测试陷阱→字段用 `getByLabelText` §4.2、③ `name` "必填非空" vs 三态"未碰不传"矛盾→`name` 恒传当前值、三态仅适用 title/mobile/email §2.3）。重点项 A–I（前缀/契约可 import/Modal noop 不可关闭/bootstrap 清网关/门禁自洽/无越界）均经实读验证 OK。

## 0. 任务定位

M8 的**首个前端切片**，也是 M8-2a 后端读写端点的第一个真实消费者。把"HR 建账号后员工首次登录"的体验补满：登录成功后若
`currentUser.mustChangePassword === true`，**不直接进工作台**，而是先走一个**不可关闭的两步向导**——① 强制改密、② 强制补全本人
档案——两步都过才落入 AppShell。

**纯前端切片**：复用 M8-2a 已交付的 `GET /employees/me`、`PUT /employees/me/profile` 与既有 `POST auth/change-password`、
`GET auth/password-policy`。**不改任何后端代码、不改任何 contract 类型**（所需类型 `ChangePasswordInput`/`PasswordPolicyDto`/
`UpdateMyProfileInput`/`EmployeeDto` 均已存在）。

本切片交付：

1. **shell 平台客户端扩展**（`apps/workbench-shell/src/platform/platform-api.ts`）：新增 `changePassword` / `getPasswordPolicy` /
   `getMyProfile` / `updateMyProfile` 四个方法（复用既有 `/api/platform/` base + `@work/http-client`）。
2. **首登向导组件 `FirstLoginWizard`**（`apps/workbench-shell/src/app/`，与 `LoginView`/`AppShell`/`WorkbenchHome` 同款导出供测试）：
   用 `@work/ui` 的 `Modal` 承载、**不可关闭**（点遮罩/Esc 无效、无关闭按钮）、两步状态机（改密 → 补全），保留"退出登录"逃生口。
3. **App 网关插入**（`apps/workbench-shell/src/app/App.tsx`）：在"已登录但 `mustChangePassword`"时渲染向导而非 `AppShell`；
   完成回调重跑 `bootstrap()`（此时 `auth/me` 返回 `mustChangePassword:false`）→ 自然落入 AppShell。
4. **设计还原度门禁**（development-workflow §7）：本屏**无专属设计稿**（交接包只有登录页 + 外壳），还原基准锚定**既有设计系统**
   （`@work/ui` `Modal` + 登录卡表单视觉语言 + tokens），A 类机器自证全做、B 类覆盖交互态、L1/L2 边界写清（§2.5）。

> **决策依据（本次与产品/设计 owner 确认）**：向导形态 = **不可关闭的居中 Modal**（非全屏卡、非外壳内面板）；补全强度 =
> **改密强制 + 补全强制**（两步都过才进工作台）。见 §2.3 / §2.4。

**本切片不做**（划清边界）：

- 任何后端改动 / contract 改动 / 迁移 / 权限点（M8-2a 已交付端点；改密端点既有）。
- 个人信息编辑页（头像菜单"个人信息"项、人页档案编辑）→ **M8-5**（向导只是首登一次性补全，不是常驻编辑页）。
- `profile.updated` 事件 / 通知 → **M8-3**（补全是**本人改本人**，按 M8-2a §2.3 / RFC §6 本人改本人**不发**事件；向导不触发）。
- 近况记录 / 部门 CRUD UI / 人页聚合 → M8-4 / M8-5。
- 全链路浏览器 smoke（建账号→首登→改密→补全→档案可见 端到端）→ **M8-6**（本切片只做 web 单测层）。
- **不修后端密码策略服务端强制缺口、不修 `mustChangePassword` 客户端网关性质**（均为既有事实，非本切片引入——见 §2.7 安全观察，登记 follow-up 候选）。

> **门禁判定（写进任务包供二审复核）**：本切片**只落 `apps/workbench-shell/src`（前端）**，**不触及** `apps/platform-api/src/{auth,scope,audit,security,rbac,repositories}`、
> guard、data-scope、token/session、迁移——**不属安全敏感面，security-reviewer 非强制**。但仍走两道既有门禁：① **任务包本身的独立 general sub-agent 二审**
> （带决策真值清单，逐条复核）；② **设计还原度门禁**（§2.5，development-workflow §7）。§2.7 列出的两条安全观察为**既有事实**，本切片不修，仅登记。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、**统一错误信封**、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m8-people-org-profile.md`（**本切片权威规格**）——重点 **§10 前端范围**（"首登向导：`mustChangePassword=true` → 强制改密
   （`auth/change-password`）+ 补全本人档案（`/employees/me/profile`）后才进工作台"；"前端测试走 `vitest.web.config.mts`，`NODE_ENV=test`"）、
   **§7 HTTP API**（`GET /employees/me`、`PUT /employees/me/profile`、`POST auth/change-password` 已就绪）、**§17 切片计划** M8-2b 行（依赖 M8-2a）、
   **§16 退出标准** 第 3 条（首登链路跑通）
4. `docs/development-workflow.md` **§7 设计还原度门禁**（A1–A5 机器自证 + B 类交互态抽查 + L1/L2 边界）——本切片必过
5. `docs/tasks/ui-foundation-fidelity.md` §2（门禁立意与边界）、`docs/design/ui-handoff/README.md` §5.1 登录页 + §7 组件库规格（**还原基准的来源**：
   本屏无专稿，锚定登录卡表单视觉 + Modal 组件）、`docs/design/ui-handoff/design/tokens.css`（token 唯一真源，**只读**）
6. `apps/workbench-shell/CLAUDE.md`（host 如何挂模块；web 测试 `*.spec.tsx` 走 `vitest.web.config.mts`）
7. 既有范式代码（**照搬，不要另起炉灶**）：
   - **登录视图 + 会话/网关范式**：`apps/workbench-shell/src/app/App.tsx`（`SessionState`、`handleLogin`/`bootstrap`/`handleLogout`、
     L174 `if (!session.accessToken || !session.currentUser) return <LoginView/>` 网关、`LoginView` 表单/`login-card` 视觉、导出供测试范式）
   - **平台客户端范式**：`apps/workbench-shell/src/platform/platform-api.ts`（`createPlatformApiClient`、`http.post/get`、base `/api/platform/`）
   - **token 存储**：`apps/workbench-shell/src/platform/session-storage.ts`
   - **Modal 组件**：`packages/ui/src/components/Modal/Modal.tsx`（`work-modal`/`work-scrim`，**注意**：内置 `useEscape` + 点遮罩 `onClick={onClose}`、
     无关闭按钮——做"不可关闭"靠**传 `onClose={noop}`**，§2.3）
   - **表单组件**：`packages/ui/src/components/{Input,Button,Checkbox}`（登录页同款；`Input` 支持 `label`/`prefix`/`size="lg"`/`type="password"`）
   - **web 测试范式**：`apps/workbench-shell/src/app/App.spec.tsx`（`vi.mock('../platform/platform-api')`、`render(<App/>)`、`userEvent`、
     "fidelity gate A3 — exact design copy" 文案断言、`currentUser` fixture 含 `mustChangePassword`）
   - **契约（已存在，勿新增）**：`packages/platform-contract/src/auth.ts`（`ChangePasswordInput`/`PasswordPolicyDto`/`CurrentUserDto.mustChangePassword`）、
     `packages/platform-contract/src/users.ts`（`UpdateMyProfileInput`/`EmployeeDto`，M8-2a 已加）

## 2. 设计要点（严格遵守）

### 2.1 现状盘点与集成点（决定本切片只做前端接线）

- **`CurrentUserDto.mustChangePassword: boolean` 已存在**（`auth.ts:26`）：登录结果（`LoginResult.user`）与 `auth/me`（bootstrap）都携带。
  **触发器就绪**，本切片只需在 shell 消费它。
- **shell 当前完全不拦截**（`App.tsx:174`）：仅判 `accessToken && currentUser` 即进 `AppShell`，`mustChangePassword=true` 的人直接进工作台。
  本切片在此插入向导网关（§2.4）。
- **改密不吊销当前会话**（`auth.service.ts:158-230` 仅 `updatePassword({mustChangePassword:false})` + 审计，**不删 session**）：故改密成功后
  **同一 access token 仍有效**，向导可用它继续 step2 调 `me/profile`，完成后重跑 `bootstrap()` 自然落入 AppShell，**无需重登**。
- **`@work/http-client` 暴露 `put`**（`create-http-client.ts:155`）：`me/profile`（PUT）可调。
- **所需 contract 类型全已存在**：本切片**不新增/不改任何 `packages/platform-contract` 类型**。

### 2.2 平台客户端扩展（`apps/workbench-shell/src/platform/platform-api.ts`）

在 `PlatformApiClient` 接口与 `createPlatformApiClient` 实现里新增四个方法（沿用同一个 `http`，base `/api/platform/`）：

```ts
changePassword(input: ChangePasswordInput): Promise<void>;          // http.post('auth/change-password', input)
getPasswordPolicy(): Promise<PasswordPolicyDto>;                    // http.get('auth/password-policy')
getMyProfile(): Promise<EmployeeDto>;                               // http.get('employees/me')
updateMyProfile(input: UpdateMyProfileInput): Promise<EmployeeDto>; // http.put('employees/me/profile', input)
```

- **`http` 泛型实参顺序是 `<TResponse, TBody>`（`http-client/src/types.ts`），别让 Codex 猜**。确切写法：
  - `changePassword`：`await http.post<{ success: true }, ChangePasswordInput>('auth/change-password', input);`（后端 `auth.controller.ts:44` 实返 `{ success: true }`；
    对外签名声明 `Promise<void>`、`await` 后不 return 即可——向导只看是否 resolve，**不要写 `http.post<void>`** 以免把响应体类型抹成 void）。
  - `getMyProfile`：`http.get<EmployeeDto>('employees/me')`；`updateMyProfile`：`http.put<EmployeeDto, UpdateMyProfileInput>('employees/me/profile', input)`；
    `getPasswordPolicy`：`http.get<PasswordPolicyDto>('auth/password-policy')`（该端点 `@Public()`，带 token 调亦可，无需特殊处理）。
- **路由前缀复核（不要凭记忆假设）**：`auth/*`、`menus/my` 已验证走 `/api/platform/`；`employees/me`/`employees/me/profile` 须解析为
  `/api/platform/employees/me(/profile)`。落地前**读 `apps/platform-api` 全局前缀（`setGlobalPrefix`/main 启动）与 gateway 装配**确认 `employees` 控制器
  在 `/api/platform/employees` 暴露（M8-2a 的 e2e 已经此路由命中，可对照 `apps/platform-api/src/platform-api.e2e-spec.ts`）。若前缀不同，按实际修正 base/path，**不要硬编码错前缀**。
- 错误沿用 `@work/http-client` 抛出的统一信封 `Error`（向导用 `readErrorMessage` 同款取 `.message`，照搬 `App.tsx` 既有 helper 或复用之）。

### 2.3 `FirstLoginWizard` 组件（`apps/workbench-shell/src/app/`，导出供测试）

**承载 = `@work/ui` `Modal`，不可关闭**：

- 传 `open` 恒 `true`、`onClose={() => {}}`（**noop**）。`Modal` 内置的 Esc（`useEscape`）与点遮罩（`onClick={onClose}`）都将调用 noop = **无任何效果**；
  `Modal` 本身**无关闭按钮**——故无需改共享 `@work/ui` 组件即得"不可关闭"。**禁止**为此改 `Modal`（改共享组件会另起还原门禁面，且非必要）。
- `Modal` 的 `title`/`description`/`footer`/`children` 用于承载向导标题、步骤说明、底部按钮、步骤表单。

**两步状态机**（`step: 'password' | 'profile'`，初始 `'password'`）：

- **Step 1 改密（强制）**：
  - 字段：`oldPassword` / `newPassword` / `confirmPassword`（均 `type="password"`，复用 `@work/ui` `Input`，`size="lg"`、`label`、`prefix` 锁图标，登录卡同款）。
  - **客户端校验（提交前，纯 UX）**：先 `getPasswordPolicy()` 取策略并展示规则文案（最少 `minLength` 位、`requireNumber` 则"需含数字"等）；
    校验 `newPassword.length >= policy.minLength`、`policy.requireNumber` 时含数字、`newPassword === confirmPassword`、`newPassword !== oldPassword`。
    任一不过 → 字段级红框 + 文案拦截（沿用登录卡 `login-card__error` 错误展示惯例），**不发请求**。
  - 提交 → `api.changePassword({ oldPassword, newPassword })`。
    - 成功 → `step = 'profile'`（并触发 step2 预载，见下）。
    - 失败（如后端 401「原密码错误」/「新密码不能与原密码相同」、400 `@MinLength(8)`）→ 取 `error.message` 展示在 step1 错误区，**停留 step1**。
  - **诚实**：客户端策略校验仅为即时反馈；服务端实际只强制 `@MinLength(8)` + 旧密码正确 + 新旧不同（见 §2.7 观察②），向导文案不得宣称比服务端更强的保证。
- **Step 2 补全本人档案（强制）**：
  - 进入 step2 即 `getMyProfile()` 预载，回填 `name/title/mobile/email` 现值（HR 建账号时 `name` 通常已有）。预载失败 → 错误区 + 重试按钮，不静默。
  - 字段：`name`（**必填非空**——身份字段，复用 M8-2a 窄 DTO 语义 `name` 不可清空）、`mobile`（**必填非空**）、`email`（选填，填了须邮箱格式）、`title`（选填）。
    > **必填字段集为可微调项（待评审-minor）**：默认 `name`+`mobile` 必填、`email` 选填带格式校验、`title` 选填。二审/产品可调整必填集，但"补全步骤不可跳过"不可变。
  - **三态入参（命门：`name` 与可空字段分两套规则，勿混用）**——对齐 M8-2a 窄 DTO（`employee.dto.ts`：`name` 是 `@ValidateIf(v!==undefined) @IsNotEmpty()`，即**传了就不能空、可不传**；`title/mobile/email` 是 `@IsOptional` + `@ValidateIf(v!==null)`，三态 `undefined=不改 / null=清空 / string=设值`）：
    - **`name`**：**始终传当前值（前端非空校验通过后），即恒 `string`**。**不要**对 `name` 套"未触碰→不传"——否则与"name 必填"自相矛盾（二审 Major）。`name` 永不传 `null`/`undefined`。
    - **`title/mobile/email`（仅这三个适用三态）**：有值 → `string`；选填字段被用户删空原值 → `null`（清空）；未触碰且本就为空 → 可不传（`undefined`）。`mobile` 因必填，校验通过后恒 `string`。
    - **不传任何管理字段**（窄 DTO 已硬剔除 `departmentId/status/roleIds`，向导也不声明这些）。
  - 提交 → `api.updateMyProfile(input)`。成功 → 调 `onCompleted()`（§2.4）。失败 → 错误区，停留 step2。
- **逃生口（防困死）**：向导 footer 或角落提供「退出登录」文本链接 → 调 `onLogout()`（清 token 回登录页）。避免无法完成补全的用户被永久困在向导。
- **加载态**：两步提交按钮在请求中 `disabled` + 文案"处理中"（登录卡同款），防重复提交。
- **步骤指示**：标题区给出"第 1/2 步 · 设置新密码"/"第 2/2 步 · 完善个人信息"之类的进度提示（线性、克制，token 间距）。

组件 props（建议）：

```ts
function FirstLoginWizard(props: {
  api: Pick<
    PlatformApiClient,
    'changePassword' | 'getPasswordPolicy' | 'getMyProfile' | 'updateMyProfile'
  >;
  onCompleted: () => void | Promise<void>;
  onLogout: () => void;
}): JSX.Element;
```

### 2.4 App 网关插入（`apps/workbench-shell/src/app/App.tsx`）

在既有登录网关（L174-183）**之后**、`return <Router>` 之前插入：

```ts
if (session.currentUser.mustChangePassword) {
  return (
    <FirstLoginWizard
      api={api}
      onCompleted={handleFirstLoginCompleted}
      onLogout={handleLogout}
    />
  );
}
```

- `handleFirstLoginCompleted = useCallback(async () => { await bootstrap(); }, [bootstrap])`：补全成功后**重跑 `bootstrap()`** →
  `auth/me` 此时返回 `mustChangePassword:false` → `setSession` 更新 `currentUser` → 网关条件不再成立 → 落入 `AppShell`。
  （`bootstrap` 已存在且会刷新 `currentUser` + `menus` + `applyRuntime`；无需新增刷新逻辑。）
- `api` 已 memo 在 `session.accessToken` 上，向导期间 token 已置，`api` 即带 token 的客户端，直接传入。
- **不改**登录网关、`bootstrap`、`handleLogin`、`handleLogout` 既有行为；仅**新增**一个 `mustChangePassword` 分支与一个完成回调。

### 2.5 设计还原度门禁（development-workflow §7）—— **无专稿，锚定设计系统**

> **关键还原决策**：交接包**没有首登向导专属设计稿**（只有登录页 + 外壳 + 5 个业务屏）。本屏属"真实存在但无专稿"的界面——
> 还原基准**不是某张截图**，而是**既有设计系统**：`@work/ui` `Modal`（`work-modal`/`work-scrim`）承载 + **登录卡表单视觉语言**
> （`Input size="lg"` + 锁/用户图标 + `Button block/lg/primary` + label/间距/错误区）+ tokens。即"用 L1 视觉系统的现成组件与 token 搭建本屏"。

- **A 类（实现方交付前机器自证，全做）**：
  - **A1 零硬编码 hex**：向导新增的任何 CSS（与 `login-page`/`login-card` 同处的 shell 样式表）颜色只引 `var(--*)`；唯一可出现 hex 的是 `tokens.css`。
  - **A2 零 emoji 当图标**：步骤/字段图标一律 `@work/ui` `Icon` 线性 SVG，不得 emoji/首字母占位。
  - **A3 关键文案逐字一致**：在 `*.spec.tsx` 断言向导标题、两步说明、字段 label、按钮文案、密码规则文案、错误文案等精确字符串。
  - **A4 间距/圆角/阴影/字体只引 token**：`--sp-*`/`--r-*`/`--shadow-*`/`--font(-size)-*`；非 4px 网格值用 `calc(token …)`，不写裸魔法值。复用 Modal/登录卡既有 token 化样式。
  - **A5 真实接线/诚实占位**：向导调真实 `auth/change-password` + `employees/me(/profile)`，**不造假数据**；预载失败给诚实错误+重试，不硬塞内容；
    **不得破坏** App.spec 既有"登录→bootstrap→AppShell"（`mustChangePassword:false`）回归。
- **B 类（评审方人工抽查，定稿前）**：因无专稿，并排比对的对照物 = **登录页 + `Modal` 既有组件态**（确认向导视觉与之同系、无违和魔法值）。
  **必须覆盖交互态**：step1 校验红框 / 原密码错误 / 提交 loading / step1→step2 切换 / step2 预载中 / 预载失败重试 / 长报错不撑破布局。可用无头浏览器对每态各截一张比对。
- **L1 / L2 边界**：
  - **L1（严格还原既有视觉系统）**：Modal 承载 + 遮罩、表单字段（Input/Button/Checkbox 组件态）、token 化间距/圆角/阴影/字体、文案逐字、错误/加载交互态。
  - **L2（本屏特有、无专稿部分仅"用设计系统组件渲染真实流程"）**：两步版式与步骤指示**无专属截图可对**，故按登录卡 + Modal 组件样式自然组织即可，
    **不为此造视觉规范、不照搬任何业务屏的虚构内容**；待未来补专稿再按专稿收口（登记为后续可选）。

### 2.6 校验与错误处理（细则）

- step1 客户端校验文案与 `getPasswordPolicy()` 返回值联动（minLength=8、requireNumber=true 为当前值，但**从接口取、不写死数字**，策略变了文案自动跟随）。
- 后端错误（统一信封）直接展示 `error.message`（中文）：原密码错误 / 新密码不能与原密码相同 / 新密码至少 8 位 等。
- step2 `email` 客户端格式校验仅 UX；服务端 `me/profile`（M8-2a）已用 `@IsEmail` 兜底。
- 所有提交防抖：请求中禁用按钮。

### 2.7 安全观察（**既有事实，非本切片引入；本切片不修，登记 follow-up 候选**）

> 写进任务包供二审与规划方知情。二者均为**后端既有行为**，M8-2b 是前端切片，**不在本切片修复**，仅如实记录，避免被误读为本切片引入的缺陷或假绿。

1. **`mustChangePassword` 是客户端 UX 网关，非后端硬阻断**：登录即签发 token（`mustChangePassword=true` 不阻断签发），其它受保护端点**不因该标志拒绝**。
   即持 token 直接调 API 可绕过前端向导。本切片维持既有设计（前端引导改密），**不把它升级为后端硬门禁**（那属 auth 安全面变更，需 §16 + security-reviewer，越界）。
2. **改密未服务端强制密码策略**：`ChangePasswordDto` 仅 `@MinLength(8)`，`auth.service.changePassword` 只校验旧密码正确 + 新旧不同；
   `getPasswordPolicy()` 的 `requireNumber` 等**未在服务端强制**。向导客户端按策略校验仅为 UX，**不代表服务端保证**。
3. **补全强制不跨会话持久**：唯一持久网关标志是 `mustChangePassword`，它在**改密成功即清零**。若用户在 step1 改密后、step2 补全前中断（关页/超时），
   下次登录 `mustChangePassword=false` → **直接进工作台、档案未补全**。本切片的"补全强制"是**单次向导会话内**的强制，**不提供跨重载的持久强制**
   （持久强制需后端"档案已补全/注册完成"门禁，非本切片范围）。**作为 L2 边界 + follow-up 候选登记**（未来如需可加后端 profile-completed 门禁）。

> 这三条均建议规划方在 `docs/foundation-progress.md` §7.1 已知安全/产品 follow-up 表登记（与 M8-2a create-scope follow-up 并列），由后续切片（或 M8 收尾）决断是否升级为硬门禁。

## 3. 模块结构增量

### `apps/workbench-shell`

- `src/platform/platform-api.ts`：`PlatformApiClient` 接口 + 实现新增 `changePassword`/`getPasswordPolicy`/`getMyProfile`/`updateMyProfile`（§2.2）。
- `src/app/FirstLoginWizard.tsx`（新文件）或并入 `App.tsx` 同款导出：`FirstLoginWizard` 组件（§2.3）。**建议独立文件**便于测试与后续维护，从 `App.tsx` import。
- `src/app/App.tsx`：插入 `mustChangePassword` 网关分支 + `handleFirstLoginCompleted`（§2.4）；**不改**既有登录/bootstrap/logout 行为。
- shell 样式表（`login-page`/`login-card` 所在的全局 css，落地前 Grep 定位）：新增向导专属类（如 `first-login__*`），**仅引 token**（A1/A4）。
- 测试：
  - `src/app/FirstLoginWizard.spec.tsx`（新）：组件级两步流、不可关闭、校验、错误、补全、onCompleted/onLogout（§4.2）。
  - `src/app/App.spec.tsx`（扩展）：`mustChangePassword:true` 登录 → 渲染向导而非 AppShell；向导完成 → 重 bootstrap → AppShell；
    `mustChangePassword:false` → 直接 AppShell（既有回归不破）。

### `docs`

- 见 §7（progress / platform-core / verification-log；**本切片无 §16 触发、不改 security-baseline**）。

> 不动任何后端代码、contract、迁移、权限点、事件、调度；不动 presence/files/forms/notification；不碰 M8 其它切片成果。

## 4. 验证

### 4.1 命令（全过，`NODE_ENV=test`）

```bash
pnpm install                    # 无新依赖，通常免
NODE_ENV=test pnpm lint && NODE_ENV=test pnpm typecheck
NODE_ENV=test pnpm test         # 单元 + web（务必 NODE_ENV=test，否则 React.act 被生产剥离致 web 测试假挂——见记忆）
NODE_ENV=test pnpm test:e2e     # in-memory e2e（本切片不新增 e2e，跑回归确认不破）
NODE_ENV=test pnpm build
```

> 本切片**无后端/无迁移/无部署形态变更**：`test:db` / `test:e2e:postgres` / `docker:build` **非必跑**（留 M8-6）。
> 本机若 Node 25 致 jsdom `localStorage` 报错，按记忆用 `NODE_OPTIONS=--localstorage-file` 绕过（CI Node22 不受影响）。

### 4.2 断言（必须覆盖）

> **查询范式（避坑，二审 Major）**：`@work/ui` `Input` 给 `<input>` 同时设 `aria-label={label}` 且渲染一个可见 `<span>` label（`Input.tsx`）。
> 故**字段断言一律用 `getByLabelText(...)`**（对齐 `App.spec.tsx:119` 既有范式，取 aria-label，不会与可见 span 文本相撞）；**标题/步骤说明/规则/错误/按钮文案用 `getByText` / `getByRole`**。
> 异步：step1→step2 经 `changePassword` resolve→`setStep`→step2 `getMyProfile` 预载（两次异步 setState），断言用 `await screen.findBy*` 等预载落定，勿用同步 `getBy*` 抢跑。

- **`FirstLoginWizard.spec.tsx`（组件级，mock `api`——mock 对象须含全部四方法 `changePassword`/`getPasswordPolicy`/`getMyProfile`/`updateMyProfile`）**：
  - **初始渲染 step1**：标题/步骤说明/三个密码字段 label/按钮/密码规则文案 = 设计文案（A3 逐字）。
  - **不可关闭**：按 Esc、点遮罩 → 向导**仍在**（不卸载、不调任何关闭副作用）；无关闭按钮。
  - **step1 客户端校验拦截**：新密码短于 `minLength` / 不含数字（策略要求时）/ 两次不一致 / 新旧相同 → 红框+文案、**`api.changePassword` 未被调用**。
  - **step1 后端失败**：`api.changePassword` reject（如「原密码错误」）→ 展示该 message、**停留 step1**、不进 step2。
  - **step1 成功 → step2**：`api.changePassword` resolve → 进入 step2、`api.getMyProfile` 被调用、字段回填现值。
  - **step2 预载失败**：`getMyProfile` reject → 错误+重试，不静默、不进工作台。
  - **step2 必填拦截**：`name`/`mobile` 空 → 拦截、`api.updateMyProfile` 未调；`email` 填非法格式 → 拦截。
  - **step2 三态入参**：补全提交 → `api.updateMyProfile` 收到正确 `UpdateMyProfileInput`（有值=string、清空选填=null、未碰空=不传）；**不含** `departmentId/status/roleIds`。
  - **step2 成功 → onCompleted**：`api.updateMyProfile` resolve → `onCompleted` 被调用一次。
  - **逃生口**：点「退出登录」→ `onLogout` 被调用。
- **`App.spec.tsx`（应用级，扩展，mock `createPlatformApiClient`）**：
  > 新用例的 mock platformApi **必须补齐四个新方法**（`changePassword`/`getPasswordPolicy`/`getMyProfile`/`updateMyProfile`），**不要**复用既有"只有 `login`/`bootstrap`"的 mock 形状（`App.spec.tsx:203-212`）——否则向导渲染即 `undefined is not a function`。
  - 登录返回 `currentUser.mustChangePassword:true` → 渲染**向导**（断言向导标题/step1 字段在、**AppShell 的工作台问候/侧栏不在**）。
  - mock `changePassword`/`getMyProfile`/`updateMyProfile` resolve + `bootstrap` 第二次返回 `mustChangePassword:false`（`mockResolvedValueOnce` 链）→ 走完向导 → **落入 AppShell**（`await findBy` 工作台问候出现）。
  - 登录返回 `mustChangePassword:false`（既有 fixture）→ **直接 AppShell**，不渲染向导（既有回归不破）。
- **A 类自证**：A1 无新 hex（grep 新增 css）、A2 无 emoji 图标、A3 文案 spec 断言、A4 token-only、A5 真实接线 + 既有回归保留。
- **回归**：shell 既有 web 测试（登录、导航、通知、搜索、工作台）**全绿**；其它包单元/e2e 全绿。
- 验收禁止假数据/占位蒙混；source-review 判定。

## 5. 退出标准

1. 登录后 `mustChangePassword=true` → 渲染**不可关闭**的两步向导（点遮罩/Esc/无关闭按钮均无法跳过），`mustChangePassword=false` → 直接 AppShell（回归不破）。
2. Step1 强制改密：客户端按 `getPasswordPolicy()` 校验（不写死数字）+ 调 `POST auth/change-password`，成功进 step2、失败留 step1 显信封 message。
3. Step2 强制补全：预载 `GET employees/me` 回填 + 必填校验 + 调 `PUT employees/me/profile`（三态入参、不透传管理字段），成功 → `onCompleted` 重 bootstrap → AppShell。
4. shell 平台客户端新增四方法，base/path 经**实读确认**（非假设）；改密后**不重登**（同 token 续用，§2.1 已证会话不吊销）。
5. 提供「退出登录」逃生口；加载态防重复提交。
6. **设计还原度门禁过**（§2.5）：A1–A5 机器自证全过；B 类交互态抽查（无专稿→对照登录卡 + Modal 组件态）；L1/L2 边界落实；**无硬编码 hex/魔法值/emoji 图标**。
7. **纯前端**：不改后端/contract/迁移/权限点/事件；§2.7 三条安全观察如实记录为 follow-up 候选，**本切片不修**。
8. 任务包独立 general sub-agent 二审通过；`NODE_ENV=test pnpm verify` 快路径全绿（lint/typecheck/test/test:e2e/build）。

## 6. 必须保持不变（避免越界）

- **不改任何后端代码 / contract 类型 / 迁移 / 权限点 / 事件 / 调度**；不把 `mustChangePassword` 升级为后端硬门禁；不修密码策略服务端强制（§2.7①②，均越界）。
- **不发 `profile.updated` / 任何事件**：补全是本人改本人，M8-2a 收口 service 对本人改本人本就不发（M8-3 才接通他人改的事件）。向导只调 `me/profile`。
- **不改 `@work/ui` `Modal`**：靠 `onClose={noop}` 实现不可关闭，不动共享组件（改它另起还原门禁面）。
- 不动 `App.tsx` 既有登录/bootstrap/logout 行为，仅新增 `mustChangePassword` 分支 + 完成回调。
- 不做个人信息编辑页 / 人页聚合 / 近况 / 部门 UI（M8-4/M8-5）；不做全链路浏览器 smoke（M8-6）。
- 不删除/替换 shell 既有真实接线（通知流、菜单、工作台）为虚构数据（A5）。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：M8 切片表标 M8-2b done + 下一步 M8-3（`profile.updated`）/ M8-4（近况）；
  §7.1 已知 follow-up 表登记 §2.7 三条安全/产品观察（客户端网关性质 / 密码策略服务端未强制 / 补全跨会话不持久）。
- `docs/platform-core.md`：补一句"workbench-shell 首登向导消费 `auth/change-password` + `employees/me(/profile)`，`mustChangePassword` 为前端引导网关"。
- `docs/verification-log.md`：追加 `M8-2b First-Login Wizard` 锚点（含还原度门禁 A/B 结论 + 无专稿的还原基准说明 + §2.7 观察登记 + verify 结论）。
- **不改** `docs/security-baseline.md`（本切片无 §16 触发——未改数据范围/鉴权/敏感字段/token 规则；§2.7 是既有事实登记，非规则变更）。
- **不改** `docs/architecture.md`（无架构拓扑变化）。

## 8. 提交规范

- 代码分支由 Codex 负责（`feat/...`），走 PR；本任务包属纯文档，由规划方提交 main。
- **本切片无 §16 原子性例外**：所有文档（progress/platform-core/verification-log）均为纯文档，由规划方在切片合并后提交 main（与代码 PR 解耦）；
  代码 PR 只含 `apps/workbench-shell` 改动 + 测试。
- 代码提交 Conventional Commits：`feat(shell): first-login wizard — forced change-password + profile completion gate on mustChangePassword`。
- 提交信息说明：① `mustChangePassword` 前端网关 + 不可关闭两步向导；② 复用 M8-2a `employees/me(/profile)` + 既有 `auth/change-password`，无后端/契约改动；
  ③ 改密不吊销会话、完成后重 bootstrap 入壳；④ 设计还原度门禁（无专稿→锚定登录卡+Modal）；⑤ §2.7 三条安全观察为既有事实、本切片不修仅登记。
- 合并前：本切片**非安全敏感面，security-reviewer 非强制**；但过设计还原度门禁 + 任务包独立二审；交付前跑完 §4 命令，结论贴进 `docs/verification-log.md`。
