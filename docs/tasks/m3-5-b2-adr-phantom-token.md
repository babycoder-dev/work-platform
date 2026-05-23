# Task: M3.5-B2 ADR-0004 跨进程认证（Phantom Token）

## 状态

Ready for execution

## 0. 任务定位

本切片属于 **M3.5 收口** 阶段，紧接已完成的 M3.5-B。

这是一个**纯文档切片**：产出 ADR-0004，并把它对安全基线和平台核心契约的影响同步进 `security-baseline.md` 与 `platform-core.md`。**不改任何代码、不改测试、不改迁移、不改依赖。**

ADR-0004 要记录的决策已经由项目负责人与架构调研共同拍板（基于对微服务/微前端鉴权业界做法的调研：JWT vs opaque token vs Phantom Token vs BFF）。本任务包 §4.1 给出 ADR 的**完整最终文本**。Codex 的职责是把文本落成文件、按 §4.2/§4.3 精确修正两份文档、按 §7 更新进度文档——**不需要、也不应该自行做架构判断或改写 ADR 结论**。如对 ADR 文本有疑问，回来问，不要擅自改写。

Phantom Token 的**代码实装**不在本切片范围内：M4–M6 的 introspection guard 随 M4-2 落地，M7 的内部 JWT 随 M7 业务服务拆分落地。本切片只确立决策与契约。

## 1. 背景

M4 起 gateway-api 内嵌业务模块（presence 等，见 ADR-0003）。业务模块 API 需要鉴权，但 gateway 进程没有 `platform` schema 的数据库连接，不能直接复用 platform-api 的 `PlatformAuthGuard`（后者直接查库）。需要确定：gateway 进程（以及 M7 之后的独立业务服务进程）如何验证对外令牌、如何把用户身份传给业务模块。

业界对微服务/微前端跨进程鉴权有成熟模式。本项目选用 **Phantom Token**：对外是 opaque（引用）令牌，由网关做 introspection 解析，对内传递身份。它的关键好处是——对外令牌保持 opaque，`platform.sessions` 表天然支持即时撤销，不与 `security-baseline.md` §4.1「logout/禁用用户后可撤销 session」冲突；而 JWT 在过期前无法单点撤销，会推翻这条基线。

ADR-0004 固定这套跨进程认证模式，并与 ADR-0003 的"M4–M6 内嵌、M7 拆分"阶段对齐。

## 2. 必读

按顺序：

1. `AGENTS.md`
2. `docs/doc-index.md`（§1 文档优先级、§4 ADR 与 RFC 的区别、§5 文档审查规则）
3. `docs/adr/0001-openim-as-im-provider.md`、`docs/adr/0002-foundation-first-platform-plan.md`、`docs/adr/0003-gateway-boundary.md`（ADR 写法范例 + ADR-0003 的阶段划分，本 ADR 要与之对齐）
4. `docs/constitution.md` §8（模块边界）、§10（统一错误格式）、§11（HTTP 与 API 版本、请求头约定）
5. `docs/security-baseline.md` §3（认证基线）、§4（Session 与 Token 基线）——§4 是本切片要修改处
6. `docs/platform-core.md` §2（初始接口）、§3（认证与权限运行时约定）——§3 是本切片要修改处
7. `docs/foundation-blueprint.md` 第 10 节 M7 里程碑
8. `apps/platform-api/src/auth/auth.controller.ts`、`auth.service.ts`、`platform-auth.guard.ts`（确认 `GET /api/platform/auth/me` 的现有行为，只读，不改）
9. `apps/gateway-api/src/gateway.module.ts`（确认 gateway 当前内嵌实现，只读，不改）
10. `docs/foundation-progress.md` §6、§6.1（需要更新的进度段落）
11. `docs/verification-log.md` 顶部（确认当天日期标题是否已存在，供 §7.2 日期去重判断）

## 3. 设计要点

