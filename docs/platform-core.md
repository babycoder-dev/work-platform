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

## 4. 种子账号

PostgreSQL seed 默认创建管理员账号：

```text
account: admin
password: 由 PLATFORM_BOOTSTRAP_ADMIN_PASSWORD 注入
```

生产环境必须显式设置 `PLATFORM_BOOTSTRAP_ADMIN_PASSWORD`，且不得使用 `admin123`。内存 repository 仅用于测试或显式本地 fallback，仍保留 `admin/admin123` 方便无数据库 smoke。

## 5. 数据范围

内置：

```text
self
department
department_tree
company
custom
```

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
