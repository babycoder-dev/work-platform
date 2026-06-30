# 安全基线 v0.1

本文档定义平台在企业内网部署场景下的最低安全要求。内网环境不等于可信环境，默认仍按“账号可能被盗、网络可能被监听、内部用户可能越权操作”的风险模型设计。

## 1. 适用范围

覆盖：

- Web UI。
- C/S 客户端。
- gateway-api。
- platform-api。
- business module API。
- im-adapter-api。
- modules/notification API（经 gateway-api 装配）。
- realtime-gateway。
- PostgreSQL。
- Redis。
- Docker Compose 内网部署。

## 2. 基本原则

- 默认拒绝，显式授权。
- 所有身份、角色、权限由 Platform Core 统一维护。
- 所有受保护 API 必须经过认证和权限校验。
- 所有写操作必须考虑审计日志。
- 密码、token、密钥不得明文持久化。
- 生产环境不得使用开发默认账号密码。
- 错误响应不得泄露数据库、栈、密钥、内部路径。
- 客户端不拥有独立业务权限判断，只做展示优化。

## 3. 认证基线

### 3.1 身份源

首期身份源为平台内部账号。

不依赖：

- 飞书。
- 企业微信。
- 公网 OAuth。
- 外部 OIDC。
- LDAP。

后续如接入 LDAP/OIDC，必须通过独立 adapter，并保持 Platform Core 作为权限事实源。

### 3.2 登录

登录必须：

- 使用 HTTPS 或内网可信 TLS 终止。
- 校验账号状态。
- 校验员工状态。
- 校验密码 hash。
- 记录登录成功/失败审计。
- 更新 `last_login_at`。
- 支持失败次数和锁定策略。

登录失败响应不得区分“账号不存在”和“密码错误”。

统一返回：

```text
账号或密码错误
```

**例外**：账号触发锁定阈值或处于锁定期内时，响应必须明确告知"账号已被锁定，请 N 分钟后重试"（含剩余分钟数）。理由：本系统默认企业内网部署、面向已知用户群体，"账号是否存在"已不构成核心信息泄露（用户在登录页已输入账号）；反之，不告知锁定会让用户反复重试，徒增 platform-api 负载和审计噪音。

### 3.3 密码存储

禁止：

- 明文密码。
- 可逆加密密码。
- 把密码写入日志。
- 把密码放入 URL query。

当前 M1 实现：

```text
scrypt
```

M1 第一切片采用 Node.js 内置 `scrypt`，原因是避免在内网构建和 CI 中引入原生密码库编译风险。该实现必须记录参数版本、独立 salt，并通过统一接口封装。

长期推荐迁移目标：

```text
argon2id
```

迁移到 argon2id 前必须补充实现记录或 ADR，说明参数、构建影响、内网离线部署影响和兼容迁移策略。

最低要求：

- 每个密码独立 salt。
- hash 参数固定在代码或配置中，并记录版本。
- 支持未来 hash 参数升级。

### 3.4 密码策略

默认策略：

```text
minLength: 8
requireNumber: true
requireUppercase: false
requireSpecialChar: false
maxFailedAttempts: 5
lockDurationMinutes: 15
```

生产环境建议：

```text
minLength: 10
requireNumber: true
requireUppercase: true
requireSpecialChar: false
maxFailedAttempts: 5
lockDurationMinutes: 15
```

首期必须具备字段：

- `must_change_password`
- `password_updated_at`
- `failed_attempts`
- `locked_until`

首次管理员密码必须强制改密或要求安装时输入。

## 4. Session 与 Token 基线

### 4.1 Access Token

要求：

- token 随机生成，不能包含敏感业务数据。
- 数据库只保存 token hash。
- token 必须有过期时间。
- token 失效后必须返回 `登录状态无效`。
- logout 或禁用用户后应能撤销 session。
- M1 后 session 持久化到 `platform.sessions`，access token 只以 hash 形式入库；内存 session 只能作为测试 fixture 或开发 fallback。

禁止：

- 永不过期 token。
- 明文 token 持久化。
- 在日志中打印 token。

### 4.2 Refresh Token

当前阶段不实现 refresh token。

原因：

- refresh token 需要撤销、轮换、泄露检测等完整机制。
- 过早返回 refresh token 会形成错误契约。

后续如实现，必须满足：

- refresh token 单独存储 hash。
- refresh token 轮换。
- refresh token 复用检测。
- 设备/session 维度撤销。

### 4.3 客户端保存

Web UI：

- 首期可使用内存或受控 storage。
- 不得把 token 放入 URL。
- 401 后必须清理登录态。

C/S 客户端：

- Windows 优先使用系统凭据存储或加密配置。
- 不保存密码。
- 本地配置文件不得明文保存 token。

