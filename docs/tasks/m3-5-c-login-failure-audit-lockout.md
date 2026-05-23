# Task: M3.5-C 登录失败审计 + 锁定策略落地

## 状态

Ready for execution

## 0. 任务定位

本切片属于 **M3.5 收口** 阶段，紧接已完成的 M3.5-B2。

这是 M3.5 阶段**第一个真正动代码**的切片。前面 A/B/B2 都是纯文档。本切片实装登录失败计数、自动锁定、登录失败审计三条 security-baseline 已经承诺但代码没兑现的能力。

**schema 不动**：`platform.local_identities` 表早在 M1 就预留了 `failed_attempts` / `locked_until` / `last_login_at` 字段（见 `apps/platform-api/src/db/migrations/0000_init_platform.sql` 第 62-73 行），本切片只让 service 和 repository 真正读写这些字段。**不需要新增迁移。**

**决策已锁定**（不要重新讨论）：
- 锁定阈值：5 次连续密码错误（已经是 security-baseline §3.4 默认值）。
- 锁定时长：固定 15 分钟。
- 锁定到期：下一次失败从 1 重新计数，不累计。
- 登录成功：`failed_attempts` 重置为 0，`locked_until` 清空，`last_login_at` 更新。
- 锁定时的错误响应：明确告知"账号已被锁定，请 N 分钟后重试"（含剩余分钟数）；为此 security-baseline §3.2 加一条例外条款。
- 账号不存在 / 禁用员工：仍统一返回"账号或密码错误"，不可探测。

## 1. 背景

`security-baseline.md` §3.2、§3.4 早就写明"支持失败次数和锁定策略"、`maxFailedAttempts: 5`、"记录登录成功/失败审计"；schema 也早就预留了字段。但 `apps/platform-api/src/auth/auth.service.ts` 当前的 `login()` 只做了：

- 调用 `repository.validatePassword(account, password)`（内部用 scrypt 验签）。
- 失败统一抛 `UnauthorizedException('账号或密码错误')`。
- 成功才写 `auth.login` audit 一次（`result: 'success'`）。

**当前漏洞**：
1. 登录失败 0 审计——`security-baseline.md` §6 审计基线明确要求"登录失败"必须审计。
2. `failed_attempts` 字段永远是 0，`locked_until` 永远是 NULL，锁定逻辑形同虚设。
3. 不限速的密码爆破窗口完全敞开。

本切片闭合这条链路。

## 2. 必读

按顺序：

1. `AGENTS.md`
2. `docs/doc-index.md`（§1 文档优先级、§5 文档审查规则）
3. `docs/constitution.md` §10（统一错误格式）
4. `docs/security-baseline.md` §3.2 登录、§3.4 密码策略、§6 审计基线、§15 当前风险——四处都要改
5. `docs/platform-core.md` §3 认证与权限运行时约定、§7 审计——本切片要补段
6. `docs/rfc/m1-platform-core-persistence.md` §8.4「本地身份」——确认字段语义
7. `apps/platform-api/src/db/migrations/0000_init_platform.sql` 第 62-73 行（`platform.local_identities` 表结构，只读，不改）
8. `apps/platform-api/src/auth/auth.service.ts`（当前 login 实现，本切片要重写）
9. `apps/platform-api/src/auth/auth.service.spec.ts`（现有用例，本切片要扩充）
10. `apps/platform-api/src/repositories/platform.repository.ts`（接口，要扩展）
11. `apps/platform-api/src/repositories/postgres-platform.repository.ts`（PostgreSQL 实现）
12. `apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts`（集成测试，要扩充）
13. `apps/platform-api/src/store/platform-memory.store.ts`（内存实现）
14. `apps/platform-api/src/store/platform-memory.store.spec.ts`
15. `apps/platform-api/src/security/secret-hash.ts`（已有 `verifyPassword`，service 直接复用）
16. `apps/platform-api/src/platform-api.e2e-spec.ts`、`platform-api.postgres.e2e-spec.ts`（要加锁定相关用例）
17. `packages/platform-contract/src/auth.ts`（`PasswordPolicyDto`，加字段）
18. `docs/foundation-progress.md` §6、§6.1（要更新的进度段落）
19. `docs/verification-log.md` 顶部（日期去重判断）

## 3. 设计要点（务必严格执行）

### 3.1 锁定策略常量

在 `auth.service.ts` 内定义：

```ts
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
```

