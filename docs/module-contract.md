# 业务模块接入协议

## 1. 模块必须提供的内容

每个业务模块必须包含：

```text
web/
api/
contract/
```

`contract` 必须声明：

- manifest
- permissions
- events
- DTO/schema
- API prefix

## 2. Manifest

```ts
export interface WorkModuleManifest {
  name: string;
  title: string;
  basePath: string;
  apiPrefix: string;
  menus: ModuleMenu[];
  permissions: PermissionDefinition[];
  routes: ModuleRoute[];
}
```

约束：

- `name` 必须全局唯一。
- `basePath` 必须以模块名开头，例如 `/presence`。
- `apiPrefix` 必须以 `/api/<module>` 开头。
- 菜单必须绑定权限点。
- 路由不得越过自己的 `basePath`。

## 3. 权限命名

格式：

```text
<module>:<resource>:<action>
```

示例：

```text
presence:board:view
presence:status:create
presence:status:manage
approval:instance:create
approval:task:approve
report:weekly:view
```

## 4. 事件命名

格式：

```text
<module>.<aggregate>.<verb>
```

示例：

```text
presence.status.changed
approval.instance.completed
report.weekly.submitted
```

## 5. API 命名

REST 风格：

```text
GET    /api/presence/status-records
POST   /api/presence/status-records
GET    /api/presence/board
POST   /api/approval/instances
POST   /api/approval/tasks/:id/approve
POST   /api/report/weekly-reports
```

## 6. 前端接入 Shell

业务模块只导出模块定义：

```ts
export const presenceWebModule: WorkWebModule = {
  manifest,
  routes,
};
```

Shell 负责收集模块、过滤权限、渲染菜单、注册路由。

## 7. 后端接入平台

业务模块后端只依赖平台公开能力：

- AuthGuard
- PermissionGuard
- CurrentUser
- Logger
- ErrorFactory
- EventBus

业务模块不得依赖平台数据库内部实现。

## 8. C/S 客户端接入

C/S 客户端不直接接入业务模块源码。

允许：

```text
desktop client -> gateway-api
desktop client -> OpenAPI generated client
desktop client -> public contract documents
```

禁止：

```text
desktop client -> PostgreSQL
desktop client -> modules/*/api/internal
desktop client -> Web Shell internal state
```

C/S 客户端与 Web UI 使用同一套权限点。例如：

```text
presence:board:view
presence:status:create
approval:task:approve
report:weekly:view
```
