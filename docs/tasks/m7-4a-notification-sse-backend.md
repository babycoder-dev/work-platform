# Task: M7-4a SSE 推送端点（`GET /api/notification/stream` + 进程内连接注册表 + 生成链路推送）

## 状态

Ready for execution

## 0. 任务定位

M7 第四刀的**后端半**。把"实时推送"从无到有长成**可用、可鉴权、只推本人、可验证**的基线，
供 M7-4b 前端铃铛/卡片消费。本切片**只做后端 SSE 管道**，不碰任何前端代码。

本切片交付：

1. **SSE 单端点 `GET /api/notification/stream`**（`text/event-stream`），由 notification/api 直接持有连接，
   用 Nest 内置 `@Sse()`，**不**引入 socket.io / `realtime-gateway`（RFC §10、§2）。
2. **进程内连接注册表 `NotificationStreamRegistry`**（`Map<userId, Set<Subject>>`，支持同一用户多标签页多连接），
   提供 `connect(userId)` / `emitToUser(userId, event)` / `getConnectionCount(userId)`，连接断开自动清理。
3. **生成链路推送 hook**：在通知**唯一 fan-out 点** `NotificationService.create()` 落库后，按 `recipientUserId`
   逐个 `emitToUser` 一个**信号事件**（不含通知正文，仅"有新通知"信号）。事件订阅器（M7-2）与未来 job（M10）
   都经 `create()`，故一处接通覆盖所有生成来源。
4. **测试**：注册表单元测试（注册/推送/只推本人/断开清理）+ e2e（端点需登录、无 token 401、落库即收到信号、
   连接清理不挂起）。

> **本切片是"信号管道"，不是"消息总线"**：RFC §10 明确 **REST 为事实源，SSE 仅作"有新通知"的推送信号**。
> 故 SSE 帧**只携带最小信号**（如 `{ type: 'notification.created' }`），**不**把通知正文/未读数塞进流——
> 前端收到信号后用 REST 重拉未读数/列表（M7-4b）。这同时避免越权信息经流泄漏（§15）。

**本切片不做**（划清边界，别越界）：

- 前端任何代码：铃铛/工作台卡片/SSE 消费/断线回退轮询 + `@work/http-client` 流式扩展 → **M7-4b**。
- 触发点配置管理 UI、`modules/notification/web` 模块 → **M7-4b**。
- 多副本 fan-out（共享 pub/sub：Postgres `LISTEN/NOTIFY` / Redis）→ **预留**（§2.6，单实例够用）。
- SSE 帧里下发通知正文 / 未读计数（违背"REST 为事实源"）→ 不做。
- 调度/触发点配置的任何改动（M7-2/M7-3 成果，本切片不碰）。
- 交付验证门禁（verify:full / docker:build 全量 + 假绿核查 + 文档总同步）→ **M7-5**。