不要从环境变量读，不要做成可配置，本切片就是落实默认策略。后续如要可配置，单独切片处理。

### 3.2 Repository 接口扩展

`PlatformRepository` 的 `validatePassword(account, password)` 方法删除——service 改为自己取 identity 再用 `verifyPassword`。改成下面两个低层方法：

```ts
// platform.repository.ts 新增
export interface LocalIdentitySecurityState {
  userId: string;
  account: string;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil?: string;        // ISO 8601；未锁定时为 undefined
  mustChangePassword: boolean;
}

export interface UpdateLocalIdentitySecurityStateInput {
  failedAttempts: number;       // 新值（绝对值，不是增量）
  lockedUntil: string | null;   // ISO 或 null（清锁）
  lastLoginAt?: string;         // 可选，仅成功时传
}

export interface PlatformRepository {
  // 删除 validatePassword
  // 新增：
  findLocalIdentityByAccount(account: string): Promise<LocalIdentitySecurityState | undefined>;
  updateLocalIdentitySecurityState(
    userId: string,
    input: UpdateLocalIdentitySecurityStateInput,
  ): Promise<void>;
  // ... 其它现有方法保持不变 ...
}
```

理由：把"取 identity 状态"和"写 identity 状态"分离，业务策略（阈值、时长、复位时机）全部留给 service。Repository 不感知锁定策略。

### 3.3 错误响应

| 场景 | HTTP | 响应 message |
|---|---|---|
| 账号不存在 | 401 | `账号或密码错误` |
| 禁用/离职员工 | 401 | `账号或密码错误`（不可探测员工状态） |
| 密码错（未锁定） | 401 | `账号或密码错误` |
| 密码错且第 5 次触发锁定 | 401 | `账号已被锁定，请 15 分钟后重试` |
| 锁定期内任何尝试 | 401 | `账号已被锁定，请 N 分钟后重试`（N = `Math.ceil((lockedUntil - now) / 60000)`，至少 1） |

实现方式：service 直接 `throw new UnauthorizedException(message)`，不引入新的 exception 类、不改 `nest-common` 的 api-exception-filter。`code` 字段保持 `HTTP_401`；message 文案区分两种状态。

### 3.4 审计 action 与 metadata

所有登录尝试都写 `platform.audit_logs`，沿用现有 `action: 'auth.login'` + `resourceType: 'platform.session'`，区分 `result`：

| 场景 | result | metadata |
|---|---|---|
| 成功 | `'success'` | `{ account }`（已有，不变） |
| 账号不存在 | **不写审计**——不要给攻击者用审计表枚举账号的能力 |
| 锁定期内尝试 | `'failure'` | `{ reason: 'account_locked', remainingMinutes }` |
| 禁用员工尝试 | `'failure'` | `{ reason: 'employee_inactive' }` |
| 密码错（未触发锁定） | `'failure'` | `{ reason: 'wrong_password', failedAttempts, locked: false }` |
| 密码错且本次触发锁定 | `'failure'` | `{ reason: 'wrong_password', failedAttempts: 5, locked: true }` |

审计上下文（`traceId` / `ip` / `userAgent`）由 controller 透传，service 写入。

### 3.5 AuthService.login 重写流程

按下面的顺序实现（不要乱序）：

1. `const identity = await repo.findLocalIdentityByAccount(input.account)`。
   - 若 `identity` 为 undefined → throw `UnauthorizedException('账号或密码错误')`。**不写审计。**
2. 计算 `now = Date.now()`；若 `identity.lockedUntil` 存在且 `Date.parse(identity.lockedUntil) > now`：
   - 计算 `remainingMinutes = Math.max(1, Math.ceil((Date.parse(identity.lockedUntil) - now) / 60000))`。
   - 写 audit（`reason: 'account_locked', remainingMinutes`）。
   - throw `UnauthorizedException('账号已被锁定，请 ${remainingMinutes} 分钟后重试')`。
3. `const employee = await repo.findEmployeeById(identity.userId)`；若 employee 不存在或 `status !== 'active'`：
   - 写 audit（`reason: 'employee_inactive'`）。
   - throw `UnauthorizedException('账号或密码错误')`。
