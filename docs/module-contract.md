# 业务模块接入协议

## 1. 模块必须提供的内容

每个业务模块必须包含：

```text
web/
api/
contract/
```

共享后端基建模块例外：

- 为多个业务模块提供底层能力、且当前没有独立用户页面的共享后端模块，可以先交付
  `api/ + contract/`，例如 M6 的 `modules/forms`、`modules/files`。
- 例外模块仍必须由 contract 导出 server-side `ModuleManifestDto`、permissions、events、DTO/schema
  与 API prefix；`webEntry` 和 menus 可以为空。
- 一旦共享模块提供用户可见配置页、列表页或填报页，必须补 `web/` 并遵守 §6 / §7.2。
- 该例外只省略尚不存在的 Web UI，不放松 schema ownership、公开 contract、权限、审计、测试或
  gateway 装配要求。

`contract` 必须声明：

- manifest
- permissions
- events
- DTO/schema
- API prefix

## 2. Manifest

Platform Core 当前使用 `ModuleManifestDto` 作为持久化 manifest 结构：

```ts
export interface ModuleManifestDto {
  id: string;
  moduleName: string;
  displayName: string;
  description?: string;
  apiPrefix: string;
  webEntry?: string;
  permissions: PermissionDto[];
  menus: MenuDto[];
  status: 'active' | 'disabled';
}
```

M2-2 起，平台 seed 的权限和菜单从 manifest 派生。业务模块接入时应先声明 manifest，再由 Platform Core 注册权限点和菜单。

各业务模块的 `ModuleManifestDto` 由自身 contract 包导出（参见 `modules/<module>/contract/src/platform-manifest.ts`），平台模块自身由 `apps/platform-api/src/seeds/platform-module-manifest.ts` 提供。`status='disabled'` 的模块只 upsert 到 `platform.module_manifests`，不下发权限点或菜单。

前端模块可继续使用 Shell 侧模块定义，但字段必须能映射到 Platform Core manifest：

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
presence:status-type:manage
forms:presence-definition:view
forms:presence-definition:manage
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

M9-1 起 `presence.status.changed` 的 `status` 是开放字典 key，并随行携带 `statusLabel`；
订阅方不得本地穷举自定义状态 label。

## 5. API 命名

REST 风格：

```text
GET    /api/presence/status-records
POST   /api/presence/status-records
GET    /api/presence/board
GET    /api/presence/status-types
GET    /api/presence/status-types/all
POST   /api/presence/status-types
PATCH  /api/presence/status-types/:id
POST   /api/presence/status-types/:id/default
POST   /api/presence/status-types/:id/archive
POST   /api/presence/status-types/:id/restore
GET    /api/forms/records/by-id/:recordId
POST   /api/approval/instances
POST   /api/approval/tasks/:id/approve
POST   /api/report/weekly-reports
```

M9-2 起，自助登记可在 `POST /api/presence/status-records` 请求体携带服务端校验的可选
`form: { definitionRevision, values }`；客户端不得传入可信 `formRecordId`。presence 以字典命中的
规范 key 拼出 `presence.status.<key>`，经自己的出站端口由 gateway 宿主适配器调用 forms append
创建，返回 id 随 presence 记录一次写入。

普通员工使用该链路的角色配置为：

```text
presence:status:create
forms:record:submit
forms:presence-definition:view
```

数据范围无需额外显式配置即可安全回退为 `self`；读取他人的 by-id forms 记录仍按该 slot 的
`dataType` 范围授权。

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

### 7.1 跨 schema 数据访问规则

本节把 `docs/foundation-blueprint.md §5` 与 `docs/security-baseline.md §8` 的抽象规则落地为业务模块作者可对照执行的边界。当业务模块需要访问 `platform` schema 数据时，必须按本节执行。

#### 7.1.1 术语与适用范围

- **平台模块**：`apps/platform-api`、`packages/platform-contract`、`packages/platform-sdk`。
- **业务模块**：通常包含 `modules/<name>/contract`、`modules/<name>/api`、`modules/<name>/web`；
  无独立用户页面的共享后端基建模块可按 §1 例外先交付 `contract + api`。
