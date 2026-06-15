# Task: M7-4b 前端接入（铃铛/工作台卡片 + SSE 消费 + 断线回退轮询 + 触发点配置管理 UI）

## 状态

Ready for execution（**依赖 M7-4a 已合入**：`GET /api/notification/stream` 端点 + 信号事件 `notification.created`）

## 0. 任务定位

M7 第四刀的**前端半**。把 M7-1/2/3/4a 的后端能力接到工作台界面：让用户**看到**未读角标/通知列表、
**实时**收到新通知（SSE）、断线**自动回退**轮询，并给系统管理员一个**触发点配置管理页**。

本切片交付：

1. **`@work/http-client` 流式扩展**：新增 `stream(url, options)` 方法（fetch + `Authorization` 头 + 读
   `ReadableStream` 解析 SSE 帧），消费 `GET /api/notification/stream`。**这是为了不破"`@work/http-client`
   是唯一许可出站 HTTP 路径"的规矩**（`packages/CLAUDE.md`）——前端**不得**手搓 `fetch`，也**不**用原生
   `EventSource`（不能带 `Authorization` 头，RFC §10/§23-4）。
2. **顶栏铃铛接真数据**：未读角标（真数）+ 下拉列表（`GET /api/notification`）+ 点击标已读（`PUT /:id/read`）
   - 跳转 `sourceModule/sourceId` + 全部已读（`PUT /read-all`）。
3. **工作台"最新消息"卡片 + "未读消息"统计接真数据**（最近若干条通知 + 未读数）。
4. **SSE 消费 + 断线回退**：登录后建立 `/stream` 连接，收到 `notification.created` 信号即重拉未读数/列表；
   **断线/出错回退 REST 轮询**（如 60s）+ 退避重连；登出/卸载清理连接与定时器（无泄漏）。
5. **触发点配置最小管理 UI**：新建 `modules/notification/web`（`@work/notification-web`）模块路由页
   `TriggerConfigPage`（仿 M5 `RolesPage`），列出触发点 + `enabled` 开关 + 接收人增删（部门负责人/角色），
   `PUT /api/notification/trigger-config/:key` 保存；受 `notification:trigger-config:manage` gate；经
   manifest + `moduleRegistry` 正规挂入 shell。

> **关键边界（RFC §16 明确警告，必须照做）**：`App.tsx` 里多处标 `(M7)/(M11)/vNext` 的占位，**只替换
> 通知相关的**（顶栏铃铛下拉、工作台"最新消息"卡片、"未读消息"统计），**别误删/漏删**全局搜索壳、待处理事项、
> 审批/待办统计、个人信息菜单等**非本期**占位。逐一核对清单见 §2.4。

**本切片不做**（划清边界）：

- 后端任何改动（SSE 端点/注册表/生成推送是 M7-4a；触发点配置读写接口是 M7-2，**已存在**，本切片只接前端）。
- 调度配置（schedule_config）的任何 UI——RFC §16 前端范围只含触发点配置 UI + 铃铛/卡片，**无调度配置 UI**
  （M7-3 §2.7 已定，schedule_config 写 UI 留 M10）。
- 全局搜索后端/UI（非通知，属另列占位）。
- 多副本/通知正文经 SSE 下发（M7-4a 已定 SSE 仅信号、REST 为事实源）。
- 交付验证门禁（verify:full / docker:build 全量 + 假绿核查 + 文档总同步）→ **M7-5**。

> **安全门禁判定**：本切片**纯前端 + 一个共享前端库（http-client）方法扩展**，**不碰** `auth/scope/audit/rbac/
repositories`、不改鉴权规则、不新增后端端点/权限点/敏感字段/迁移。触发点配置页消费的是 **M7-2 已过评审的**
> 读写接口（鉴权/审计已在后端）。按 `docs/security-baseline.md` §16 **非强制 security-reviewer 门禁项**；
> 任务包二审仍走独立 general sub-agent。`http-client.stream` 是 load-bearing 包的改动，二审重点看令牌注入、
> `onUnauthorized`、不泄漏 token（不进 URL/日志）、AbortController 清理。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、统一错误信封、提交规范）
2. `packages/CLAUDE.md`（**`@work/http-client` 是唯一许可出站 HTTP 路径，禁止手搓 fetch/axios**；
   package 依赖单向，不得 import apps/modules）