1. ADR 的全部结论已在 §4.1 给出最终文本。Codex 不做架构决策，只做落地。
2. ADR 文件名固定为 `docs/adr/0004-cross-process-auth-phantom-token.md`。
3. ADR 编号 0004，状态 `Accepted`，与现有 ADR 风格（中文、状态/背景/决策/影响）一致。
4. 本切片**只**产出：1 份新 ADR + `security-baseline.md` 新增 1 个小节 + `platform-core.md` §3 末尾追加 1 段 + 2 份进度文档更新。不得有其它改动。
5. 内部 JWT 的 claim、TTL、签名算法等细节属于 M7，本 ADR 只确立形态，不定死实现细节。

## 4. 文件清单与具体改动

### 4.1 新增：`docs/adr/0004-cross-process-auth-phantom-token.md`

整文件内容如下，逐字落地（注意：ADR 正文内不含任何代码块围栏）：

```markdown
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
```

### 4.2 修改：`docs/security-baseline.md`

在第 4 节内、`### 4.3 客户端保存` 小节**之后**、`## 5. 授权基线` **之前**，新增一个 `### 4.4` 小节。新增编号 4.4 接在 4.3 之后，不打乱任何现有编号。

定位原文（`### 4.3 客户端保存` 小节的结尾到 `## 5. 授权基线`）：

```text
C/S 客户端：

- Windows 优先使用系统凭据存储或加密配置。
- 不保存密码。
- 本地配置文件不得明文保存 token。

## 5. 授权基线
```

改为：

```text
C/S 客户端：

- Windows 优先使用系统凭据存储或加密配置。
- 不保存密码。
- 本地配置文件不得明文保存 token。

### 4.4 跨进程认证（Phantom Token）

跨进程、跨服务的令牌验证统一采用 Phantom Token 模式。决策详见 `docs/adr/0004-cross-process-auth-phantom-token.md`。

- 对外令牌是 opaque 引用令牌，不是 JWT。理由：opaque 令牌配合 `platform.sessions` 支持即时撤销，满足 §4.1。
- 非 platform-api 的服务（gateway，以及 M7 后的独立业务服务）不直接查 `platform` 数据库验证令牌，统一通过 introspection：HTTP 调用 `GET /api/platform/auth/me`。
- M4–M6 内嵌阶段：introspection 后身份在 gateway 进程内传递，不签发内部 JWT。
- M7 拆进程后：introspection 后签发短命内部 JWT，注入下游请求头，业务服务本地验签。内部 JWT 只在内网服务间流转，不下发给客户端。
- introspection 结果可由调用方按短 TTL 缓存，缓存 TTL 不超过 60 秒，避免撤销窗口过长。

## 5. 授权基线
```

> `security-baseline.md` 其它内容一律不动。§15「当前风险」表不需要本切片修改。

### 4.3 修改：`docs/platform-core.md`

本改动是**纯插入**：不删除、不修改 `platform-core.md` 任何现有行，只在第 3 节末尾插入一个新小节。

定位 `## 4. 种子账号` 这一行——它紧跟在第 3 节"当前内置平台权限"代码块的结束围栏之后，是 `platform-core.md` 中唯一的 `## 4.` 标题。在 `## 4. 种子账号` 之前插入下面这段新内容，新内容与 `## 4. 种子账号` 之间保留一个空行：

````markdown
## 3.1 introspection 与跨进程认证

`GET /api/platform/auth/me` 除了供 Web Shell 凭已有 access token 恢复当前用户，还正式承担 gateway 与业务服务的 token introspection 职责：传入对外 opaque 令牌（`Authorization: Bearer <token>`），返回 `CurrentUserDto` 或 401。

M4 起 gateway-api 内嵌业务模块时，由 gateway 侧的鉴权 guard 调用 `GET /api/platform/auth/me` 完成 introspection，把 `currentUser` 注入进程内 request；业务模块不直接连 `platform` 数据库验证令牌。跨进程认证的整体模式（对外 opaque、introspection 复用 `/auth/me`、M7 引入内部 JWT）见 `docs/adr/0004-cross-process-auth-phantom-token.md`。
````