4. `verifyPassword(input.password, identity.passwordHash)`：
   - 若返回 false：
     - **过期锁定 base 处理**：先判断 `const isLockExpired = identity.lockedUntil !== undefined && Date.parse(identity.lockedUntil) <= now`。若过期锁定，`baseFailedAttempts = 0`；否则 `baseFailedAttempts = identity.failedAttempts`。
     - `nextFailedAttempts = baseFailedAttempts + 1`。
     - `willLock = nextFailedAttempts >= MAX_FAILED_ATTEMPTS`。
     - `newLockedUntil = willLock ? new Date(now + LOCK_DURATION_MS).toISOString() : null`。
     - `await repo.updateLocalIdentitySecurityState(identity.userId, { failedAttempts: nextFailedAttempts, lockedUntil: newLockedUntil })`。
     - 写 audit（`reason: 'wrong_password', failedAttempts: nextFailedAttempts, locked: willLock`）。
     - 若 `willLock` → throw `UnauthorizedException('账号已被锁定，请 15 分钟后重试')`；否则 → throw `UnauthorizedException('账号或密码错误')`。
   - **关键不变量**：用户被锁过一次后,锁定到期再次失败,counter 从 1 重新计数,不累计旧失败数（§0 "锁定到期下一次失败从 1 重新计数" 的精确语义）。
5. 密码正确：
   - `await repo.updateLocalIdentitySecurityState(identity.userId, { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(now).toISOString() })`。
   - 创建 access session（沿用现有逻辑）。
   - 写成功 audit（`result: 'success', metadata: { account }`，沿用现有逻辑）。
   - 返回 `LoginResult`。

**严格顺序**：锁定检查必须在密码校验**之前**——锁定期内连密码 hash 都不算（避免被锁的账号还在消耗服务端 CPU）。

### 3.6 PasswordPolicyDto 与 getPasswordPolicy

`packages/platform-contract/src/auth.ts` 的 `PasswordPolicyDto` 加一个字段：

```ts
export interface PasswordPolicyDto {
  minLength: number;
  requireNumber: boolean;
  requireUppercase: boolean;
  requireSpecialChar: boolean;
  maxFailedAttempts: number;
  lockDurationMinutes: number;   // 新增
  expireDays?: number;
}
```

`auth.service.ts` 的 `getPasswordPolicy()` 返回值加 `lockDurationMinutes: 15`。

## 4. 文件清单与具体改动

> 本切片不引入新文件，全部为 modified。具体代码细节由 Codex 按 §3 设计要点实现；本节给出每个文件**改什么、改到什么程度**，并对关键代码片段给出最终签名/骨架。

### 4.1 `apps/platform-api/src/repositories/platform.repository.ts`

- 删除 `validatePassword(account: string, password: string): Promise<EmployeeDto | undefined>` 方法。
- 新增 `LocalIdentitySecurityState` 与 `UpdateLocalIdentitySecurityStateInput` 接口（按 §3.2 给出的形状）。
- 在 `PlatformRepository` 接口里新增 `findLocalIdentityByAccount` 与 `updateLocalIdentitySecurityState` 两个方法。
- 不动其它方法。

### 4.2 `apps/platform-api/src/repositories/postgres-platform.repository.ts`

- 删除 `validatePassword` 实现。
- 新增 `findLocalIdentityByAccount`：从 `platform.local_identities li JOIN platform.employees e ON e.id = li.user_id` 取出 `user_id, account, password_hash, failed_attempts, locked_until, must_change_password`，WHERE `li.account = $1 AND e.deleted_at IS NULL`。`locked_until` 是 `Date | null`，映射时 null → undefined、Date → `.toISOString()`。
- 新增 `updateLocalIdentitySecurityState`：`UPDATE platform.local_identities SET failed_attempts = $2, locked_until = $3, last_login_at = COALESCE($4, last_login_at), updated_at = now() WHERE user_id = $1`。`$3` 接受 ISO 字符串或 null。`$4` 传入则更新 `last_login_at`，否则保持原值。
- mapPostgresError 失败仍走现有错误映射。
- 不动其它方法。

### 4.3 `apps/platform-api/src/store/platform-memory.store.ts`

**重要前置事实**：当前 memory store 用**明文密码**做登录校验（第 26 行 `password: string`、第 128 行 `identity.password !== password`、seed 处 `password: 'admin123'`），且字段命名 `lockedAt` 与 SQL schema 的 `locked_until` 不一致。本切片必须把 memory store 拉齐到与 PostgreSQL 实现等价的语义,否则 §3.5 第 4 步的 `verifyPassword(input.password, identity.passwordHash)` 在 memory 模式下会永远返回 false（明文 "admin123" 无法被解析为 scrypt hash 串）,所有 memory E2E 将全部失败。