3. `apps/workbench-shell/CLAUDE.md`（模块经 `module-registry` 静态 `import` + `register` 挂载；菜单/路由/权限来自
   **manifest**，不在 shell 手写；web spec 走 `vitest.web.config.mts` jsdom）
4. `docs/rfc/m7-notification-scheduler.md`——重点 **§16 前端范围**（铃铛/卡片/SSE/回退 + 触发点配置 UI 落位
   `modules/notification/web` 仿 RolesPage + **只接通知相关占位**警告）、§10 SSE（前端 fetch+ReadableStream 带
   Authorization、REST 为事实源、断线回退轮询）、§12 HTTP API（通知列表/未读数/已读/trigger-config 端点与权限）、
   §13 权限、§6 触发点配置（`defaultRecipients` 结构 `{kind, roleCode?}`、③ 默认部门负责人 + 可加角色）
5. 既有范式代码（**照搬，不要另起炉灶**）：
   - **web 模块包范式**（建 `modules/notification/web` 完全照此）：`modules/presence/web/package.json`（`@work/presence-web`
     依赖 + nx tags）、`modules/presence/web/src/module.ts`（`WorkWebModule`：manifest + setRuntime + routes[load]）、
     `modules/presence/web/src/runtime.ts`（`createHttpClient({baseUrl})` + api client 缓存 + `__resetForTest`）
   - **模块路由页范式**（`TriggerConfigPage` 仿此）：`modules/platform/web/src/pages/RolesPage.tsx`（list/loading/error
     state + 权限判断 `currentUser.permissions.some(...)` + 增删改 + 刷新）、`RolesPage.spec.tsx`（web 测试范式）、
     `modules/platform/web/src/api/platform-roles-api-client.ts`（`createXxxApiClient(http)` 包装 `http.get/put`）
   - **manifest（web + platform 两形态）**：`modules/presence/contract/src/manifest.ts`（`WorkModuleManifest`，前端）
     - `modules/presence/contract/src/platform-manifest.ts`（`ModuleManifestDto`，带固定 UUID menu + permissionCode +
       `webEntry`，供 platform seed → 经 `platformSeedMenus` 进库 → bootstrap 返回菜单）
   - **shell 装配**：`apps/workbench-shell/src/module-registry/module-registry.ts`（`moduleRegistry.register(...)`）、
     `apps/workbench-shell/src/app/App.tsx`（`createHttpClient`、`readAccessToken`、`moduleRegistry.applyRuntime`、
     Topbar 铃铛占位 `:344-358`、WorkbenchHome "最新消息" 卡片 `:553-556` + "未读消息" 统计 `:498`、navigation 由
     `session.menus` 驱动）、`apps/workbench-shell/src/platform/session-storage.ts`（`readAccessToken`）
   - **http-client**：`packages/http-client/src/{types.ts,create-http-client.ts}`（`HttpClient` 接口 + `request()`
     令牌注入 + `onUnauthorized` on 401）
   - **菜单/权限 seed 流**：`apps/platform-api/src/seeds/seed-data.ts`（`platformSeedMenus`/`platformSeedPermissions`
     = active manifests 的 menus/permissions flatMap；`notificationPlatformManifest` 已注册、权限已 seed，**menus 当前为 []**）、
     `seed-data.spec.ts`（menu/permission 断言；line 58 menuIds 由 manifest 派生 = 自动覆盖新菜单）

## 2. 设计要点（严格遵守）

### 2.1 `@work/http-client` 新增 `stream()` 方法（命门：唯一出站路径）

