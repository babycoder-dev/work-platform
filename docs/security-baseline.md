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
- notification-api。
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
```

生产环境建议：

```text
minLength: 10
requireNumber: true
requireUppercase: true
requireSpecialChar: false
maxFailedAttempts: 5
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

内置数据范围：

```text
self
department
department_tree
company
custom
```

业务查询必须在 service/repository 层应用数据范围，不得只在前端过滤。

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

| 风险 | 当前状态 | 处理 |
| --- | --- | --- |
| 内存 store | 仍在使用 | M1 替换为 PostgreSQL |
| 开发默认密码 | `admin/admin123` | M1 改为安装初始化 |
| 明文密码 | M1 已引入 `scrypt` 强 hash，argon2id 为后续迁移目标 | M1 退出前确认生产路径无明文密码 |
| session 内存存储 | PostgreSQL 模式已写入 `platform.sessions` | M1 退出前将内存 session 降级为测试专用 |
| 审计日志未闭环 | 未完成 | M2 完成审计 service |
| 菜单权限未闭环 | 未完成 | M2 完成菜单与权限注册 |
| lockfile 缺失 | 已生成 `pnpm-lock.yaml`，CI 已切换 frozen lockfile | M1 退出前保持 lockfile 与依赖声明同步 |

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
