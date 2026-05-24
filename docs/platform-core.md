# Platform Core 第一阶段接口

## 1. 目标

Platform Core 负责所有业务模块共享的基础能力：

- 企业
- 部门
- 员工
- 内部账号
- 角色
- 权限
- 数据范围
- 登录
- 审计与事件预留

业务模块不得自行维护员工、部门、角色、权限。

## 2. 初始接口

`platform-api` 全局前缀：

```text
/api/platform
```

认证：

```text
POST /api/platform/auth/login
GET  /api/platform/auth/me
GET  /api/platform/auth/password-policy
```

除登录和密码策略外，Platform Core API 默认需要 `Authorization: Bearer <accessToken>`。
access token 由 `AuthService` 写入 repository 会话存储。默认 PostgreSQL 实现只保存 token hash，不保存明文 token。

企业与组织：

```text
GET  /api/platform/enterprises
GET  /api/platform/departments
POST /api/platform/departments
```

员工：

```text
GET  /api/platform/employees
POST /api/platform/employees
PUT  /api/platform/employees/:id/status
PUT  /api/platform/employees/:id/roles
```

权限与角色：

```text
GET  /api/platform/menus/my
GET  /api/platform/module-manifests
GET  /api/platform/permissions
GET  /api/platform/roles
POST /api/platform/roles
```

## 3. 认证与权限运行时约定

平台 API 使用两层 guard：

- `PlatformAuthGuard`：解析 Bearer token，验证服务端会话，向 request 注入 `currentUser`。
- `PermissionGuard`：读取 `@RequirePermissions(...)` 元数据，校验当前用户权限码。

权限码由 Platform Core 统一维护。业务模块不得自行发明员工、角色、权限来源；如果需要新权限，先在对应模块 contract/文档中声明，再由 Platform Core 注册。

模块 manifest 由 Platform Core 统一登记。M2-2 起，seed 权限和菜单必须从 manifest 定义派生；不得在 manifest 之外单独维护同一模块的权限点或菜单入口。`GET /api/platform/module-manifests` 需要 `platform:permission:view`，用于查看当前 active 模块 manifest。

菜单由 Platform Core 统一返回。`GET /api/platform/menus/my` 只返回当前用户有权限访问的 active 菜单；业务模块不得自行绕过平台菜单源在 Shell 中注册入口。M2-4 起，Web Shell 登录后通过 `GET /api/platform/auth/me` 恢复当前用户，并通过 `GET /api/platform/menus/my` 渲染导航。
当前用户权限只从 active 角色计算；disabled 角色不得贡献菜单权限、接口权限或数据范围。

当前内置平台权限：

```text
platform:org:view
platform:org:manage
platform:employee:view
platform:employee:create
platform:employee:manage
platform:role:view
platform:role:manage
platform:permission:view
```

## 3.1 introspection 与跨进程认证

`GET /api/platform/auth/me` 除了供 Web Shell 凭已有 access token 恢复当前用户，还正式承担 gateway 与业务服务的 token introspection 职责：传入对外 opaque 令牌（`Authorization: Bearer <token>`），返回 `CurrentUserDto` 或 401。

M4 起 gateway-api 内嵌业务模块时，由 gateway 侧的鉴权 guard 调用 `GET /api/platform/auth/me` 完成 introspection，把 `currentUser` 注入进程内 request；业务模块不直接连 `platform` 数据库验证令牌。跨进程认证的整体模式（对外 opaque、introspection 复用 `/auth/me`、M7 引入内部 JWT）见 `docs/adr/0004-cross-process-auth-phantom-token.md`。

## 3.2 登录失败审计与账号锁定

`POST /api/platform/auth/login` 的失败语义：

- 密码错误时累加 `platform.local_identities.failed_attempts`；连续失败达到 5 次时设置 `locked_until = now() + 15 分钟`，账号进入锁定状态。
- 锁定期内任何登录尝试直接返回 401 "账号已被锁定，请 N 分钟后重试"，不验证密码、不消耗服务端密码 hash 计算。
- 锁定到期视为已过，下一次失败时计数从 1 重新开始（即"过期锁定不累计旧失败数"）。
- 登录成功时 `failed_attempts` 重置为 0、`locked_until` 清空、`last_login_at` 更新。
- 所有登录尝试（成功 / 密码错 / 锁定期内尝试 / 禁用员工尝试）都写入 `platform.audit_logs`，`action: 'auth.login'`，`result: 'success' | 'failure'`，`metadata` 含 `reason` 与 `failedAttempts` 等上下文。**账号不存在不写审计**（防止审计表被用于账号枚举）。
- 锁定参数（5 次 / 15 分钟）由 `getPasswordPolicy()` 暴露给前端，前端可在登录界面提示用户。

## 3.3 改密与重置

平台提供两个改密入口：