具体改动：

1. **重写 `LocalIdentity` 接口**（约第 23-29 行），与 PostgreSQL `LocalIdentitySecurityState` 字段对齐：

   ```ts
   interface LocalIdentity {
     userId: string;
     account: string;
     passwordHash: string;        // 由 hashPassword 生成的 scrypt 串，不是明文
     failedAttempts: number;
     lockedUntil?: string;        // ISO 8601；未锁定时 undefined（**重命名自 lockedAt**）
     lastLoginAt?: string;
     mustChangePassword: boolean;
   }
   ```

   注意：`password` 字段**改名**为 `passwordHash`；`lockedAt` 字段**改名**为 `lockedUntil`。不要保留旧名作为别名。

2. **seed 初始化时真做 hash**：在 `this.seed()` 中创建 admin identity 时，import `hashPassword` from `../security/secret-hash`，把 `passwordHash` 设为 `hashPassword('admin123')`。`failedAttempts: 0`、`lockedUntil` 与 `lastLoginAt` 留空（undefined）、`mustChangePassword: true`。

3. **`createEmployee` 写入 local identity 时**：当前实现（约第 106 行）用 `password: input.initialPassword`，**改为** `passwordHash: hashPassword(input.initialPassword)`。

4. **删除 `validatePassword` 实现**。

5. **新增 `findLocalIdentityByAccount`**：遍历 `identities` Map 找到 `it.account === account` 的项，返回 `LocalIdentitySecurityState`（结构与 `LocalIdentity` 内部表示一致，原样返回即可）。

6. **新增 `updateLocalIdentitySecurityState`**：在 Map 中找 userId 对应的 identity，更新 `failedAttempts` / `lockedUntil` / `lastLoginAt` 三个字段（`lockedUntil: null` 入参时改为 `identity.lockedUntil = undefined`；`lastLoginAt` 入参 undefined 时保持原值不变）。

7. **不动其它方法**。

> 改完后 service 在 memory 模式下走的是与 PostgreSQL 模式相同的 hash 校验链路，memory E2E 行为与 PostgreSQL E2E 等价。这也是为什么任务包没有列出 secret-hash.ts 作为不变约束的例外——memory store 依然不修改 `verifyPassword`，但必须让 hash/明文不再混存。

### 4.4 `apps/platform-api/src/auth/auth.service.ts`

按 §3.1 加常量、§3.5 重写 `login()` 方法。

关键约束：
- `verifyPassword` 从 `../security/secret-hash` import。
- 审计写入必须包含完整 `auditContext`（`traceId` / `ip` / `userAgent`）。
- `getPasswordPolicy()` 返回值加 `lockDurationMinutes: 15`。
- `authenticateAccessToken` 和 `toCurrentUser` 不动。
- 不引入新的 exception 类。

### 4.5 `packages/platform-contract/src/auth.ts`

`PasswordPolicyDto` 加 `lockDurationMinutes: number` 字段（按 §3.6）。位置：在 `maxFailedAttempts` 之后、`expireDays` 之前。其它接口不动。

### 4.6 `apps/platform-api/src/auth/auth.service.spec.ts`

扩充用例，覆盖：

1. **成功登录重置计数**：identity 初始 `failedAttempts=2`，密码正确 → 调用 `updateLocalIdentitySecurityState` 时 `failedAttempts: 0, lockedUntil: null, lastLoginAt: <iso>`。
2. **密码错 1 次**：identity 初始 `failedAttempts=0` → 抛 401 `账号或密码错误`，update 调用 `{ failedAttempts: 1, lockedUntil: null }`，audit metadata `{ reason: 'wrong_password', failedAttempts: 1, locked: false }`。
3. **密码错触发锁定**：identity 初始 `failedAttempts=4` → 抛 401 `账号已被锁定，请 15 分钟后重试`，update `{ failedAttempts: 5, lockedUntil: <iso ~15min later> }`，audit `{ reason: 'wrong_password', failedAttempts: 5, locked: true }`。
4. **锁定期内尝试**：identity `lockedUntil` 设为 now+10min，无论密码对错 → 抛 401 `账号已被锁定，请 10 分钟后重试`，**不调用 verifyPassword**，**不调用 updateLocalIdentitySecurityState**，audit `{ reason: 'account_locked', remainingMinutes: 10 }`。
5. **锁定到期后失败重新计数**：identity 初始 `lockedUntil = now - 1min, failedAttempts = 5`（过期锁定状态），密码错 → update **必须**用 `{ failedAttempts: 1, lockedUntil: null }`（counter 从 1 重新计数,**不**是 6），audit metadata `{ reason: 'wrong_password', failedAttempts: 1, locked: false }`。这是 §3.5 第 4 步"过期锁定 base=0"分支的关键测试用例,必须断言 `failedAttempts === 1`。
6. **账号不存在**：`findLocalIdentityByAccount` 返回 undefined → 抛 401 `账号或密码错误`，**不写审计**，**不调用 update**。
7. **禁用员工**：`employee.status === 'disabled'` → 抛 401 `账号或密码错误`，写 audit `{ reason: 'employee_inactive' }`，**不调用 update**。
8. **getPasswordPolicy 返回 lockDurationMinutes: 15**。