> 上面 ````markdown 与 ```` 这对 4 反引号只是本任务包的外壳，不写进文件。`platform-core.md` 其它内容一律不动，第 3 节"当前内置平台权限"代码块及其三反引号围栏保持原样。新增小节标题用 `## 3.1`，与该文件已有的 `## 3.` 编号风格一致。

## 5. 必须保持不变（避免越界）

- 任何 `.ts` / `.tsx` / `.json` 代码或配置文件。
- `apps/` 下任何文件——本切片只记录决策与契约，不实施鉴权代码。
- 数据库迁移、package.json、pnpm-lock.yaml。
- `docs/constitution.md`、`docs/foundation-blueprint.md`、`docs/architecture.md`——ADR 引用它们，但本切片不修改它们。
- 现有 ADR `0001` / `0002` / `0003`。
- `security-baseline.md` 与 `platform-core.md` 中除 §4.2/§4.3 指定位置之外的内容。
- 本切片产出的 git diff 必须**只包含 `.md` 文件**。

## 6. 验证

本切片不改代码，验证以"未误伤仓库"+"内容自查"为主。

### 6.1 未误伤确认

```powershell
git status --short
```

预期改动文件**只有**：
- `docs/adr/0004-cross-process-auth-phantom-token.md`（new）
- `docs/security-baseline.md`（modified）
- `docs/platform-core.md`（modified）
- `docs/foundation-progress.md`（modified）
- `docs/verification-log.md`（modified）

如出现任何非 `.md` 文件改动，即为越界，必须回退。

可选：跑 `pnpm typecheck` 确认仓库代码未被误伤。本切片不要求跑完整 `pnpm verify`。

### 6.2 内容自查清单

**A. ADR 内容**——逐条确认 `0004-cross-process-auth-phantom-token.md` 覆盖以下 9 个要点，缺一不可：

1. 状态为 `Accepted`。
2. 背景说明了 gateway 进程无 `platform` 数据库连接、需确定跨进程令牌验证方式。
3. 决策点 1：对外令牌保持 opaque，不改为 JWT，并给出"opaque 支持即时撤销、满足 §4.1"的理由。
4. 决策点 2：introspection 复用 `GET /api/platform/auth/me`，不新建端点。
5. 决策点 3：分阶段——M4–M6 只 introspection + 进程内注入身份，M7 才引入短命内部 JWT。
6. 决策点 4：introspection 结果可缓存，TTL 上限 60 秒。
7. 决策点 5：业务模块永不直连 `platform` 数据库验证令牌。
8. "与其它决策的关系"引用了 ADR-0003、security-baseline §4、platform-core §3。
9. "实装时点"明确 M4–M6 guard 随 M4-2、内部 JWT 随 M7，本 ADR 无即时代码改动。

**B. 跨文档一致性**——确认：

10. `docs/security-baseline.md` 新增的 `### 4.4` 小节与 ADR 决策一致，且未打乱 §4.1/§4.2/§4.3 与 §5 的编号。
11. `docs/platform-core.md` 新增的 `## 3.1` 小节把 `/auth/me` 的 introspection 职责写清，并引用了 ADR-0004。

## 7. 完成后更新的文档

### 7.1 `docs/foundation-progress.md`

对 `docs/foundation-progress.md` 做一次精确替换：把下面【原文】所覆盖的整块（§6 全文 + §6.1 表，从 `## 6. 当前下一步` 到 §6.1 表最后一行 `| M3.5-G | ... |`）替换为【改为】。`## 7.` 及之后保持不动。

如果【原文】与当前文件不能逐字匹配（例如此前有人编辑过），停下来回报，不要自行猜测边界。