- `packages/http-client/src/types.ts` 给 `HttpClient` 接口加：

  ```ts
  export interface SseStreamHandle {
    close(): void; // abort 连接
  }
  export interface SseStreamOptions {
    onMessage: (data: unknown) => void; // 每收到一帧 data 解析后回调
    onError?: (error: unknown) => void; // 网络/读流错误（用于触发回退轮询）
    onOpen?: () => void;                 // 连接建立（响应 ok 后）
    signal?: AbortSignal;                // 可选外部中止
  }
  // 在 HttpClient 接口里加：
  stream(url: string, options: SseStreamOptions): SseStreamHandle;
  ```

- `packages/http-client/src/create-http-client.ts` 实现 `stream`：
  - `const controller = new AbortController()`；若传入 `options.signal` 则联动 abort。
  - `const token = await options.getAccessToken()`（复用闭包里的 `options.getAccessToken`）；
    `fetch(new URL(url, baseUrl), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer '+token, 'X-Trace-Id': ... }, signal: controller.signal })`。
    **令牌只进 `Authorization` 头，绝不进 URL query**（RFC §10：query 传令牌易进日志/历史，弃用）。
  - 响应 `status===401` → `options.onUnauthorized?.()`（与 `request()` 一致）；`!ok` → `onError`。
  - `ok` → `onOpen?.()`，读 `response.body!.getReader()` + `TextDecoder`，**按 SSE 分帧**：缓冲累加，按
    `\n\n` 切帧，取每帧以 `data:` 开头的行拼接，`JSON.parse` 失败则回传原始字符串，调用 `onMessage(parsed)`；
    循环 `reader.read()` 直到 `done` 或 abort。读流异常（非 abort）→ `onError`。
  - 返回 `{ close: () => controller.abort() }`。**abort 不应触发 `onError`**（区分主动关闭与异常，便于上层只在异常时回退）。
- **不改** `request()` 既有行为。
- **测试**（`create-http-client.spec.ts` 同目录，node env `*.spec.ts`）：stub 全局 `fetch` 返回一个 `ReadableStream`
  推两帧 `data: {"type":"notification.created"}\n\n` → 断言 `onMessage` 被调两次、解析出对象；断言请求带
  `Authorization` 头且 **URL 不含 token**；`close()` → abort 生效、之后不再 `onMessage`；401 → `onUnauthorized`。

> 为什么扩 http-client 而非在 shell 写 fetch：`packages/CLAUDE.md` 规定 http-client 是唯一出站路径。把 SSE
> 消费做成 http-client 的能力，令牌注入/`onUnauthorized`/错误形状都复用同一处，shell 不碰裸 `fetch`。

### 2.2 shell 通知 API 客户端

- 新增 `apps/workbench-shell/src/platform/notification-api.ts`：`createNotificationApiClient({getAccessToken, onUnauthorized})`
  内部 `createHttpClient({ baseUrl: new URL('/api/notification/', window.location.origin).toString(), getAccessToken, onUnauthorized })`，
  暴露：`listNotifications({unreadOnly?,limit?,offset?})` → `GET ''`（带 query）、`unreadCount()` → `GET 'unread-count'`、
  `markRead(id)` → `PUT ':id/read'`（encodeURIComponent）、`markAllRead()` → `PUT 'read-all'`，
  以及 `stream({onMessage,onError,onOpen})` → `http.stream('stream', ...)`。类型用 `@work/notification-contract`
  的 `NotificationDto`/`ListNotificationsResponse`/`UnreadNotificationCountResponse`。
  - **依赖声明**：`apps/workbench-shell/package.json` 若尚无 `@work/notification-contract`，加 `workspace:*`（严格 hoisting，§见 M7-3）。

### 2.3 SSE 消费 + 断线回退（命门：无泄漏 + REST 为事实源）