> **安全门禁判定（重要）**：本切片**新增一个鉴权 HTTP 端点（SSE）**，但：① 沿用 gateway 既有全局
> `PlatformAuthGuard`（introspection→`request.user`），**不改/不加 guard、不改鉴权规则**；② 数据范围是
> 既有的"`recipient_user_id === request.user.id`"自有范围（与 M7-1 的 list/read 同款），**不动**
> 数据范围模型；③ **不碰** `auth/scope/audit/rbac/repositories` 子树、不动密码/token/session 存储、
> 不新增权限点、不新增 platform 读端口、不新增敏感字段、不动迁移。按 `docs/security-baseline.md` §16
> **字面非强制 security-reviewer 门禁项**。**但**因为它是"流式下发用户私有数据 + 鉴权依赖的只推本人过滤"，
> 与 RFC §15 对 §7 的处置同口径，**建议（非强制）走一次 security-reviewer 自愿二审**，重点看
> "只推本人 / 拒绝客户端传 recipientUserId / 不标 @Public / 不被全局拦截器破坏鉴权"。任务包本身的二审
> 仍按规范走独立 general sub-agent。是否真跑 security-reviewer 由执行者/产品负责人定，本切片不把它当硬门禁。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、统一错误信封、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m7-notification-scheduler.md`（**本切片权威规格**）——重点 **§10 SSE 实时推送**（单端点 / 鉴权 B2-B3
   纠正 / REST 为事实源 / 单实例直推【本期做】 / 多副本 pub/sub【预留】 / 降级）、§12 HTTP API（`/stream` 行：
   登录态本人）、§13 权限（站内通知看/标记本人属登录态默认能力，**不单设功能权限**）、§15 安全要求、
   §8.2/§8.4（生成流程 + InAppDeliverer "落库+SSE 推送"）、§23-4（令牌传递走前端 fetch，属 M7-4b）
4. `apps/gateway-api/CLAUDE.md`（**两个全局 Guard 的坑**：`PlatformAuthGuard` + `PermissionGuard` 对每条嵌入路由生效；
   需 token 的端点**不**标 `@Public`；无 `@RequirePermissions` 的路由 `PermissionGuard` 放行）
5. `modules/presence/CLAUDE.md`（模块隔离、**显式 `@Inject` gotcha**——esbuild/tsx 不 emit 装饰器元数据，裸类型注入会 500）
6. 既有范式代码（**照搬，不要另起炉灶**）：
   - **通知控制器与服务**：`modules/notification/api/src/notification/notification.controller.ts`
     （`@Controller('notification')`、`currentUser(request)` 从 `request.currentUser` 取用户、统一错误）、
     `notification/notification.service.ts`（`create()` 是唯一 fan-out 点，`createMany` 后 `records.map(toDto)`）
   - **生命周期/订阅范式**：`events/notification-event.subscriber.ts`（`OnModuleInit/OnModuleDestroy` + 订阅 +
     handler 整体 try/catch）、`scheduler/scheduler-bootstrap.service.ts`（M7-3：句柄清理纪律）
   - **e2e 范式（memory driver + afterAll close）**：`apps/gateway-api/src/notification.e2e-spec.ts`
     （`PLATFORM_REPOSITORY_DRIVER/NOTIFICATION_REPOSITORY_DRIVER=memory`、`configurePlatformHttp(app,{globalPrefix:'api'})`、
     登录拿 token、`afterAll` 还原 env + `app.close()`）、`apps/gateway-api/src/scheduler.e2e-spec.ts`
   - **HTTP 装配（已核实）**：`packages/nest-common/src/http/configure-platform-http.ts` —— 只挂
     `ValidationPipe` + `ApiExceptionFilter` + `traceIdMiddleware`，**无全局响应转换拦截器**（filter 仅异常时触发）；
     故 `@Sse()` 的 event-stream **不会被响应拦截器包成 JSON 信封**（这是 SSE 能用 Nest 内置装饰器的前提，见 §2.2）
   - **装配**：`modules/notification/api/src/notification.module.ts`（providers/exports；本切片加注册表 provider）

## 2. 设计要点（严格遵守）

### 2.1 端点：用 Nest 内置 `@Sse()`，不手搓 `res.write`

- 在 **`NotificationController`**（`notification/notification.controller.ts`）加方法 `@Sse('stream')`，返回
  `Observable<MessageEvent>`（`MessageEvent` 来自 `@nestjs/common`）。Nest 会自动设 `Content-Type: text/event-stream`
  并按 SSE 协议串流。**不要**用 `@Res()` + `res.write` 手搓（会绕过 Nest 管道、与全局 guard/filter 协作脆弱、易漏鉴权）。
- 路由完整路径：gateway 全局前缀 `api` + 控制器 `notification` + `stream` = **`GET /api/notification/stream`**（对齐 RFC §12）。
- **鉴权（命门，三条硬约束）**：
  1. **不标 `@Public`**——必须过全局 `PlatformAuthGuard`（introspection→`request.user`），与普通登录态 REST 一致。
     前端用 `fetch`+`Authorization` 头消费（M7-4b，RFC §23-4），原生 `EventSource` 不能带头故前端弃用——**但那是 4b 的事**。
  2. **不加 `@RequirePermissions`**——站内通知看本人属登录态默认能力（RFC §13），`PermissionGuard` 对无该装饰器的路由放行。
  3. 用户 id **只从 `request.currentUser` 取**（复用控制器现有 `currentUser(request)`/`currentUserId(request)`
     文件级私有函数 `notification.controller.ts:81-91`，`@Sse('stream')` 方法在同文件可直接调），
     **绝不**接受客户端传入的 `recipientUserId`（query/body 一律不读用户标识）——只推本人（RFC §10、§15）。
- 方法体：`const userId = currentUserId(request); return this.streamRegistry.connect(userId);`（keepalive 见 §2.3）。
- > **鉴权拒绝由全局 guard 产生，handler 不负责**：无 token → `PlatformAuthGuard` 在 handler 前 401，根本到不了方法体；
  > `currentUserId` 内的 `BadRequestException('缺少认证用户')`（`controller.ts:88`）只是 defensive 兜底，正常不触发。

### 2.2 为什么 `@Sse()` 在本仓可用（已核实，写进任务包供二审复核）

- `configurePlatformHttp` **没有全局响应拦截器**（`APP_INTERCEPTOR`），只有输入侧 `ValidationPipe` + 异常侧
  `ApiExceptionFilter` + `traceIdMiddleware`。SSE 端点无 body/无需校验的 query，`ValidationPipe` 不影响响应流；
  `ApiExceptionFilter` 仅在抛异常时介入。故 `@Sse()` 返回的 `MessageEvent` 流**原样下发，不被包成 `{data:...}` 信封**。
- gateway 全局 guard 在 handler 前运行（鉴权照常），不影响后续串流。
- > 若实现期发现任何全局拦截器/中间件破坏 event-stream（不应发生），**首选**给 SSE 帧/路由放行而非改全局装配；
  > 并在 verification-log 记录。

### 2.3 连接注册表 `NotificationStreamRegistry`（进程内，命门）

新增 `modules/notification/api/src/stream/notification-stream.registry.ts`（`@Injectable()`）：

- 内部 `private readonly connections = new Map<string, Set<Subject<MessageEvent>>>()`（同一 user 多标签页 = 多 Subject）。
- `connect(userId: string): Observable<MessageEvent>`：
  - 新建 `const subject = new Subject<MessageEvent>()`，加入该 user 的 Set（无则建 Set）。
  - 返回 `subject.asObservable().pipe(finalize(() => this.remove(userId, subject)))`——**`finalize` 在客户端断开
    （Nest 取消订阅）时移除该 Subject，Set 空则删 key**。这是防连接泄漏的关键（无残留引用）。
  - **keepalive（防代理空闲断流）**：用 `merge(subject$, interval(KEEPALIVE_MS).pipe(map(() => keepaliveEvent)))`
    把心跳并入**本连接的**可观察流——客户端断开时 Nest 取消订阅会**一并停掉 interval**（无 open handle 泄漏）。
    `KEEPALIVE_MS` 取较低频（如 25_000，留在常见代理 30s 空闲超时内）。keepalive 帧用 `{ data: { type: 'keepalive' } }`，
    前端忽略即可。**注意**：interval 必须在 `connect()` 返回的 per-connection 流里构造，**绝不能**用模块级共享 timer
    （否则断开后 timer 还活着 = open handle，vitest "did not exit"——与 M7-3 句柄纪律同理）。
- `emitToUser(userId: string, event: MessageEvent): void`：取该 user 的 Set，对每个 Subject `.next(event)`；user 无连接则 no-op（不报错）。
- `getConnectionCount(userId: string): number`：供测试断言连接数与清理。
- （可选）`onModuleDestroy()`：对所有 Subject `.complete()` 并清空 Map，确保进程关闭时无残留——稳妥起见加上。
- **单实例边界注释**（文件顶部）：`@nestjs/schedule` 同款单实例约束——本注册表是**进程内**连接表，
  多副本部署时各副本只持有连到自己的连接，跨副本通知不会推达其它副本的连接；**多副本 fan-out（Postgres
  `LISTEN/NOTIFY` 或 Redis pub/sub）【预留】**——本期内网单实例部署足够（RFC §10），多副本时再补。

> 信号事件常量：在注册表或一个 `stream/notification-stream.events.ts` 里定义 `notificationStreamEventTypes`
> （`created: 'notification.created'`、`keepalive: 'keepalive'`）。**保持最小**，不外泄正文。

### 2.4 生成链路推送 hook（唯一 fan-out 点）

- 给 `NotificationService` 构造器注入 `NotificationStreamRegistry`（**显式 `@Inject(NotificationStreamRegistry)`**，§2.6）。
- 在 `create()` 中 `const records = await this.repository.createMany(...)` **之后**，对每条记录：
  `this.streamRegistry.emitToUser(record.recipientUserId, { data: { type: notificationStreamEventTypes.created } });`
  （在返回 `{ items }` 前）。
- **只发信号、不发正文**（§0、RFC §10）。fan-out 已去重（`create()` 已 `new Set(recipientUserIds)`），每接收人一条记录 → 一次信号。
- > **多 channel 收口（预留口说明）**：`create()` 支持 `channel`（默认 `in_app`，`service.ts:30`），本期订阅器写死
  > `in_app`（`subscriber.ts:69`），故对每条记录无条件 `emitToUser` **当前无误**。但将来引入 `im`/`email`/`sms`
  > 投递器（RFC §8.4【预留】）时，SSE 信号**应只对 `in_app` 记录触发**（其余 channel 不是站内推送）——届时在此加
  > `record.channel === 'in_app'` 判断。本切片不提前做（无多 channel 数据），仅注释标明收口点。
- > 为什么 hook 在 `create()` 而非各触发器：`create()` 是事件订阅器（M7-2）与未来调度 job（M10）**共同的**唯一落库点，
  > 一处接通即覆盖所有现在与将来的生成来源（正确的抽象层级，不为每个触发点特判）。RFC §8.4 的 `InAppDeliverer`
  > 抽象本切片**不强制引入**——`create()` 内联"落库+推流"已满足 §8.2 生成流程；投递器接口位仍属【预留】，
  > 真正需要多渠道（im/email/sms）时再抽（避免过度设计）。

### 2.5 装配

- `notification.module.ts` `providers` 加 `NotificationStreamRegistry`。
- 控制器已在 `controllers` 列表（无需改），构造器加 `@Inject(NotificationStreamRegistry)`。
- `NotificationService` 构造器加注入（同上）。
- **是否 export `NotificationStreamRegistry`**：本切片无外部消费者 → 暂不 export（M7-4b 经 HTTP 消费，不需进程内注入）。

### 2.6 显式 `@Inject`（presence CLAUDE gotcha）

所有新增注入一律**显式 `@Inject(token/class)`**：`NotificationController` 注入 `NotificationStreamRegistry`、
`NotificationService` 注入 `NotificationStreamRegistry`。`MessageEvent` 仅作类型导入（`import type`）。

## 3. 模块结构增量

### `modules/notification/api`

- `package.json`：**显式声明 `rxjs`**（与 `@nestjs/common` 11 传递的 `^7.x` 对齐）——本切片直接
  `import { Subject, Observable, merge, interval } from 'rxjs'` + `import { finalize, map } from 'rxjs/operators'`；
  本仓**无 `.npmrc`**、pnpm 严格 hoisting，一个包只能 import 自己 `dependencies` 声明过的包（`cron` 在 M7-3
  踩过同坑，见 `m7-3-scheduler-infrastructure.md:76-78`）。**开工即显式加，别等报错**；提交更新后的 `pnpm-lock.yaml`。
- `src/stream/notification-stream.registry.ts`（§2.3，`@Injectable`）。
- `src/stream/notification-stream.events.ts`（§2.3，信号常量；或并入 registry 文件）。
- `src/stream/notification-stream.registry.spec.ts`（§4 单元）。
- `src/notification/notification.controller.ts`：加 `@Sse('stream')` 方法 + 构造器注入注册表（§2.1）。
- `src/notification/notification.service.ts`：构造器注入注册表 + `create()` 落库后逐接收人 `emitToUser`（§2.4）。
- `src/notification.module.ts`：`providers` 加 `NotificationStreamRegistry`（§2.5）。

> 不动 contract（信号常量是 api 内部实现，不进对外契约——前端只需"收到信号就重拉"，不依赖具体 type 字符串语义；
> 若 4b 确实需要区分 type，再在 4b 评估提到 contract。本切片不预设）。不动 db/schema/迁移/触发点/调度/presence/files/forms/platform。

## 4. 验证

### 4.1 命令（全过）

```bash
pnpm install                    # 装新增的 rxjs 显式依赖（§3），提交 lockfile；@nestjs/schedule 已在（M7-3）
pnpm lint && pnpm typecheck
pnpm test                       # 单元 + web
pnpm test:e2e                   # in-memory e2e
pnpm build
# 有本地 Postgres 时：
pnpm verify:full
```

> 本切片不改部署形态（不删/加 app、不改 compose、不改 Dockerfile），`pnpm docker:build` 非必跑。

### 4.2 断言（必须覆盖）

- **单元（`notification-stream.registry.spec.ts`）**：
  - `connect(userA)` 订阅后，`emitToUser(userA, evt)` → 订阅者收到该 evt；`emitToUser(userB, evt)` → userA 订阅者**收不到**（只推本人）。
  - 同一 user 两次 `connect` → `getConnectionCount(user)===2`；两个订阅都收到 `emitToUser`（多标签页）。
  - 取消订阅（模拟客户端断开）→ `getConnectionCount(user)` 递减；全断开后该 user 不在 Map（无泄漏）。
  - `emitToUser` 对**无连接**的 user → 不抛错（no-op）。
  - **keepalive**：用 fake timers 断言 `interval` 到点会向订阅者推 keepalive 帧；**取消订阅后 timer 不再触发**
    （证明 timer 随连接销毁，无 open handle）。
  - （若加 `onModuleDestroy`）销毁后所有连接被 complete、Map 清空。
- **`NotificationService.create` 推送**：注入一个 spy/fake `NotificationStreamRegistry`，`create({recipientUserIds:[A,B]})`
  → 落库后 `emitToUser` 被以 A、B 各调一次、事件 type=`notification.created`、**不含正文字段**；去重后不重复推。
- **e2e（in-memory，`apps/gateway-api/src/notification-stream.e2e-spec.ts`，经 `GatewayModule`，memory driver，
  仿 `notification.e2e-spec.ts` 的 env/login/afterAll close）**：
  - `GET /api/notification/stream` **无 token → 401**（证明走 `PlatformAuthGuard`、未误标 `@Public`）。
  - **带 token 连接 → 收到信号**：用 Node `http.get`/`fetch` + `AbortController` 对真实 `app.getHttpServer()` 发起
    SSE 请求（带 `Authorization`），**确认响应 `Content-Type: text/event-stream`**；连接建立后用
    `app.get(NotificationService).create({recipientUserIds:[当前用户id], ...})` 触发，**读到第一帧含
    `data: {"type":"notification.created"}`** 即断言成功，随后 **`abort()` + `app.close()`**。
    - **硬约束（vitest 假死陷阱，与 M7-3 同纪律）**：SSE 是长连接 + keepalive timer = 活动句柄；测试**必须**
      给读取设超时上限、读到目标帧即 `abort()`、`afterAll` 调 `app.close()`。否则 vitest 挂起/"did not exit"。
      若 supertest 不便读流，用 `node:http` 原生请求或全局 `fetch` + reader，读到一帧立刻 abort。
  - **只推本人（e2e 级，可选但推荐）**：两个用户各连一条流，给 userA `create` → 仅 userA 的流收到信号，userB 不收到。
- **回归**：既有 notification/presence/files/forms/scheduler 单元 + e2e **全绿**，重点确认引入 SSE 长连接后
  **测试进程能正常退出**（无挂起；§2.3 keepalive timer 随连接销毁 + e2e abort/close）。
- 验收禁止假数据/占位蒙混；source-review 判定而非裸 grep。

## 5. 退出标准

1. `GET /api/notification/stream` 端点用 Nest `@Sse()` 落地：过 `PlatformAuthGuard`（无 token 401）、**未标 `@Public`**、
   **无 `@RequirePermissions`**、用户 id 只从 `request.currentUser` 取、不接受客户端传 `recipientUserId`。
2. `NotificationStreamRegistry`：`connect/emitToUser/getConnectionCount` 落地；只推本人；多标签页；断开经 `finalize`
   清理无泄漏；keepalive timer 随连接销毁（无 open handle）；单实例边界 + 多副本 pub/sub【预留】注释到位。
3. `NotificationService.create()` 落库后按接收人推**最小信号**（不含正文），覆盖事件订阅器与未来 job 的所有生成。
4. 单元 + e2e 全绿，**测试进程正常退出**；e2e 证明"无 token 401 / 带 token 收到 created 信号 / event-stream content-type"。
5. **不**新增权限点 / 不改 guard / 不动 auth-scope-audit-rbac-repositories / 不动迁移 / 不碰前端。
6. `pnpm verify` 全绿。

## 6. 必须保持不变（避免越界）

- 不引入重型实时网关（socket.io / `realtime-gateway` / Kafka / Redis）——仅 Nest `@Sse()` 单端点 + 进程内注册表（RFC §2、§10）。
- 不动 auth/scope/audit/rbac/repositories 规则；不新增权限点；不新增 platform 读端口；不标 `@Public`。
- 不动 presence/files/forms/platform 代码与 M7-2/M7-3 的事件订阅/触发点/调度链路。
- 不在 SSE 帧下发通知正文/未读数（REST 为事实源，SSE 仅信号）。
- 不做前端/不动 `@work/http-client`/不建 `modules/notification/web`（M7-4b）；不做多副本 pub/sub（预留）。
- notification 不读写其它模块 schema；推送只在 notification 自有进程内。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：M7-4a 完成结论 + 下一步 M7-4b；M7 切片表标 M7-4a done（M7-4 拆 a/b 的说明）。
- `docs/architecture.md`：SSE 落位——notification 模块经 Nest `@Sse()` 持有 `GET /api/notification/stream`、
  进程内 `NotificationStreamRegistry`、生成链路（`create()`）推最小信号、REST 为事实源、**单实例直推 + 多副本 pub/sub【预留】**。
- `docs/security-baseline.md`：**评估**是否补一句"通知 SSE 端点沿用既有 `PlatformAuthGuard`、只推本人、不接受客户端 recipientId"
  （按 §16 判定非强制门禁项；若不补，在 verification-log 记此判定）。
- `docs/deployment.md`：若需，注明 SSE 长连接 + 单实例调度/推送的部署约束（反向代理需放行 `text/event-stream`、
  关闭对 `/api/notification/stream` 的响应缓冲/聚合）。
- `docs/verification-log.md`：追加 `M7-4a Notification SSE Backend` 锚点与结论（含安全门禁判定 + 是否跑 security-reviewer + 假绿核查结论）。

## 8. 提交规范

- Conventional Commits：`feat(notification): SSE push endpoint + in-process stream registry`。
- 提交信息说明三块：① `@Sse()` 端点（沿用 PlatformAuthGuard / 不标 @Public / 不加权限 / 只推本人）
  ② `NotificationStreamRegistry`（进程内、多标签页、断开清理、keepalive 无 open handle、单实例边界 + 多副本【预留】）
  ③ `create()` 生成链路推最小信号；并注明本切片**非强制 security-reviewer 门禁项**的判定依据（§0）与是否自愿跑了二审。
- 交付前跑完 §4 命令，结论贴进 `docs/verification-log.md`。