测试用 vitest mock repository。所有断言要精确（参数对象用 `expect.objectContaining` 时仍要列出所有期望键）。

### 4.7 `apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts`

加用例（`RUN_POSTGRES_INTEGRATION=true` 时跑）：

1. `findLocalIdentityByAccount`：seed 后查 admin，返回字段齐全，`failedAttempts === 0`，`lockedUntil === undefined`。
2. `updateLocalIdentitySecurityState`：写入 `{ failedAttempts: 3, lockedUntil: '<iso>', lastLoginAt: '<iso>' }`，再次 `findLocalIdentityByAccount` 取出来，三个字段都对得上。
3. `updateLocalIdentitySecurityState` 把 `lockedUntil: null` 传入应清除锁定。

### 4.8 `apps/platform-api/src/store/platform-memory.store.spec.ts`

如果当前 spec 已覆盖 `validatePassword`，把对应用例改写成调用 `findLocalIdentityByAccount` + `verifyPassword`。补一两个用例覆盖 `updateLocalIdentitySecurityState`。

### 4.9 `apps/platform-api/src/platform-api.e2e-spec.ts`（内存 E2E）

加 describe 区块 `auth.login lockout`，覆盖：

1. 5 次连续错误密码后，第 5 次响应 message 含"账号已被锁定"。
2. 锁定后立即用**正确**密码尝试，仍 401 锁定 message。
3. 锁定后 audit_logs（通过 `memoryStore.auditLogs` 数组）含 5 条 `auth.login` failure + 0 条 success，最后一条 metadata `locked: true`。

### 4.10 `apps/platform-api/src/platform-api.postgres.e2e-spec.ts`（PostgreSQL E2E）

加同样的锁定场景。用例运行前需要 reset admin 的 `failed_attempts` / `locked_until`（直接 SQL update 或新建测试用员工）。建议方案：在 `beforeEach`（或本 describe 的 `beforeAll`）创建一个**专用测试员工**（`account: 'lockout-test-${ts}'`），整个锁定测试在它身上做，避免污染 admin。

### 4.11 `docs/security-baseline.md` 改 3 处

**改动点 1**——§3.2 "登录" 节末尾追加例外条款。

下面【原文】与【改为】两块最外层的 4 反引号都是任务包外壳，**不计入 old_string / new_string**；块内的 ```text 三反引号才是 `security-baseline.md` 的真实内容，必须保留。

【原文】：

````text
登录失败响应不得区分“账号不存在”和“密码错误”。

统一返回：

```text
账号或密码错误
```
````

【改为】：

````text
登录失败响应不得区分“账号不存在”和“密码错误”。

统一返回：

```text
账号或密码错误
```

**例外**：账号触发锁定阈值或处于锁定期内时，响应必须明确告知"账号已被锁定，请 N 分钟后重试"（含剩余分钟数）。理由：本系统默认企业内网部署、面向已知用户群体，"账号是否存在"已不构成核心信息泄露（用户在登录页已输入账号）；反之，不告知锁定会让用户反复重试，徒增 platform-api 负载和审计噪音。
````

**改动点 2**——§3.4 默认策略与生产策略两个 code block 各加一行 `lockDurationMinutes: 15`。**拆成两个独立 Edit**（2a/2b），不要合并。每个 old_string 取 code block 内 5 行内容（不含围栏），内容里无三反引号,可直接精确匹配。

**改动点 2a**——§3.4 默认策略 code block。

【原文】：

```text
minLength: 8
requireNumber: true
requireUppercase: false
requireSpecialChar: false
maxFailedAttempts: 5
```

【改为】：

```text
minLength: 8
requireNumber: true
requireUppercase: false
requireSpecialChar: false
maxFailedAttempts: 5
lockDurationMinutes: 15
```

**改动点 2b**——§3.4 生产环境建议 code block。

【原文】：

```text
minLength: 10
requireNumber: true
requireUppercase: true
requireSpecialChar: false
maxFailedAttempts: 5
```

【改为】：

```text
minLength: 10
requireNumber: true
requireUppercase: true
requireSpecialChar: false
maxFailedAttempts: 5
lockDurationMinutes: 15
```

> 2a 与 2b 的 old_string 之间差异在 `minLength` 和 `requireUppercase` 上，各自在 security-baseline.md 中唯一匹配,不会串扰。

**改动点 3**——§15 当前风险表加一行（在 `lockfile 缺失` 行之后、`## 16. 变更门禁` 标题之前）。