【原文】与【改为】两块最外层的 4 反引号围栏只是本任务包用来包住块内 ```text 三反引号围栏的外壳。匹配 old_string、写入 new_string 时都**不含**这对最外层 4 反引号；块内的 ```text ... ``` 三反引号围栏是 `foundation-progress.md` 的真实内容，必须保留。

【原文】（`docs/foundation-progress.md` 当前 §6 与 §6.1 的逐字全文）：

````markdown
## 6. 当前下一步

当前建议执行：

```text
M3.5-B2: ADR-0004 跨进程鉴权（Phantom Token）
```

上一切片任务包：`docs/tasks/m3-5-b-adr-gateway-boundary.md`。

M3.5-B 完成结果：

- 新增 `docs/adr/0003-gateway-boundary.md`：固定 gateway-api 在 M4–M6 作为 API 组合宿主内嵌业务模块，M7 起拆为独立业务服务 + 纯边缘网关，拆分时点硬绑定 M7 里程碑。
- 修正 `docs/architecture.md` 中与实现漂移的 gateway 描述。
- `docs/foundation-blueprint.md` M7 交付清单补充业务服务拆分项。
- verification-log 锚点：`M3.5-B Gateway Boundary ADR`。

M3.5 收口切片剩余顺序：

```text
M3.5-B2 ADR-0004 跨进程鉴权（Phantom Token）
M3.5-C  登录失败审计 + 锁定策略落地
M3.5-D  首次登录改密 + 管理员重置密码端点
M3.5-E  Platform 数据范围 resolver（PlatformScopeService）
M3.5-F  Shell 引入 react-router-dom@6，路由拆组件
M3.5-G  跨 schema 数据访问规则文档化（module-contract.md 增加章节）
```

M3.5 全部退出后再启动 `M4-1: presence contract、schema、repository`。

### 6.1 M3.5 收口切片

| 切片 | 能力 | 状态 | 说明 |
| --- | --- | --- | --- |
| M3.5-A | 让模块 manifest 由各 contract 包统一供给 | Done | 2026-05-21 完成；业务模块平台侧 manifest 已迁回各 contract 包；详见 verification-log `M3.5-A Manifest Single Source` |
| M3.5-B | ADR-0003 Gateway 边界 | Done | 2026-05-22 完成；ADR-0003 固定 gateway M4–M6 内嵌、M7 拆分；详见 verification-log `M3.5-B Gateway Boundary ADR` |
| M3.5-B2 | ADR-0004 跨进程鉴权（Phantom Token） | Pending | M3.5-B 后启动 |
| M3.5-C | 登录失败审计 + 锁定策略落地 | Pending | M3.5-B2 后启动 |
| M3.5-D | 首次登录改密 + 管理员重置密码端点 | Pending | M3.5-C 后启动 |
| M3.5-E | Platform 数据范围 resolver | Pending | M3.5-D 后启动 |
| M3.5-F | Shell 引入 react-router-dom@6，路由拆组件 | Pending | M3.5-E 后启动 |
| M3.5-G | 跨 schema 数据访问规则文档化 | Pending | M3.5-F 后启动 |
````

【改为】（目标态；`YYYY-MM-DD` 填执行交付当天的实际日期）：

````markdown
## 6. 当前下一步

当前建议执行：

```text
M3.5-C: 登录失败审计 + 锁定策略落地
```

上一切片任务包：`docs/tasks/m3-5-b2-adr-phantom-token.md`。

M3.5-B2 完成结果：

- 新增 `docs/adr/0004-cross-process-auth-phantom-token.md`：确立跨进程认证采用 Phantom Token——对外 opaque 令牌，网关 introspection 复用 `GET /api/platform/auth/me`，M4–M6 只做 introspection、M7 才引入短命内部 JWT。
- `docs/security-baseline.md` 第 4 节新增"跨进程认证（Phantom Token）"小节。
- `docs/platform-core.md` 第 3 节补充 `/auth/me` 的 introspection 职责说明。
- verification-log 锚点：`M3.5-B2 Phantom Token ADR`。

M3.5 收口切片剩余顺序：

```text
M3.5-C  登录失败审计 + 锁定策略落地
M3.5-D  首次登录改密 + 管理员重置密码端点
M3.5-E  Platform 数据范围 resolver（PlatformScopeService）
M3.5-F  Shell 引入 react-router-dom@6，路由拆组件
M3.5-G  跨 schema 数据访问规则文档化（module-contract.md 增加章节）
```

M3.5 全部退出后再启动 `M4-1: presence contract、schema、repository`。

### 6.1 M3.5 收口切片

| 切片 | 能力 | 状态 | 说明 |
| --- | --- | --- | --- |
| M3.5-A | 让模块 manifest 由各 contract 包统一供给 | Done | 2026-05-21 完成；业务模块平台侧 manifest 已迁回各 contract 包；详见 verification-log `M3.5-A Manifest Single Source` |
| M3.5-B | ADR-0003 Gateway 边界 | Done | 2026-05-22 完成；ADR-0003 固定 gateway M4–M6 内嵌、M7 拆分；详见 verification-log `M3.5-B Gateway Boundary ADR` |
| M3.5-B2 | ADR-0004 跨进程鉴权（Phantom Token） | Done | YYYY-MM-DD 完成；ADR-0004 确立 Phantom Token、introspection 复用 `/auth/me`；详见 verification-log `M3.5-B2 Phantom Token ADR` |
| M3.5-C | 登录失败审计 + 锁定策略落地 | Pending | M3.5-B2 后启动 |
| M3.5-D | 首次登录改密 + 管理员重置密码端点 | Pending | M3.5-C 后启动 |
| M3.5-E | Platform 数据范围 resolver | Pending | M3.5-D 后启动 |
| M3.5-F | Shell 引入 react-router-dom@6，路由拆组件 | Pending | M3.5-E 后启动 |
| M3.5-G | 跨 schema 数据访问规则文档化 | Pending | M3.5-F 后启动 |
````

### 7.2 `docs/verification-log.md`

顶部追加一条记录。**日期标题去重**：若顶部已存在交付当天的 `## YYYY-MM-DD` 标题，不要再新增同名日期标题，直接在该标题下追加 `### M3.5-B2 Phantom Token ADR` 小节；只有当顶部日期不是交付当天时才新增 `## YYYY-MM-DD`。

