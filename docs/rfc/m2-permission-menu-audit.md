# RFC: M2 权限、菜单、审计闭环

## 状态

Accepted

## 1. 目标

M2 的目标是把模块接入工作台所需的三条平台链路闭合：

- 权限点由 Platform Core 统一注册和分配。
- 菜单由 Platform Core 统一返回，并按当前用户权限过滤。
- 关键平台操作写入审计日志。

完成 M2 后，业务模块接入时不得绕过 Platform Core 自建权限、菜单或审计来源。

## 2. 非目标

M2 不实现：

- 完整菜单管理后台。
- 复杂数据权限表达式编辑器。
- 审计日志查询后台。
- domain event/outbox 激活。
- Web Shell 权限菜单渲染的完整交互。

这些能力在 M3 或后续模块接入中继续补齐。

## 3. 当前基础

M1 已预建以下表：

```text
platform.permissions
platform.roles
platform.role_permissions
platform.module_manifests
platform.menus
platform.audit_logs
```

M1 已完成：

- `platform-api` 默认 PostgreSQL repository。
- seed 初始化平台权限、管理员角色和管理员账号。
- `PermissionGuard` 基于当前用户权限码做接口鉴权。

## 4. 首个切片

M2-1 先做最小闭环：

- seed 写入平台首批菜单。
- 新增 `GET /api/platform/menus/my`。
- 菜单按当前用户权限过滤。
- 登录成功写入 `platform.audit_logs`。
- repository integration 和 E2E 覆盖菜单与审计。

## 5. API

```text
GET /api/platform/menus/my
```

认证：

- 必须登录。
- 不要求额外权限。

返回：

```ts
{
  items: MenuDto[]
}
```

过滤规则：

- `status = active`。
- `permissionCode` 为空的菜单对所有登录用户可见。
- `permissionCode` 非空时，当前用户必须拥有该权限。
- 当前用户权限只从 active 角色计算；disabled 角色不得贡献权限或数据范围。
- 返回顺序为 `sortOrder ASC, title ASC`。

## 6. 审计

M2-1 先记录登录成功：

```text
action: auth.login
resourceType: platform.session
result: success
```

登录审计必须记录可用的请求上下文：

- `traceId` 来自统一 trace middleware。
- `ip` 优先使用 `X-Forwarded-For` 首个地址，其次 `X-Real-IP`、框架解析 IP、socket 远端地址。
- `userAgent` 来自 `User-Agent` 请求头。

后续切片再覆盖：

- 创建部门。
- 创建员工。
- 修改员工状态。
- 分配角色。
- 创建角色。

审计失败策略：

- 平台关键写操作的审计写入与业务操作保持同一 repository 边界。
- M2-1 登录审计写入失败时允许请求失败，优先保证审计链路可见，不吞掉持久化错误。

## 7. 模块接入约束

模块接入时必须提供：

- `moduleName`。
- 权限点清单。
- 菜单清单。
- API prefix。
- Web entry 或后续 remote entry。

M2-1 暂不实现 manifest 注册 API，先用 seed 固化平台菜单；M2 后续切片补 `module_manifests` 注册闭环。
M2-1 中 presence、approval、report 相关权限属于 placeholder，M2-2 必须迁移到 manifest 注册边界后再继续扩展。

## 8. 测试要求

M2-1 必须覆盖：

- 内存 fallback E2E：管理员可看到授权菜单，无权限用户菜单为空。
- PostgreSQL E2E：管理员可看到 seed 菜单，登录写入审计日志。
- PostgreSQL E2E：登录审计写入 traceId、ip、userAgent。
- Repository integration：菜单权限过滤、审计写入。
- 单元测试：disabled 角色不得贡献当前用户权限；审计写入失败不得被吞掉。
- E2E：`/menus/my` 未登录返回 401。
- `pnpm verify` 通过。
- `pnpm test:db` 通过。
- CI 通过。

## 9. 退出标准

M2 完成必须满足：

- 权限点、菜单、模块 manifest 有统一注册入口或明确 seed/迁移入口。
- Web Shell 可从 Platform Core 获取当前用户菜单。
- 平台关键写操作写入审计日志。
- 审计日志至少包含 actor、action、resource、result、created_at。
- 新增测试覆盖菜单过滤和审计写入。