### 4.4 跨进程认证（Phantom Token）

跨进程、跨服务的令牌验证统一采用 Phantom Token 模式。决策详见 `docs/adr/0004-cross-process-auth-phantom-token.md`。

- 对外令牌是 opaque 引用令牌，不是 JWT。理由：opaque 令牌配合 `platform.sessions` 支持即时撤销，满足 §4.1。
- 非 platform-api 的服务（gateway，以及 vNext 拆分后的独立业务服务）不直接查 `platform` 数据库验证令牌，统一通过 introspection：HTTP 调用 `GET /api/platform/auth/me`。
- 当前内嵌阶段（M4 起、直至 vNext 拆分前）：introspection 后身份在 gateway 进程内传递，不签发内部 JWT。
- vNext 拆进程后：introspection 后签发短命内部 JWT，注入下游请求头，业务服务本地验签。内部 JWT 只在内网服务间流转，不下发给客户端。ADR-0005 已把 ADR-0003 的原 M7 拆分时点推迟到 vNext。
- introspection 结果可由调用方按短 TTL 缓存，缓存 TTL 不超过 60 秒，避免撤销窗口过长。
- introspection 载荷 `CurrentUserDto.dataScopes` 使用按类型分组形状
  `Record<PlatformDataType, DataScope[]>`；跨进程消费者（当前包括 presence）必须按目标数据类型读取，
  不得把某一类型的范围用于另一类型。

## 5. 授权基线

### 5.1 权限模型

权限分为：

- 菜单权限。
- 操作权限。
- 数据范围权限。

所有后端接口必须以后端权限校验为准。前端菜单/按钮隐藏只是体验优化。

### 5.2 API 权限

受保护 API 必须：

- 使用认证 guard。
- 使用权限 guard。
- 使用 `@RequirePermissions(...)` 或等价机制声明权限。

禁止：

- 只在前端判断权限。
- controller 内临时写字符串判断。
- 业务模块绕过 Platform Core 自建权限来源。

### 5.3 数据范围

采用模型 B：数据权限按数据类型分别授权。同一用户对不同类型的数据可以有不同范围。

可配置的数据类型固定为：

```text
profile
presence
report
```

系统 / 管理类数据（角色、权限、审计等）不进入按范围配置，只由功能权限控制。

内置数据范围：

```text
self
department
department_tree
company
custom
```

业务查询必须在 service/repository 层应用数据范围，不得只在前端过滤。

一个用户有多个 active 角色时，对每个数据类型独立取最宽范围：

```text
company > department_tree > department > self
```

不同数据类型互不影响。某类型缺失或为空数组时按 `self` 处理；`custom` 为预留值，仅有
`custom` 且无有效范围时安全降级为 `self`，并标记 `degradedFromCustom=true`。

数据范围既治理"读过滤"也治理"写授权"。自 M8 起，`profile` 数据范围用于档案写授权：

- 本人改本人档案（`self`）：登录态即可写自身受限字段子集（`name` / `title` / `mobile` / `email`），不得借此修改部门、状态、角色等管理字段。
- 管理改他人档案（按范围）：须持操作权限（`platform:employee:manage`）且目标员工落在操作者的 `profile` 写范围（`self` / `department` / `department_tree` / `company`）内，逐目标校验；越权按不存在处理。
- 所有档案写收口到单一 service 方法，未来审核关 / 自助注册 / 批量导入复用同一写授权判定。
- 跨模块消费同一数据范围谓词时，必须经 `@work/platform-contract` 的
  `PLATFORM_SCOPE_SERVICE` / `PlatformScopePort.matchesScope(subject, scope)`；`subject`
  只包含 id、enterpriseId、departmentId 等授权所需最小字段。forms 的
  `profile.employee` 记录读写用该谓词套用 `profile` 范围；presence 按人读端点先通过
  platform employee lookup 读取 subject 实时部门，再用该谓词套用 `presence` 范围。既有
  `presence/board` 看板仍按在位记录的部门快照过滤，待 M9 在位 v2 统一。

近况记录的批量写授权沿用同一 `profile` 写范围规则，逐 subject 校验（见 M8-4）。

M8-6 退出时仍保留一项多租户启用前必修的 High follow-up：员工
`PUT /employees/:id/status` 与 `PUT /employees/:id/password` 的目标员工查询尚未统一按认证租户
复核。当前单租户部署没有现实跨租户攻击面；启用多租户前必须在专门安全切片中补齐
enterpriseId 约束、404 防存在性泄露、失败审计与 memory/PostgreSQL/e2e 双实现验证。
`POST /employees` 是否进一步受 `profile` 写范围约束为同切片的 Minor 语义决策。

## 6. 审计基线

以下操作必须记录审计日志：