- **schema**：PostgreSQL schema。`platform.*` 由 platform-api 拥有并写入；`<module>.*` 由对应业务模块拥有并写入。
- **内嵌阶段**：M4 起、直至 vNext 拆分前，业务模块嵌入 gateway-api 进程，所有 NestJS provider
  在同一进程。详见 `docs/adr/0003-gateway-boundary.md` 与 `docs/adr/0005-product-replan-roadmap.md`。
- **拆分阶段**：vNext 按真实部署需求拆为独立服务，跨进程通信走 HTTP。ADR-0005 已把原 ADR-0003
  的 “M7 拆分” 推迟到 vNext。

本节规则对内嵌阶段和拆分阶段都生效。差异只在第 7.1.2 节允许通道的实现层。

#### 7.1.2 允许的数据流通道

业务模块需要 platform 数据时，只允许下列三种通道之一：

1. **注入 platform 模块公开的 service**（当前内嵌阶段推荐路径）

   业务 service 通过 NestJS 依赖注入获得 platform 模块导出的 service 实例，例如：

   ```ts
   constructor(
     @Inject(PLATFORM_SCOPE_SERVICE)
     private readonly scopeService: PlatformScopePort,
   ) {}
   ```

   vNext 拆分阶段时，platform 模块导出的同一注入 token 的 provider 会切换为基于 HTTP introspection 的 client 实现；业务 service 代码与接口签名不变。

   注入 token 必须通过 `packages/platform-contract` 或 `packages/platform-sdk` 导出，业务模块不得 `import` `apps/platform-api/...` 内部路径。

2. **HTTP 调用 `/api/platform/...` 公开 API**（vNext 跨进程默认路径）

   通过 `@work/platform-sdk` 或 `@work/http-client` 调用对外稳定的 `/api/platform/...` 路由。仅用于跨进程或跨服务边界。当前内嵌阶段不推荐用本进程 HTTP 调用自己的 platform 模块，徒增 I/O。

3. **订阅 platform 领域事件**

   通过 event-bus 接收 `platform.*` 命名空间的事件（例如 `platform.employee.status.updated`、`platform.user.roles.assigned`），在自己 schema 内维护投影或缓存。事件投影表必须建在业务模块自己的 schema 下，不写入 `platform.*`。

#### 7.1.3 绝对禁止

下列行为在内嵌阶段和拆分阶段都禁止，无例外：

- **任何 SQL 同时引用两个 schema 的表**：包括 JOIN、UNION、子查询、CTE 中跨 schema 引用 `platform.*` 或其他业务模块的 `<other>.*` 表。`foundation-blueprint.md §5` 的"不得跨 schema 随意 join"在本节落地为"任何 JOIN / UNION / 子查询同时引用两个 schema 都不允许"。
- **业务模块 `import` 其他 schema 的 Drizzle table 定义或 schema 文件**：例如业务 repository 不得 `import` `apps/platform-api/src/db/schema/*.ts`，也不得 `import` `modules/<other>/api/src/db/schema/*.ts`。
- **业务模块 `import` platform-api 或其他业务模块的内部 service / repository class**：注入 platform service 必须通过 platform-contract / platform-sdk 导出的注入 token。
- **业务模块直接 `INSERT` / `UPDATE` / `DELETE` 不属于自己 schema 的表**：包括但不限于在 SQL 文本里写死 `platform.*` 表名。
- **业务模块直接注入 `PLATFORM_REPOSITORY` token**：该 token 是 platform 模块内部 repository 抽象，业务模块没有合法理由触达。

#### 7.1.4 业务模块工程层边界

业务 repository 文件（`modules/<name>/api/src/.../*.repository.ts`、`*.postgres.ts`、`*.memory.ts` 等）必须满足：

- 不得 `import` 任何包含其它 schema table 定义的 TypeScript 文件（含 `apps/platform-api/src/db/schema/*.ts`、`modules/<other>/api/src/db/schema/*.ts`）。允许 `import` 通用 ORM 库（如 drizzle-orm helper）、连接池工具、错误映射 helper、本模块的 schema 定义文件以及 contract DTO。
- 写出的 SQL 文本中所有表名引用必须是 `<module>.<table>` 形式（即只引用本模块自己的 schema），不允许出现 `platform.` 前缀或 `<other-module>.` 前缀；不允许跨 schema JOIN / UNION / 子查询。
- 不得 `import` `@work/platform-sdk` 中调用 HTTP 的 client；HTTP 调用归 service 层，不归 repository 层。