【原文】：

```text
| lockfile 缺失 | 已生成 `pnpm-lock.yaml`，CI 已切换 frozen lockfile | M1 退出前保持 lockfile 与依赖声明同步 |

## 16. 变更门禁
```

【改为】：

```text
| lockfile 缺失 | 已生成 `pnpm-lock.yaml`，CI 已切换 frozen lockfile | M1 退出前保持 lockfile 与依赖声明同步 |
| 登录失败审计 + 锁定策略 | M3.5-C 已实装 5 次失败锁定 15 分钟、所有失败/锁定写入审计 | 完成于 M3.5-C，详见 verification-log `M3.5-C Login Failure Audit and Lockout` |

## 16. 变更门禁
```

### 4.12 `docs/platform-core.md` 改 1 处

本改动是**纯插入**：不删除、不修改任何现有行，只在第 3 节末尾插入一个新小节。

定位 `## 4. 种子账号` 这一行——它是 `platform-core.md` 中唯一的 `## 4.` 标题。在它之前插入下面这段新内容，新内容与 `## 4. 种子账号` 之间保留一个空行。

> M3.5-B2 已在 `## 4. 种子账号` 之前插入过 `## 3.1 introspection 与跨进程认证` 小节；本切片的 `## 3.2` 插入在 §3.1 之后、`## 4. 种子账号` 之前。Codex 使用 Edit 时锚点取 `## 4. 种子账号`（不要锚 §3.1，§3.1 内容含行内反引号易出错）。

要插入的内容（外层 4 反引号是任务包外壳，**不写入文件**）：

````markdown
## 3.2 登录失败审计与账号锁定

`POST /api/platform/auth/login` 的失败语义：

- 密码错误时累加 `platform.local_identities.failed_attempts`；连续失败达到 5 次时设置 `locked_until = now() + 15 分钟`，账号进入锁定状态。
- 锁定期内任何登录尝试直接返回 401 "账号已被锁定，请 N 分钟后重试"，不验证密码、不消耗服务端密码 hash 计算。
- 锁定到期视为已过，下一次失败时计数从 1 重新开始（即"过期锁定不累计旧失败数"）。
- 登录成功时 `failed_attempts` 重置为 0、`locked_until` 清空、`last_login_at` 更新。
- 所有登录尝试（成功 / 密码错 / 锁定期内尝试 / 禁用员工尝试）都写入 `platform.audit_logs`，`action: 'auth.login'`，`result: 'success' | 'failure'`，`metadata` 含 `reason` 与 `failedAttempts` 等上下文。**账号不存在不写审计**（防止审计表被用于账号枚举）。
- 锁定参数（5 次 / 15 分钟）由 `getPasswordPolicy()` 暴露给前端，前端可在登录界面提示用户。
````

## 5. 必须保持不变（避免越界）

- 数据库迁移文件 `0000_init_platform.sql`——schema 字段已经齐全，不需要任何迁移。
- `platform-auth.guard.ts`、`request-user.ts`、`auth.controller.ts`、`auth.dto.ts`——本切片不动 controller 与 guard。
- `Drizzle schema` 文件 `platform.schema.ts`——已与 SQL migration 对齐，不动。
- `secret-hash.ts`——`verifyPassword` 已有，直接复用，不改实现。
- nest-common 的 `api-exception.filter.ts`、`error-response.ts`——本切片不引入新的 error code，错误响应仍走现有 filter，`code: 'HTTP_401'`。
- 任何其它 `apps/*` 或 `modules/*` 的文件。
- `docs/constitution.md`、`docs/foundation-blueprint.md`、`docs/architecture.md`、`docs/module-contract.md`、现有 ADR 0001-0004——本切片不修改。
- 本切片产出的 git diff 必须**只包含上述清单内的文件**。