- 登录成功。
- 登录失败。
- 修改密码。
- 创建/禁用员工。
- 分配角色。
- 创建/修改角色。
- 修改权限绑定。
- 创建/修改部门。
- 审批通过/驳回。
- 在位状态变更。
- 日/周报提交、退回。
- 系统配置变更。

审计日志至少包含：

```text
id
actor_user_id
actor_account
action
resource_type
resource_id
trace_id
ip
user_agent
result
created_at
metadata
```

审计日志不得包含：

- 明文密码。
- 明文 token。
- 过大的请求体。
- 敏感密钥。

## 7. 输入校验与输出基线

所有 request body 必须：

- 使用 DTO。
- 经过统一校验。
- 拒绝未知字段。
- 对枚举值做白名单校验。

所有错误输出必须：

- 使用统一错误格式。
- 包含 trace id。
- 不泄漏内部异常栈。

所有列表接口必须考虑：

- 分页。
- 最大 page size。
- 数据范围过滤。

## 8. 数据库安全

要求：

- 应用使用最小权限数据库账号。
- 迁移账号和运行账号可分离时应分离。
- 生产数据库禁止自动同步 schema。
- 所有 schema 变更通过迁移。
- 敏感字段不进入普通日志。
- 备份文件按敏感数据处理。

约束：

- 业务模块不得直接写 `platform` schema。
- 业务模块不得跨 schema 随意 join。
- 数据库唯一约束必须与业务唯一规则一致。

### 8.1 文件上传与私有读取基线

M6 Files 本地磁盘 provider 属安全敏感面，必须满足：

- 租户边界只从认证 actor context 派生；repository 所有文件对象和引用读写必须带 `enterprise_id`。
- 跨租户 fileId、未知 fileId、已删除 fileId 一律按不存在处理，不返回 403 泄露存在性。
- 文件名只用于展示，不参与物理路径；storage key 由服务端生成，读写前必须解析绝对路径并确认仍在配置 root 下。
- 文件大小、MIME、扩展名、magic-byte、原始文件名长度全部在 service/provider 层做硬上限和白名单校验。
- staged 文件必须有 `staged_expires_at`，绑定时 owner-bound，只允许当前上传者同租户 staged fileId。
- attach 与 cleanup 必须用原子 claim 状态迁移；M6 单引用模型不允许同一文件复用到不同业务记录。
- staged TTL 清理、租户 / 用户配额、上传限流、磁盘阈值拒绝和告警不得延后；`staged | attached | deleting` 均计入配额。
- 不开放匿名下载或通用 UUID 内容下载；内容读取只能经 `FILE_STORAGE_SERVICE.openFile` 交给有业务授权语义的模块代理。
  `openFile` 必须接收业务引用上下文（`ownerModule` / `referenceType` / `referenceId`）并只允许读取
  已绑定到该引用的 `attached` 文件；不得按同租户裸 `fileId` 打开 staged、deleting 或他人业务引用的内容。
- 错误、日志、审计不得输出磁盘绝对路径、文件内容、完整请求体或跨租户命中对象 metadata。
- PostgreSQL metadata 与本地文件 volume 必须协调备份恢复，备份按敏感数据保护，并做 metadata-volume 完整性检查。

### 8.2 进程内平台只读端口基线

通知等内嵌共享模块如需解析组织或角色接收人，只能通过 `@work/platform-contract` 暴露的进程内只读端口调用
platform-api。M7-2 当前端口为 `PLATFORM_ORG_PORT`：

- 调用方必须传入来自认证上下文或可信领域事件 payload 的 `enterpriseId`，platform 实现每次查询都校验企业边界。
- 端口只返回 user id 等最小标识，不返回姓名、手机号、邮箱、账号、角色详情等档案或敏感字段。
- 端口不得开放公开 HTTP 路由；业务模块不得直接读 `platform.*` schema 或跨 schema join。
- 跨企业、不存在、禁用员工 / 部门 / 角色等情况按空结果处理，避免接收人解析泄露对象存在性。

### 8.3 通知 SSE 推送基线

通知 SSE 端点 `GET /api/notification/stream` 沿用 gateway 全局 `PlatformAuthGuard`，不得标记 `@Public`，
也不得接受客户端传入的 `recipientUserId`。连接身份只能来自 `request.currentUser.id`，推送帧只包含
`notification.created` 等最小信号，不下发通知正文、未读数或其它用户数据；REST API 仍是通知列表和未读数事实源。
当前连接注册表是进程内单实例能力，多副本 fan-out 需另行引入共享 pub/sub 后才能启用。

## 9. Redis 安全

Redis 首期用于 session/cache/stream 时必须：

