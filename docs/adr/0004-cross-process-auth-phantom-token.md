# ADR 0004: 跨进程认证 —— Phantom Token 模式

## 状态

Accepted

## 背景

M4 起 gateway-api 内嵌业务模块（presence、approval、report，见 ADR-0003）。业务模块 API 需要鉴权，但 gateway 进程不持有 `platform` schema 的数据库连接，无法直接复用 platform-api 内部直接查库的 `PlatformAuthGuard`。

当前对外令牌是 opaque 令牌：登录后由 `AuthService` 生成随机串，写入 `platform.sessions`，数据库只保存 token hash。这本身就是一个标准的引用令牌（reference token）实现。

需要确定一件事：gateway 进程，以及 M7 之后拆出来的独立业务服务进程，如何验证这个对外令牌、如何把已认证的用户身份传递给业务模块。

业界对微服务与微前端的跨进程鉴权有三种基本令牌形态——自包含的 JWT、引用式的 opaque 令牌、以及二者的混合 Phantom Token。本 ADR 在此之间做出选择。

## 决策

### 1. 对外令牌保持 opaque，不改为 JWT

对外令牌继续使用 opaque 引用令牌，存 `platform.sessions`，数据库只存 hash。

不采用对外 JWT。理由：JWT 自包含、可本地验签，但在过期前无法单点撤销；而 `security-baseline.md` §4.1 明确要求"logout 或禁用用户后应能撤销 session"。opaque 令牌配合 `platform.sessions` 表天然支持即时撤销，满足该基线。

### 2. 由网关做 introspection，复用 `GET /api/platform/auth/me`

非 platform-api 的服务（M4–M6 的 gateway 进程、M7 之后的独立业务服务）不直接查 `platform` 数据库验证令牌。它们统一通过 introspection：以 HTTP 调用 platform-api 的 `GET /api/platform/auth/me`，传入对外 opaque 令牌，换回当前用户身份，或得到 401。

不新建专用 introspection 端点。`GET /api/platform/auth/me` 当前的行为已经是"用 Bearer 令牌解析出 currentUser"，正是 introspection 所需。本 ADR 将其正式确立为跨进程 introspection 入口。

### 3. 分阶段：M4–M6 只做 introspection，M7 才引入内部 JWT

本 ADR 的实施与 ADR-0003 的阶段对齐：

- M4–M6（业务模块内嵌在 gateway 进程）：gateway 进程内的鉴权 guard 对 opaque 令牌做 introspection，把解析出的 currentUser 注入**进程内**的 request 对象；内嵌业务模块直接读取 request 上的 currentUser。此阶段同进程、无跨进程边界，**不引入内部 JWT**。
- M7（业务模块拆为独立进程）：gateway 完成 introspection 拿到身份后，签发一个**短命内部 JWT**，注入到转发给业务服务的请求头中；独立业务服务本地验签该内部 JWT。内部 JWT 只在内网服务间流转，不下发给任何客户端。

### 4. introspection 结果可缓存，但撤销窗口受限

调用方（gateway）可以对 introspection 结果做短 TTL 缓存，以降低对 platform-api 的调用频率。但缓存 TTL 必须显著短于令牌剩余寿命，且不得让"用户被撤销后仍可访问"的窗口超出可接受范围。本 ADR 给出上限建议：缓存 TTL 不超过 60 秒。

### 5. 业务模块永不直连 platform 数据库验证令牌

无论内嵌还是独立部署，业务模块都不得为了验证令牌而直接访问 `platform` schema。令牌验证只能经由 introspection。这与 `constitution.md` 第 8 节"业务模块不得访问其它模块数据库表"一致。

## 关键取舍

### 为什么对外不用 JWT

JWT 可本地验签、省去 introspection 调用，但它在过期前撤不掉。logout、禁用员工这类操作要求令牌立即失效，opaque 令牌查 `platform.sessions` 即可即时撤销，JWT 做不到（除非再叠加黑名单，反而更复杂）。保持对外 opaque 是与 `security-baseline.md` §4.1 一致的最简选择。

### 为什么 M4–M6 不引入内部 JWT

M4–M6 业务模块与 gateway 同进程，不存在跨进程边界，身份直接通过进程内 request 对象传递即可。此时引入内部 JWT 等于提前背上签名密钥管理、签发、验签的负担，却没有任何跨进程场景来使用它。按 ADR-0003 的阶段，内部 JWT 是 M7 拆进程后才出现的真实需求。

### 为什么复用 `/auth/me` 而非新建 `/auth/introspect`

`GET /api/platform/auth/me` 的现有语义就是"持 Bearer 令牌换回当前用户"，与 introspection 完全一致。新建一个 `/auth/introspect` 只会得到一个功能重叠的端点和一份重复契约。复用既有端点更简单，也减少需要长期维护的 API 面。

### 缓存的取舍

introspection 缓存能显著降低 platform-api 在业务高峰期的压力，但会拉长"撤销后仍可访问"的窗口。短 TTL（不超过 60 秒）是性能与安全之间的平衡点；内网、低流量场景下这个窗口可接受。

## 与其它决策的关系

- ADR-0003 确定 gateway 在 M4–M6 内嵌业务模块、M7 拆为独立服务；本 ADR 的"分阶段"与之严格对齐。
- `security-baseline.md` 第 4 节需补充 Phantom Token 模型（对外 opaque、introspection、M7 内部 JWT）。
- `platform-core.md` 第 3 节需补充 `GET /api/platform/auth/me` 承担 introspection 职责的说明。
- 内部 JWT 的 claim 结构、TTL、签名算法、密钥来源与轮换等实现细节，在 M7 启动前由专门的 RFC 或后续 ADR 定义。本 ADR 只确立形态，不写完整实施规格（符合 ADR 与 RFC 的分工）。

## 影响

### 正向

- 对外令牌零改动，`security-baseline.md` §4.1 的即时撤销语义不被破坏。
- M4-2 的鉴权实装量小：只需在 gateway 进程实现一个调用 `/auth/me` 的鉴权 guard，无需任何 JWT 基础设施。
- M7 拆进程时，跨进程认证模式已经定好，只需补内部 JWT 的签发与验签。

### 代价

- M4–M6 每个业务请求会多一次 gateway 到 platform-api 的 introspection 调用；短 TTL 缓存可摊薄该开销。
- M7 引入内部 JWT 时，需要配套的签名密钥管理与轮换方案。

### 文档影响

- `docs/security-baseline.md` 第 4 节新增"跨进程认证（Phantom Token）"小节。
- `docs/platform-core.md` 第 3 节补充 `GET /api/platform/auth/me` 的 introspection 职责说明。

## 实装时点

- 本 ADR 不要求任何即时代码改动。
- M4–M6 的 introspection 鉴权 guard 随 M4-2（presence API、权限、审计）落地。
- M7 的内部 JWT 签发与验签随 M7 业务服务拆分落地。