- 在 shell 加一个 hook `useNotifications(api)`（`apps/workbench-shell/src/app/use-notifications.ts`），由 `AppShell`
  在已登录态调用（`AppShell` 已有 `currentUser`；令牌用 `readAccessToken`，`onUnauthorized` 复用 App 传下的登出回调）：
  - state：`unreadCount: number`、`recent: NotificationDto[]`（最近若干条，如 limit 10）、`status: 'live'|'polling'`。
  - 初次：并行拉 `unreadCount()` + `listNotifications({limit:10})`。
  - 建 SSE：`api.stream({ onOpen: ()=>设 live + 停轮询, onMessage: ()=>**收到任何信号即重拉** unreadCount+list（去抖，
如 300ms 合并多帧）, onError: ()=>转入回退 })`。**onMessage 不信任帧内容**（REST 为事实源），只当"该刷新了"。
  - **断线回退**：`onError`/连接关闭 → `status='polling'`，启 `setInterval`（如 60s）轮询 `unreadCount`+`list`，
    同时**退避重连** SSE（如 5s/15s/30s 上限），重连成功（onOpen）→ 清轮询定时器、回 `live`。
  - **清理（硬约束，防泄漏）**：hook `useEffect` 的 cleanup 必须 `handle.close()`（abort SSE）+ `clearInterval`(轮询)
    - `clearTimeout`(重连)；登出（token 变化/卸载）必触发。多标签页各自连接、各自重连（天然，因每个页面一个 hook 实例）。
  - 暴露动作：`markRead(id)`（乐观更新 + 调 API + 失败回滚或重拉）、`markAllRead()`、`refresh()`。
- `AppShell` 把 `unreadCount`/`recent`/动作传给 `Topbar`（铃铛）与 `WorkbenchHome`（卡片/统计）。

> **REST 为事实源**：未读数/列表始终以 REST 返回为准；SSE 仅触发重拉。断线时轮询保证最终一致，不依赖 SSE 不丢帧（RFC §10）。

### 2.4 替换 `App.tsx` 占位——逐一核对清单（RFC §16 警告：只接通知相关）

**替换（通知相关，本期接真数据）**：

| 位置（约行号）                           | 现状占位                                                             | 接入                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Topbar 铃铛下拉 `:344-358`               | `🔔 + Dot label="通知角标预留"` + EmptyState "通知 API 待接入（M7）" | 真未读角标（`unreadCount>0` 显示数字/红点，0 不显示）+ 下拉渲染 `recent` 列表 + 每条点击 `markRead`+跳转 `sourceModule/sourceId` + "全部已读" 按钮（`markAllRead`）+ 空态保留 |
| WorkbenchHome "最新消息" 卡片 `:553-556` | EmptyState "消息与通知后端待接入（M7）"                              | 渲染 `recent` 最近若干条（标题/时间/未读点）；空仍用 EmptyState                                                                                                               |
| WorkbenchHome "未读消息" 统计 `:498`     | `{ title:'未读消息', milestone:'M7' }` 显示"待接入"                  | 显示真实 `unreadCount`                                                                                                                                                        |

**保留不动（非通知占位，别碰）**：

- Topbar 全局搜索壳 `:327-343`（"全局搜索 API 将在 M7 接入"——**是搜索不是通知**，保留）。
- WorkbenchHome "待处理事项" 卡片 `:533-536`（审批/待办聚合，M7/M11，保留）。
- WorkbenchHome 统计 `approval`(M11)/`todo`(vNext)/`presence`(presence 汇总 API) `:496-500`（保留）。
- Topbar 个人信息菜单（个人信息/在位/偏好"待接入"`:376-382`，保留）、"系统动态"卡片 `:557-560`（保留）。
- "新建申请（M11 待接入）" 按钮 `:515`（保留）。
- 侧栏导航项空角标槽位 `app-shell__badge-slot`（`App.tsx:215`，保留）——本期**只接 Topbar 铃铛角标**；
  侧栏菜单级未读角标属**预留**（将来按模块未读数填此槽），本切片不接，别误用通知未读数填进去。

> 跳转：通知点击后用 `react-router` 导航到模块路由（如 presence 通知 → `/presence/board`）。`sourceModule→路径`
> 映射做一个最小表（本期只有 `presence`）；未知 module 不跳转或跳工作台，**不报错**。先 `markRead` 再导航。