`### M3.5-B2 Phantom Token ADR` 小节至少包含：

- **Change set**：新增 `docs/adr/0004-cross-process-auth-phantom-token.md`；`security-baseline.md` 第 4 节新增 §4.4 跨进程认证小节；`platform-core.md` 第 3 节新增 §3.1 introspection 说明。
- **Verification**：`git status --short` 确认改动仅 5 个 `.md` 文件；§6.2 自查清单 A 的 9 项与 B 的 2 项逐项确认通过。
- **Follow-up**：下一切片 `M3.5-C 登录失败审计 + 锁定策略落地`。

## 8. 提交规范

按 Conventional Commits 单次提交。使用显式 `git add <files>` 列出文件，不要用 `git add -A` / `git add .`。

包含在本次 commit 内的文件：

new:
- `docs/adr/0004-cross-process-auth-phantom-token.md`

modified:
- `docs/security-baseline.md`
- `docs/platform-core.md`
- `docs/foundation-progress.md`
- `docs/verification-log.md`

**不要**包含：
- `docs/tasks/m3-5-b2-adr-phantom-token.md`（本任务包，由审查者维护）。
- `.tmp/` 或任何本地缓存。

Commit 模板（message body 用单行连续段落，不要在句子之间插空行）：

```
docs: add ADR-0004 for phantom token cross-process auth

Record that cross-process auth uses the Phantom Token pattern: the
external token stays opaque, the gateway introspects it by reusing
GET /api/platform/auth/me, and an internal short-lived JWT is only
introduced at M7 when business modules split into separate processes.
Sync the decision into the security baseline and platform-core docs.
```

## 9. 完成确认

在交付说明里列出：

- `git status --short` 输出（确认只动上述 5 个 `.md` 文件）。
- §6.2 自查清单 A 的 9 项 + B 的 2 项逐项结论。
- commit hash 与 `git show --stat <hash>` 输出。
- 确认 `docs/foundation-progress.md` §6.1 表 `M3.5-B2` 行已改为 `Done`，且 §6 下一步已指向 `M3.5-C`。