业务 service 文件（`modules/<name>/api/src/.../*.service.ts`）必须满足：

- 注入 platform service 时，只通过 `@work/platform-contract` 或 `@work/platform-sdk` 导出的注入 token；不得 `import` `apps/platform-api/...`。
- 跨 schema 的"先查 ID 列表再 in-memory 过滤"逻辑写在 service 层，repository 层只负责单 schema 内的数据访问。

业务 web 文件不直接触达 schema，不在本节工程边界内。

#### 7.1.5 典型场景模板

| 场景                                                | 通道                                    | 模板                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 按当前用户数据范围过滤自己模块的列表                | 通道 1（注入 `PLATFORM_SCOPE_SERVICE`） | `scopeService.resolveScope(currentUser, dataType)` → 在 service 层按 `kind` / `userId` / `enterpriseId` / `departmentIds` in-memory 过滤业务 repository 返回的本 schema 行。M5-1 起 `resolveScope` **必须传数据类型**（`dataType ∈ 'profile' \| 'presence' \| 'report'`，如 presence 模块传 `'presence'`）。`PLATFORM_SCOPE_SERVICE` 自 M4-2 起已通过 `packages/platform-contract` 暴露 |
| 需要平台员工 / 部门基础信息（姓名、状态、所属部门） | 通道 1（注入对应平台 lookup service）   | service 层调用 platform lookup service 拿到 ID 集合或快照对象 → 在自己 schema 内按 ID 检索 → 在 service 层拼装结果。M6-3 起 `PLATFORM_EMPLOYEE_LOOKUP_SERVICE` 已支持按 ID 列表查询同租户 active 员工最小快照；其他 lookup 能力按 §7.1.6 扩出流程新增                                                                                                                                            |
| 业务写操作记录审计                                  | 通道 1（注入 `PLATFORM_AUDIT_SERVICE`） | service 层调用 `PlatformAuditPort.record({...})` 写入 `platform.audit_logs`；业务模块不得 `import` `platform.audit_logs` 的 schema 定义，也不得在自己的 repository 里写死该表名。`PLATFORM_AUDIT_SERVICE` 自 M4-2 起已通过 `packages/platform-contract` 暴露                                                                                                                            |
| 响应平台状态变化（员工禁用、角色变更）              | 通道 3（订阅 `platform.*` 事件）        | 在业务模块自己的 event handler 中处理 `platform.employee.status.updated` 等事件 → 写入自己 schema 的投影 / 清理本模块缓存；不允许轮询 `platform.*` 表                                                                                                                                                                                                                                   |
| 跨进程调用平台 API                                  | 通道 2（HTTP）                          | vNext 拆分阶段通过 `@work/platform-sdk` 客户端调用 `/api/platform/...`；内嵌阶段不使用本通道                                                                                                                                                                                                                                                                                            |

#### 7.1.6 当前已可用 platform 出口与扩出流程

当前已可用的 platform service 注入 token（业务模块在 M4-1 起可以直接使用）：

- `PLATFORM_SCOPE_SERVICE`（接口 `PlatformScopePort`）：解析当前用户数据范围。详见 `docs/platform-core.md §5`。来源：`packages/platform-contract/src/scope.ts` 暴露 token 与接口；`apps/platform-api/src/scope/platform-scope.service.ts` 提供实现并由 `PlatformModule` 通过 `useExisting` 绑定到 token（M4-2 起）。业务模块 `imports: [PlatformModule]` + `@Inject(PLATFORM_SCOPE_SERVICE) port: PlatformScopePort`。vNext 拆分后 PlatformModule 提供的实现切换为基于 HTTP introspection 的 client，业务模块代码无需改写。
- `PLATFORM_AUDIT_SERVICE`（接口 `PlatformAuditPort`）：业务模块写审计的统一入口，封装 `PlatformRepository.recordAuditLog`。来源：`packages/platform-contract/src/audit.ts` 暴露 token 与接口；`apps/platform-api/src/audit/platform-audit.service.ts` 提供实现并由 `PlatformModule` 通过 `useExisting` 绑定到 token（M4-2 起）。业务模块 `imports: [PlatformModule]` + `@Inject(PLATFORM_AUDIT_SERVICE) port: PlatformAuditPort`。
- `PLATFORM_EMPLOYEE_LOOKUP_SERVICE`（接口 `PlatformEmployeeLookupPort`）：按 ID 列表返回同租户 active 员工最小快照（员工号、姓名、部门 id / 名称），用于 Forms `employee` 字段校验与快照。来源：`packages/platform-contract/src/users.ts` 暴露 token 与接口；`apps/platform-api/src/users/employee-lookup.service.ts` 提供实现并由 `PlatformModule` 通过 `useExisting` 绑定到 token（M6-3 起）。业务 service 只依赖 `@work/platform-contract` token，不直接 import platform 内部 service。