### 2.5 `modules/notification/web` 新模块 + 触发点配置页

- **新建包** `modules/notification/web`（照 `presence/web`）：`package.json`（`@work/notification-web`，依赖
  `@work/http-client`/`@work/platform-contract`/`@work/platform-sdk`/`@work/notification-contract`/`react`；nx tags
  `scope:notification` + `type:feature`；`main: ./src/module.ts`），`src/module.ts`/`src/runtime.ts`/
  `src/api/notification-trigger-config-api-client.ts`/`src/pages/TriggerConfigPage.tsx`(+ `.spec.tsx`)。
- **web manifest**（`modules/notification/contract/src/manifest.ts`，当前全空）填：
  - `permissions: [{ code: notificationPermissions.triggerConfigManage, name: '管理通知触发点配置' }]`
  - `menus: [{ title: '通知设置', path: '/notification/trigger-config', permission: notificationPermissions.triggerConfigManage }]`
  - `routes: [{ path: '/notification/trigger-config', permission: notificationPermissions.triggerConfigManage }]`
  - （manifest 是声明元数据；真正挂载用 module.ts 的 `routes[load]`，见下。）
- **module.ts**：`WorkWebModule` = `{ manifest: notificationManifest, setRuntime: setNotificationRuntime, routes: [{ path:'/notification/trigger-config', permission: notificationPermissions.triggerConfigManage, load: () => import('./pages/TriggerConfigPage') }] }`。
- **runtime.ts**：`setNotificationRuntime(runtime)` → `createHttpClient({baseUrl:'/api/notification/'})` + `createNotificationTriggerConfigApiClient(http)`；
  `getNotificationTriggerConfigApi()` + `getNotificationCurrentUser()` + `__resetNotificationRuntimeForTest()`。
- **api client**：`listTriggerConfigs()` → `GET 'trigger-config'`（返回 `{items: TriggerConfigDto[]}` 取 items）、
  `updateTriggerConfig(key, input: UpdateTriggerConfigInput)` → `PUT 'trigger-config/'+encodeURIComponent(key)`。
- **TriggerConfigPage.tsx**（仿 RolesPage）：
  - `getNotificationCurrentUser().permissions.some(p=>p.code===notificationPermissions.triggerConfigManage)` 判可写（无则只读，页面本身已被路由权限 gate，这里是双保险）。
  - 列出触发点：每行 `triggerKey`（友好名）+ `enabled` 开关 + `defaultRecipients` 列表（部门负责人/角色 chip）+ 编辑。
  - 编辑接收人：增删 `{kind:'department_manager'}` 与 `{kind:'role', roleCode}`（roleCode 输入：`company_head`/`hr`/`assistant` 等，RFC §6）；
    `subject`/`self` kind 本期 ③ 用不到但类型存在——UI 至少支持 `department_manager` + `role`（RFC §6 ③ 的可配项），其余 kind 可只读展示不可新增。
  - 保存 → `updateTriggerConfig(key, {enabled, defaultRecipients})` → 成功提示 + 重拉。
  - loading/error/empty 三态 + 刷新按钮（照 RolesPage）。
- **注册**：`apps/workbench-shell/src/module-registry/module-registry.ts` 加 `import { notificationWebModule } from '@work/notification-web';` + `moduleRegistry.register(notificationWebModule);`（依赖加到 shell `package.json`）。

### 2.6 platform-manifest 加菜单（让配置页进导航）

- `modules/notification/contract/src/platform-manifest.ts`：
  - 加 `webEntry: '/notification'`（照 presence）。
  - `menus: []` → 加一项（**新固定 UUID，全局唯一、不与现有 menu/manifest id 冲突**）。notification 自己的
    manifest id 已占 `...0207`（`platform-manifest.ts:4`）；为命名内聚，menu id 用 **notification 自有邻域**
    （如 `00000000-0000-0000-0000-000000020701`），**别**用 presence 等占用的 `01xx` 段；定前核对各 manifest 现用 id：
    ```ts
    {
      id: NOTIFICATION_TRIGGER_CONFIG_MENU_ID,
      moduleName: 'notification',
      title: '通知设置',
      path: '/notification/trigger-config',
      permissionCode: notificationPermissions.triggerConfigManage,
      sortOrder: 120,
      status: 'active',
    }
    ```
  - 权限**已在** `permissions` 声明（M7-2）、已 seed（`seed-data.spec.ts:78`），**不重复加**。