- 不暴露公网。
- 设置访问控制或部署在隔离网络。
- 不存储明文密码。
- token 只存 hash 或短期不可逆标识。
- 设置合理 TTL。

## 10. IM 安全

OpenIM 只能作为 IM Provider。

要求：

- 平台账号仍由 Platform Core 管理。
- OpenIM token 和密钥由 im-adapter-api 管理。
- 业务模块不得直接调用 OpenIM。
- Webhook 必须校验签名或共享密钥。
- OpenIM 客户端 SDK 引入前必须完成许可证和数据流审查。

## 11. 配置与密钥

配置来源：

- `.env`。
- Docker secret。
- 企业内部配置中心，后续可选。

禁止：

- 密钥提交到 Git。
- 在日志打印完整连接串。
- 使用生产默认密钥。

必须配置：

```text
DATABASE_URL
SESSION_SECRET 或 TOKEN_SECRET
PLATFORM_BOOTSTRAP_ADMIN_ACCOUNT
PLATFORM_BOOTSTRAP_ADMIN_PASSWORD
```

生产环境缺少关键密钥时应启动失败。

token/session 密钥要求：

- 生产环境密钥必须来自环境变量、Docker secret 或企业内部配置中心。
- 密钥不得使用仓库示例值、默认值或短随机值。
- 密钥轮换必须支持过渡期：新 token 用新密钥签发或派生，旧 token 在短 TTL 内可校验或被集中吊销。
- 密钥轮换、吊销和异常登录必须记录审计日志。

## 12. 内网部署安全

内网部署必须保证：

- 镜像来源可追溯。
- 离线包有版本号。
- 数据库迁移脚本随版本发布。
- 升级前可备份。
- 可回滚到上一个版本。
- Nginx/gateway 不暴露不必要端口。
- 管理接口仅限内网授权访问。

TLS/HTTPS 要求：

- 生产内网部署必须通过 gateway/Nginx 终止 HTTPS。
- 证书可来自企业 CA 或自签 CA，但客户端和浏览器信任链必须在交付文档中说明。
- HTTP 明文访问只允许本地开发或受控部署验证，不得作为正式生产入口。

Windows 7 Web UI 兼容不降低后端安全策略。

数据库连接池要求：

- 每个 API 服务必须显式配置连接池上限。
- 低配单机内网部署默认从 5-10 个连接起步，按压测和 PostgreSQL `max_connections` 调整。
- 新增 API 服务或后台任务时必须评估连接数叠加影响。

## 13. 日志安全

日志必须包含：

- trace id。
- action。
- status。
- duration。

日志不得包含：

- password。
- access token。
- refresh token。
- session id 明文。
- 完整身份证号等敏感个人信息，后续如涉及。

## 14. 测试要求

安全相关测试至少覆盖：

- 未登录访问受保护 API 返回 401。
- 非 Bearer token 返回 401。
- 未知 token 返回 401。
- 无权限返回 403。
- 非法 request body 返回 400。
- 普通用户不能访问管理 API。
- 密码错误不能登录。
- 禁用用户不能登录。
- token 过期不能访问。

M1 之后新增：

- 密码 hash 不能明文比对。
- session 数据库只保存 token hash。
- seed 不覆盖已存在管理员密码。

## 15. 当前风险

| 风险                    | 当前状态                                                  | 处理                                                                          |
| ----------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 内存 store              | 仍在使用                                                  | M1 替换为 PostgreSQL                                                          |
| 开发默认密码            | `admin/admin123`                                          | M1 改为安装初始化                                                             |
| 明文密码                | M1 已引入 `scrypt` 强 hash，argon2id 为后续迁移目标       | M1 退出前确认生产路径无明文密码                                               |
| session 内存存储        | PostgreSQL 模式已写入 `platform.sessions`                 | M1 退出前将内存 session 降级为测试专用                                        |
| 审计日志未闭环          | 未完成                                                    | M2 完成审计 service                                                           |
| 菜单权限未闭环          | 未完成                                                    | M2 完成菜单与权限注册                                                         |
| lockfile 缺失           | 已生成 `pnpm-lock.yaml`，CI 已切换 frozen lockfile        | M1 退出前保持 lockfile 与依赖声明同步                                         |
| 登录失败审计 + 锁定策略 | M3.5-C 已实装 5 次失败锁定 15 分钟、所有失败/锁定写入审计 | 完成于 M3.5-C，详见 verification-log `M3.5-C Login Failure Audit and Lockout` |

## 16. 变更门禁

以下变更必须先更新本文档或相关 ADR/RFC：

- 修改密码策略。
- 引入 refresh token。
- 引入外部身份源。
- 调整权限模型。
- 调整数据范围模型。
- 变更 token/session 存储方式。
- 引入 OpenIM SDK 到客户端。
- 新增敏感数据字段。