按 M4 之后业务需求待补的 platform 出口（**不在 M3.5-G 范围**，由后续业务切片按真实需求驱动新增）：

- 平台部门树展开 / 复杂组织 lookup service。

扩出流程（business 切片新增 platform 出口时必须遵循）：

1. 在 `packages/platform-contract` 声明 service 接口与注入 token，明确方法签名和返回类型。
2. 在 `apps/platform-api` 实现该 service，注册到 `PlatformModule` providers 并导出。
3. 业务模块在 `imports` 中引入对应 platform module，并通过 contract 包导出的 token 注入；不得 `import` `apps/platform-api/...` 内部路径。
4. 同步更新本节 §7.1.6 "已可用 platform 出口"列表，避免后续模块作者重复扩出。

#### 7.1.7 vNext 拆分兼容性承诺

本节定义的允许通道在 vNext 拆进程后全部仍然有效：

- 通道 1（注入 platform service）：注入 token 与接口签名不变；platform 模块导出的 provider 实现由本进程 service class 切换为基于 HTTP introspection 的 client。业务 service 代码无需改写。
- 通道 2（HTTP）：vNext 拆分后变成跨进程默认调用方式；内嵌阶段代码若直接走 HTTP，可平滑过渡。
- 通道 3（订阅事件）：vNext 拆分后事件投递从进程内 event bus 升级为 Redis Stream / 消息队列，业务模块订阅接口不变。

业务模块不得在代码或注释中假设"内嵌阶段"作为永久状态。任何"现在能直接调 service 所以可以省略事件订阅"的简化都视为技术债，必须随事件能力完善而迁移。

#### 7.1.8 执行与审查

本节规则当前不通过自动化 lint / CI 检查强制；依赖 code review 和单元 / 集成测试覆盖。后续可考虑在 CI 中加：

- `grep` 检查：业务模块源代码不出现 `from 'platform\\.` 或 `JOIN platform\\.` 等 SQL 文本片段；不出现 `import .* from '.*apps/platform-api/`。
- 模块间 import 边界 lint（Nx project boundaries 或自定义 ESLint 规则）。

这些自动化手段**不在本切片范围**，作为 follow-up 列入 verification-log。

### §7.2 Web 模块 runtime 注入

业务模块的 Web 包不得自己解析 access token 存储协议，必须通过 shell 注入的 runtime。

#### §7.2.1 runtime 来源

Shell（`apps/workbench-shell`）在 bootstrap 拿到 currentUser 之后调用 `module.setRuntime?.(runtime)`，runtime 包含：

- `currentUser: CurrentUserDto`
- `createHttpClient(options: { baseUrl: string }): HttpClient`

业务 Web 模块只能通过这两个能力触达后端和当前用户身份。

#### §7.2.2 禁止

- 业务 Web 模块禁止读 `window.localStorage` / `document.cookie` 任意 token storage key
- 业务 Web 模块禁止从 `@work/workbench-shell` 任何路径 import（边界等同业务 API 模块禁止 import `apps/platform-api/...`）
- 业务 Web 模块禁止把 runtime 暴露成 ES module 顶层导出（必须在模块内部 closure 持有；测试可暴露 `__resetRuntimeForTest`，但生产代码不调）
- 业务 Web 模块禁止依赖 `setup(platform: PlatformSDK)` hook（M4-3 阶段 PlatformSDK 接口未实装，shell 不会调）

#### §7.2.3 推荐 pattern

- runtime singleton 维护在模块自己的 `runtime.ts`，提供 `setRuntime` + `getApi` 两个出口
- HTTP client 的 baseUrl 用模块 `manifest.apiPrefix`（presence 是 `/api/presence/`），调用方写相对路径
- 测试通过 `setRuntime` 注入 mock client，afterEach 调 `__resetRuntimeForTest`

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