## 6. 验证

### 6.1 命令验证

按顺序执行，全部必须通过：

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

> 本切片改了 `PlatformRepository` 接口（删除 `validatePassword`、新增两个方法），所有实现类（PostgreSQL + memory）必须同步实现，否则 typecheck 会失败——这是好事，能挡住漏改。

如果本机有 PostgreSQL：

```powershell
$env:RUN_POSTGRES_INTEGRATION="true"
$env:RUN_POSTGRES_E2E="true"
$env:DATABASE_URL="postgresql://work:work@localhost:5432/work_platform"
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="admin123"
pnpm db:setup
pnpm test:db
pnpm test:e2e:postgres
```

本机起不来 PostgreSQL 时按以前惯例：在交付说明里明说，依赖 CI 兜底，不允许默不作声跳过。

### 6.2 行为断言（重要）

除命令通过外，以下行为断言必须在 verification-log 显式复述：

1. `auth.service.spec.ts` 用例数从现有 6 个增至至少 13 个（含 §4.6 新增的 8 个场景），全部通过。
2. 锁定后再用正确密码尝试，仍返回 401 锁定 message——这是 §3.5 "锁定检查必须在密码校验之前"的关键证据。
3. 锁定到期后再次密码错，`failedAttempts` 应记为 1 而非 6——验证"过期锁定不累计"。
4. 账号不存在时 audit_logs 不增长——验证"账号不存在不写审计"。
5. `getPasswordPolicy()` 返回值含 `lockDurationMinutes: 15`。

## 7. 完成后更新的文档

### 7.1 `docs/foundation-progress.md`

对 `docs/foundation-progress.md` 做一次精确替换：把下面【原文】所覆盖的整块（§6 全文 + §6.1 表）替换为【改为】。`## 7.` 及之后保持不动。

【原文】（`docs/foundation-progress.md` 当前 §6 与 §6.1 的逐字全文）：

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
| M3.5-B2 | ADR-0004 跨进程鉴权（Phantom Token） | Done | 2026-05-23 完成；ADR-0004 确立 Phantom Token、introspection 复用 `/auth/me`；详见 verification-log `M3.5-B2 Phantom Token ADR` |
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
M3.5-D: 首次登录改密 + 管理员重置密码端点
```

上一切片任务包：`docs/tasks/m3-5-c-login-failure-audit-lockout.md`。

M3.5-C 完成结果：

- `apps/platform-api/src/auth/auth.service.ts` 实装登录失败计数、连续 5 次错误密码锁定 15 分钟、锁定期内拒绝、登录成功重置计数。
- `apps/platform-api/src/repositories/platform.repository.ts` 删除 `validatePassword`，新增 `findLocalIdentityByAccount` 与 `updateLocalIdentitySecurityState`；PostgreSQL 与内存两套实现同步更新。
- 所有登录尝试（成功、密码错、锁定期内尝试、禁用员工尝试）写入 `platform.audit_logs`；账号不存在不写审计。
- `docs/security-baseline.md` §3.2 加锁定例外条款、§3.4 加 `lockDurationMinutes: 15`、§15 风险表加完成行。
- `docs/platform-core.md` 第 3 节新增 §3.2 登录失败审计与锁定说明。
- `packages/platform-contract/src/auth.ts` `PasswordPolicyDto` 加 `lockDurationMinutes`。
- verification-log 锚点：`M3.5-C Login Failure Audit and Lockout`。

M3.5 收口切片剩余顺序：

```text
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
| M3.5-B2 | ADR-0004 跨进程鉴权（Phantom Token） | Done | 2026-05-23 完成；ADR-0004 确立 Phantom Token、introspection 复用 `/auth/me`；详见 verification-log `M3.5-B2 Phantom Token ADR` |
| M3.5-C | 登录失败审计 + 锁定策略落地 | Done | YYYY-MM-DD 完成；5 次失败锁定 15 分钟、登录失败审计闭合；详见 verification-log `M3.5-C Login Failure Audit and Lockout` |
| M3.5-D | 首次登录改密 + 管理员重置密码端点 | Pending | M3.5-C 后启动 |
| M3.5-E | Platform 数据范围 resolver | Pending | M3.5-D 后启动 |
| M3.5-F | Shell 引入 react-router-dom@6，路由拆组件 | Pending | M3.5-E 后启动 |
| M3.5-G | 跨 schema 数据访问规则文档化 | Pending | M3.5-F 后启动 |
````

