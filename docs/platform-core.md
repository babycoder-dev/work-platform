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
GET  /api/platform/auth/password-policy
```

除登录和密码策略外，Platform Core API 默认需要 `Authorization: Bearer <accessToken>`。
开发期 access token 由 `AuthService` 写入 repository 会话存储，后续持久化实现应替换为数据库或 Redis backed session/token store。

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
GET  /api/platform/permissions
GET  /api/platform/roles
POST /api/platform/roles
```

## 3. 认证与权限运行时约定

平台 API 使用两层 guard：

- `PlatformAuthGuard`：解析 Bearer token，验证服务端会话，向 request 注入 `currentUser`。
- `PermissionGuard`：读取 `@RequirePermissions(...)` 元数据，校验当前用户权限码。

权限码由 Platform Core 统一维护。业务模块不得自行发明员工、角色、权限来源；如果需要新权限，先在对应模块 contract/文档中声明，再由 Platform Core 注册。

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

## 4. 开发期种子账号

仅开发期内存实现使用：

```text
account: admin
password: admin123
```

正式持久化实现必须改为安装初始化流程生成初始管理员密码，并强制首次登录修改。

## 5. 数据范围

内置：

```text
self
department
department_tree
company
custom
```

## 6. 后续持久化替换

当前 `platform-api` 使用内存 repository，目的是先稳定 API 边界。

后续替换为数据库实现时：

- Controller 不变。
- Contract 不变。
- Service 方法语义不变。
- 只替换 repository 实现层。

Repository 接口：

```text
apps/platform-api/src/repositories/platform.repository.ts
```

当前实现：

```text
apps/platform-api/src/store/platform-memory.store.ts
```

未来 PostgreSQL 实现建议：

```text
apps/platform-api/src/repositories/postgres-platform.repository.ts
```

Nest provider 只需要从：

```ts
{
  provide: PLATFORM_REPOSITORY,
  useExisting: PlatformMemoryStore,
}
```

切换为：

```ts
{
  provide: PLATFORM_REPOSITORY,
  useClass: PostgresPlatformRepository,
}
```
