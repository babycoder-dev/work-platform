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

## 3. 开发期种子账号

仅开发期内存实现使用：

```text
account: admin
password: admin123
```

正式持久化实现必须改为安装初始化流程生成初始管理员密码，并强制首次登录修改。

## 4. 数据范围

内置：

```text
self
department
department_tree
company
custom
```

## 5. 后续持久化替换

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