- **seed 自动流**：`platformSeedMenus = active manifests menus flatMap`（`seed-data.ts:33-35`）→ 新菜单自动进 seed；
  `seed-data.spec.ts:58` 的 menuIds 断言由 manifest 派生（两侧同源）**自动覆盖**新菜单。**已核实**：spec 中**无**
  notification 菜单的专项/精确断言，故无需为此改 spec。**仍**：若你新增 menu 后任何断言变红，按真值改（**别为过测删断言**）。
- 系统管理员可见前提：`notification:trigger-config:manage` 须挂管理员角色——**已核实天然包含**：管理员角色按
  **全量 seed 权限**授予（postgres `seed-platform.ts:48,244` 对 `platformSeedPermissions` 逐条 `INSERT role_permissions`；
  memory `platform-memory.store.ts:397` `permissionCodes: seedPermissions.map(...)`），该权限已在 `platformSeedPermissions`
  （`notificationPlatformManifest.status==='active'` + permissions 含该 code），故 admin 天然有。**本切片无需补授**，
  也别动管理员角色 seed。

### 2.7 显式类型 / 不破坏微前端缝

- web 模块只依赖 `platform-sdk` + 自己的 contract + http-client（`apps/workbench-shell/CLAUDE.md`）；不 import 别的 module 内部。
- 保持 `load-remote-module` 缝完整：只经 `WorkWebModule` manifest/runtime/routes 交互。

## 3. 验证

### 3.1 命令（全过）

```bash
pnpm install                    # 新增 @work/notification-web + shell/web 依赖，提交 lockfile
pnpm lint && pnpm typecheck
pnpm test                       # 单元 + web（含新 *.spec.tsx，走 vitest.web.config.mts）
pnpm test:e2e
pnpm build
# 有本地 Postgres 时：
pnpm verify:full
```

> 本切片不改部署形态，`pnpm docker:build` 非必跑（除非 §2 触及 compose/Dockerfile——不应触及）。

### 3.2 断言（必须覆盖）

- **`@work/http-client.stream`（`*.spec.ts`，node）**：§2.1 末列——两帧→`onMessage`×2、带 Authorization 头、
  URL 无 token、`close()` 后不再回调、401→`onUnauthorized`、读流异常→`onError`、abort 不算 onError。
- **铃铛/卡片（`App.spec.tsx` 扩或新 `*.spec.tsx`，jsdom）**：mock 通知 api client——
  - 未读数>0 → 角标显示数字；=0 → 不显示角标。
  - 下拉渲染 `recent` 列表；点击一条 → 调 `markRead(id)` + 路由跳转到映射路径；"全部已读" → 调 `markAllRead`。
  - "最新消息"卡片渲染最近通知；空 → EmptyState。"未读消息"统计显示真实数。
  - **保留占位未被误删**：断言全局搜索壳、"待处理事项"卡片仍在（防回归）。
- **SSE 消费/回退（`use-notifications` 的 `*.spec.tsx` 或 hook 测试）**：mock `api.stream`——
  `onMessage` 触发 → 重拉 unreadCount/list；`onError` → 进入轮询（fake timers 推进 60s 断言又拉了一次）+ 安排重连；
  卸载 → `handle.close()` 被调 + 定时器清理（无泄漏）。
- **TriggerConfigPage（`*.spec.tsx`，jsdom，仿 `RolesPage.spec.tsx`）**：列出触发点、toggle enabled、增删接收人、
  保存调 `updateTriggerConfig` 并传正确 `{enabled, defaultRecipients}`；加载/错误态；无写权限只读。