- `POST /api/platform/auth/change-password`：已登录用户改自己密码，须验证旧密码。成功后 `must_change_password` 设为 false、清理 `failed_attempts` 与 `locked_until`、`password_updated_at = now()`。
- `PUT /api/platform/employees/:id/password`：需 `platform:employee:manage` 权限。管理员在请求体提供 newPassword。成功后 `must_change_password` **保持为 true**（提示员工下次登录改密），同样清理 `failed_attempts` 与 `locked_until`、`password_updated_at = now()`。

`platform.employees.must_change_password` 与 `platform.local_identities.must_change_password` 是历史冗余字段；上述两个端点在同一事务内同步更新两张表，保持一致。

`LoginResult.user.mustChangePassword` 与 `GET /api/platform/auth/me` 返回的 `CurrentUserDto.mustChangePassword` 反映 employees 表的当前值。M3.5-D 阶段后端不强制拦截 `mustChangePassword=true` 用户访问其它 API；Shell 根据该字段引导用户跳转改密页（M3.5-F 路由改造后真做）。

新增审计 action：`auth.password.change`（用户自己改密）、`platform.employee.password.reset`（管理员重置）。失败场景（旧密错、新密同旧密）也写 audit `result: 'failure'`。

## 4. 种子账号

PostgreSQL seed 默认创建管理员账号：

```text
account: admin
password: 由 PLATFORM_BOOTSTRAP_ADMIN_PASSWORD 注入
```

生产环境必须显式设置 `PLATFORM_BOOTSTRAP_ADMIN_PASSWORD`，且不得使用 `admin123`。内存 repository 仅用于测试或显式本地 fallback，仍保留 `admin/admin123` 方便无数据库 smoke。

## 5. 数据范围

内置数据范围（`DataScope`，定义在 `packages/platform-contract/src/rbac.ts`）：

```text
self
department
department_tree
company
custom
```

业务模块**不允许自行解析** `currentUser.dataScopes`。所有数据范围解析必须经 `PlatformScopeService.resolveScope(currentUser)` 完成，返回结构化的 `PlatformScope`：

```text
kind:               'self' | 'department' | 'department_tree' | 'company'
userId:             string
enterpriseId:       string
departmentId?:      string
departmentIds:      string[]   // department_tree 范围已展开
degradedFromCustom: boolean    // 原本是 custom 被降级为 self 的标志
```

解析规则：

- 多个 active 角色按 **`company > department_tree > department > self`** 取最大；任一含 `company` 即 `company`。
- `disabled` 角色不参与；`currentUser.dataScopes` 由 `auth.service.toCurrentUser` 已过滤。
- `custom` 视作最弱，等价 `self`，`degradedFromCustom=true`。运行时不写 audit。
- `department` / `department_tree` 范围若 `currentUser.departmentId` 为 `undefined`，降级为 `self`，`degradedFromCustom` 不变。

消费方过滤模板：

```text
employee.enterpriseId === scope.enterpriseId  // 第一步：跨企业绝不放行
kind === 'company'             → 直接通过
kind === 'self'                → employee.id === scope.userId
kind === 'department' | 'department_tree' → employee.departmentId ∈ scope.departmentIds
```

当前已接入数据范围的端点：

- `GET /api/platform/employees`（M3.5-E 起）

业务模块的接入计划见各业务 RFC（M4 起 presence board 接入）。

## 6. Repository 实现

当前 `platform-api` 默认使用 PostgreSQL repository。内存 repository 仅作为测试 fixture 或显式本地 fallback，不作为生产默认实现。

Repository 边界保持：

- Controller 不变。
- Contract 不变。
- Service 方法语义不变。
- 存储实现只在 provider 层选择。

Repository 接口：

```text
apps/platform-api/src/repositories/platform.repository.ts
```

默认实现：

```text
apps/platform-api/src/repositories/postgres-platform.repository.ts
```

测试/fallback 实现：

```text
apps/platform-api/src/store/platform-memory.store.ts
```

Provider 通过 `PLATFORM_REPOSITORY_DRIVER` 选择实现：

```text
unset 或 postgres -> PostgresPlatformRepository
memory          -> PlatformMemoryStore
```

无数据库场景必须显式设置：

```powershell
$env:PLATFORM_REPOSITORY_DRIVER="memory"
```

## 7. 审计

Platform Core 写入 `platform.audit_logs`。M2 已覆盖登录成功和平台关键写操作审计：

```text
action: auth.login
resourceType: platform.session
result: success
traceId: 请求 trace id
ip: X-Forwarded-For 首个地址，或 X-Real-IP / request.ip / socket remote address
userAgent: User-Agent 请求头
```

平台写操作审计动作：

```text
platform.department.create
platform.employee.create
platform.employee.status.update
platform.employee.roles.assign
platform.role.create
```

审计记录必须包含 actor、action、resource、result、traceId、ip、userAgent 和必要 metadata。当前策略是不吞掉审计写入错误：业务写入成功但审计写入失败时，请求仍失败，优先暴露审计链路问题。后续如引入 repository unit-of-work，再将业务写入和审计写入收敛为原子事务。