> 【原文】与【改为】两块最外层的 4 反引号围栏是任务包外壳，匹配 old_string、写入 new_string 时都**不含**这对 4 反引号；块内的 ```text 三反引号是 `foundation-progress.md` 的真实内容，必须保留。替换只影响 §6 与 §6.1，`## 7.` 及之后一律不动。若【原文】与当前文件不能逐字匹配，停下回报，不要自行猜测边界。

### 7.2 `docs/verification-log.md`

顶部追加一条记录。**日期标题去重**：若顶部已存在交付当天的 `## YYYY-MM-DD` 标题，在它下面追加 `### M3.5-C Login Failure Audit and Lockout` 小节；只有当顶部日期不是交付当天时才新增 `## YYYY-MM-DD`。

`### M3.5-C Login Failure Audit and Lockout` 小节至少包含：

- **Change set**：列本切片关键改动（repository 接口、service 重写、4 处文档修订、4 套测试新增/扩充、PasswordPolicyDto 加字段）。
- **Verification**：
  - 6 条命令的实际结果（pass / fail / skipped）。
  - `auth.service.spec.ts` 现有用例数 → 新用例数。
  - §6.2 五条行为断言逐条复述（每条给出对应测试用例名或观察结果）。
  - PostgreSQL 路径：本机有则贴 `pnpm test:db` 与 `pnpm test:e2e:postgres` 通过的结果；无则记"依赖 CI 兜底"。
- **Follow-up**：下一切片 `M3.5-D 首次登录改密 + 管理员重置密码端点`。

## 8. 提交规范

按 Conventional Commits 单次提交。使用显式 `git add <files>` 列出文件，**不要**用 `git add -A`。Commit message body 用单行连续段落，不要在句子之间插空行。

包含在本次 commit 内的文件（14 个 modified，0 new）：

modified:
- `apps/platform-api/src/auth/auth.service.ts`
- `apps/platform-api/src/auth/auth.service.spec.ts`
- `apps/platform-api/src/platform-api.e2e-spec.ts`
- `apps/platform-api/src/platform-api.postgres.e2e-spec.ts`
- `apps/platform-api/src/repositories/platform.repository.ts`
- `apps/platform-api/src/repositories/postgres-platform.repository.ts`
- `apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts`
- `apps/platform-api/src/store/platform-memory.store.ts`
- `apps/platform-api/src/store/platform-memory.store.spec.ts`
- `packages/platform-contract/src/auth.ts`
- `docs/security-baseline.md`
- `docs/platform-core.md`
- `docs/foundation-progress.md`
- `docs/verification-log.md`

**不要**包含：
- `docs/tasks/m3-5-c-login-failure-audit-lockout.md`（本任务包，由审查者维护）。
- `pnpm-lock.yaml`（本切片不增删依赖，lockfile 不该变）。
- `.tmp/` 或任何本地缓存。

Commit 模板：

```
feat: enforce login failure audit and 15-minute lockout

Switch AuthService.login from a single repository.validatePassword call to an explicit flow: find identity, check active lockout, verify employee, verify password, then update counters. Five consecutive wrong passwords lock the account for 15 minutes; all attempts (including in-lock attempts and disabled-employee attempts) write platform.audit_logs entries, while non-existent accounts are deliberately not audited. Expose lockDurationMinutes via getPasswordPolicy and sync security-baseline §3.2/§3.4/§15 and platform-core §3.2.
```

## 9. 完成确认

在交付说明里列出：

- `git status --short` 输出（确认只动上述 14 个文件 + 任务包未跟踪）。
- §6.2 五条行为断言逐条结论。
- `auth.service.spec.ts` 用例数从 X 增至 Y。
- commit hash 与 `git show --stat <hash>` 输出。
- 确认 `docs/foundation-progress.md` §6.1 表 `M3.5-C` 行已改为 `Done`，且 §6 下一步已指向 `M3.5-D`。