- **manifest/seed**：`seed-data.spec.ts` 全绿（新菜单经 manifest 派生自动进 `platformSeedMenus`；若有专项断言按真值更新）；
  `buildModuleRouteTable` 不因新路由报重复路径（路径唯一）。
- **回归**：既有 shell/platform/presence/notification 单元 + e2e + web **全绿**。
- 验收禁止假数据/占位蒙混；source-review 判定而非裸 grep。**特别**核查：铃铛/卡片接的是**真 API**，
  不是写死的假列表；SSE 真的触发重拉而非装样子。

## 4. 退出标准

1. `@work/http-client.stream()` 落地（带 Authorization 头、不进 URL；401→onUnauthorized；abort 干净）+ 测试绿。
2. 顶栏铃铛接真：未读角标 + 下拉列表 + 点击已读 + 跳转 + 全部已读。
3. 工作台"最新消息"卡片 + "未读消息"统计接真数据。
4. SSE 连接建立、信号触发重拉；断线回退轮询 + 退避重连；登出/卸载清理无泄漏；REST 为事实源。
5. `modules/notification/web` 新模块 + `TriggerConfigPage` 可用（列/开关/接收人增删/保存），受
   `notification:trigger-config:manage` gate，经 manifest + `moduleRegistry` 挂入 shell，权限不足不显示。
6. `notificationPlatformManifest` 加菜单（固定唯一 UUID + permissionCode + webEntry）→ 菜单进 seed → 管理员可见。
7. **只替换通知相关 `(M7)` 占位**，全局搜索/待处理事项/审批等非通知占位**原样保留**。
8. `pnpm verify` 全绿（含新 `*.spec.tsx`）。

## 5. 必须保持不变（避免越界）

- 不手搓 `fetch`/`axios`，不用原生 `EventSource`——SSE 走 `@work/http-client.stream`（`packages/CLAUDE.md`、RFC §10）。
- 不改后端（SSE 端点/注册表/生成推送=M7-4a；trigger-config 接口=M7-2）；不动 auth/scope/audit/rbac/repositories。
- 不删/误改非通知占位（全局搜索、待处理事项、审批/待办统计、个人信息菜单、系统动态）。
- 不做 schedule_config UI（M10）；不在 SSE 帧依赖通知正文（REST 为事实源）；不做多副本。
- web 模块不 import 其它 module 内部；不破坏 `load-remote-module` 远程微前端缝。
- 不动 presence/files/forms 的现有页面与 manifest（除 shell module-registry 加一行 register）。

## 6. 完成后更新文档

- `docs/foundation-progress.md`：M7-4b 完成结论 + 下一步 M7-5；M7 切片表标 M7-4（a+b）done。
- `docs/architecture.md`：前端通知接入落位——shell 铃铛/工作台卡片经 `@work/http-client`（含 `stream()`）消费通知 API、
  SSE 信号触发 REST 重拉 + 断线回退轮询；`modules/notification/web` 触发点配置页（manifest + moduleRegistry）。
- `docs/deployment.md`：若需，重申反向代理对 `/api/notification/stream` 关闭缓冲/聚合（M7-4a 已述则只引用）。
- `docs/verification-log.md`：追加 `M7-4b Notification Frontend` 锚点与结论（含"只接通知占位"核查 + 假绿核查 + 安全门禁判定）。

## 7. 提交规范

- Conventional Commits（可拆多 commit）：
  - `feat(http-client): add SSE stream() with bearer auth`
  - `feat(web): wire notification bell + workbench card + SSE with polling fallback`
  - `feat(notification): trigger-config management UI (modules/notification/web)`
- 提交信息说明：① http-client `stream()`（令牌注入/onUnauthorized/abort）② 铃铛/卡片接真 + SSE 消费 + 断线回退
  ③ 触发点配置页 + manifest 菜单 + moduleRegistry；并注明本切片**非强制 security-reviewer 门禁项**判定（§0）。
- 交付前跑完 §3 命令，结论贴进 `docs/verification-log.md`。
