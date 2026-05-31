# AI Handoff

本文档用于在 Codex Desktop 的新会话或"项目"上下文中恢复 `E:\Work\work-platform` 的当前工作状态。新会话应以仓库文档和 Git 历史为准，不依赖旧聊天记录。

## 1. 启动读取顺序

新会话开始时先读取：

```text
AGENTS.md
docs/doc-index.md
docs/foundation-progress.md
docs/verification-log.md 顶部
docs/platform-core.md
git log --oneline -8
git status --short
```

如果要执行具体任务包，再按任务包 `§2 必读` 清单完整读取，不要跳过。

## 2. 当前阶段

当前阶段是 M3.5 收口。

已完成到：

```text
M3.5-E: Platform 数据范围 resolver（PlatformScopeService）
```

当前下一步：

```text
M3.5-F: Shell 引入 react-router-dom@6，路由拆组件
```

M3.5 剩余顺序：

```text
M3.5-F  Shell 引入 react-router-dom@6，路由拆组件
M3.5-G  跨 schema 数据访问规则文档化（module-contract.md 增加章节）
```

M3.5 完成后再启动：

```text
M4-1: presence contract、schema、repository
```

## 3. 最新提交

当前最新有效提交：

```text
9c887bd288dcfa6c3bf5f6d36314c946f9101c46
chore: pass scope service mock to direct EmployeeService construction
```

最近关键提交：

```text
9c887bd chore: pass scope service mock to direct EmployeeService construction
507acd7 chore: drop optional indirection from EmployeeService.scopeService
04197aa feat: add platform scope resolver and filter employee list
c6db937 feat: add password change endpoint and admin password reset
c8f6904 feat: enforce login failure audit and 15-minute lockout
0f438df docs: add ADR-0004 for phantom token cross-process auth
e4cf22a docs: add ADR-0003 for gateway boundary
8694089 docs: record m3.5-a manifest verification
```

`507acd7` 是一次有问题的 workaround，已由 `9c887bd` 回修。后续判断 `EmployeeService` 依赖签名时，以 `9c887bd` 后状态为准。

## 4. 当前工作区状态

截至 2026-05-24，预期 `git status --short` 只有两个未跟踪任务包：

```text
?? docs/tasks/m3-5-d-password-change-and-reset.md
?? docs/tasks/m3-5-e-platform-scope-service.md
```

这两个任务包未提交。除非用户明确要求，不要删除、提交或修改它们。

## 5. 已完成能力摘要

M3.5-C：

- 登录失败审计。
- 5 次失败锁定 15 分钟。
- 锁定期内正确密码仍拒绝。
- 账号不存在不写审计，避免账号枚举。

M3.5-D：

- `POST /api/platform/auth/change-password`。
- `PUT /api/platform/employees/:id/password`。
- `CurrentUserDto.mustChangePassword`。
- 双表同步 `must_change_password`。

M3.5-E：

- `PlatformScopeService.resolveScope(currentUser)`（M5-1 起改为按数据类型 `resolveScope(currentUser, dataType)`，`dataType ∈ 'profile' | 'presence' | 'report'`）。
- effective scope 规则：`company > department_tree > department > self`。
- `custom` 与空 dataScopes 降级为 `self`（空数组 `degradedFromCustom=false`，显式 `custom` 且无有效范围才 `=true`）。
- `PlatformRepository.listDescendantDepartmentIds(parentId, enterpriseId)`。
- `GET /api/platform/employees` 已接入 scope 过滤。
- 跨 `enterpriseId` 绝不放行。

## 6. 当前代码注意事项

`apps/platform-api/src/users/employee.service.ts`：

- `PlatformScopeService` 是必需依赖。
- 不要恢复 optional `scopeService?`。
- 不要添加运行时 "not registered" guard。
- 不要使用 constructor overload 或 `as PlatformScopeService` 断言绕过 DI。
- 直接实例化 `EmployeeService` 的测试应显式传入 stub `PlatformScopeService`。

`apps/platform-api/src/users/employee.controller.ts`：

- `listEmployees(@Req() request: PlatformRequest)` 使用 `request.currentUser!`。
- 这是任务包 M3.5-E 明确要求，依赖 `PlatformAuthGuard` 保证。

`apps/platform-api/src/scope/platform-scope.service.ts`：

- `PlatformScopeKind` 只包含 `self | department | department_tree | company`。
- 不包含 `custom`；`custom` 在 service 内部被吃掉。

## 7. 验证基线

普通本地验证：

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

最近一次回修已验证：

```text
pnpm typecheck: pass
pnpm test: pass, 13 files / 71 tests
pnpm test:e2e: pass, memory E2E 20 tests
```

PostgreSQL 本地验证现状：

```text
DATABASE_URL=postgresql://work:work@localhost:5432/work_platform
```

本机最近尝试 `pnpm db:setup` 失败，原因是 PostgreSQL 用户 `work` password authentication failed。因此 PostgreSQL integration / PostgreSQL E2E 当前依赖 CI 或修正本机数据库凭据后再跑。

## 8. 新会话建议提示词

在 Codex Desktop 的"项目"中新开会话时，可直接发送：

```text
我们继续 E:\Work\work-platform 项目。

请先读取 docs/ai-handoff.md，然后按其中的启动读取顺序读取必要文档和 git 状态。
当前最新有效提交是 9c887bd。
当前下一步是 M3.5-F。
不要依赖旧会话记忆，以仓库文档和 Git 历史为准。
读取完后先汇报当前状态、未提交文件、下一步任务包是否存在。
```

## 9. 执行纪律

- 基建优先，不要提前跳到业务模块实现。
- 任务包有精确文件清单时，不要静默增删文件。
- 任务包要求精确 old/new 替换时，匹配失败就停下回报。
- 提交使用 Conventional Commits。
- staging 使用显式 `git add <files>`，不要用 `git add -A`。
- 交付时回报验证命令结果、commit hash、`git show --stat HEAD`、`git status --short`。
