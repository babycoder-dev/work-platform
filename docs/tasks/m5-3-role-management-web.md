# Task: M5-3 Web 角色管理 UI

## 状态

Ready for execution（硬依赖 M5-1、M5-2 已合入）

## 0. 任务定位

把 `@work/platform-web` 的 `/platform/roles` 占位页换成真实角色管理 UI：角色列表、角色编辑（功能权限矩阵 + 数据范围矩阵）、用户—角色分配。**只做前端**；API 由 M5-2 提供。

参照 **presence/web 的成熟模式**实装（api-client 工厂 + runtime 注入 + 页面四态），不要自创 fetch/axios 或自定义错误结构。

## 1. 必读

1. `AGENTS.md`、`docs/doc-index.md`
2. `docs/rfc/m5-roles-permissions-admin.md` §7 API、§8 权限点、§10 Web 范围
3. **参照实现**（必读，照抄结构）：
   - `modules/presence/web/src/module.ts`（`setRuntime` 钩子）
   - `modules/presence/web/src/runtime.ts`（`createHttpClient({baseUrl})` + 缓存 api/currentUser）
   - `modules/presence/web/src/api/presence-api-client.ts`(+ `.spec.ts`)（api-client 工厂 + http get/post/put/delete）
   - `modules/presence/web/src/pages/PresenceBoardPage.tsx`(+ `.spec.tsx`)、`RegisterStatusPage.tsx`(+ `.spec.tsx`)（加载/成功/失败/校验四态 + 测试用 mock runtime）
4. 现状：
   - `modules/platform/web/src/module.ts`（占位，**无 setRuntime**，需补）
   - `modules/platform/web/src/pages/RolesPage.tsx`（占位）、`PlatformAdminPlaceholder.tsx`
   - `modules/platform/web/package.json`（**缺 `@work/http-client`、`@work/platform-contract` 依赖**，需加）
5. `packages/platform-contract`：`RoleDto`、`RoleDataScope`、`UpdateRoleInput`、`CreateRoleInput`、`PlatformDataType`、`PLATFORM_DATA_TYPES`、`DataScope`、`PermissionDto`、`CurrentUserDto`

## 2. 设计要点

1. **数据类型 × 范围矩阵**：行 = `PLATFORM_DATA_TYPES`（profile/presence/report，中文标签：个人信息档案 / 在位状态 / 日报周报）；列 = 四个范围（本人/本部门/本部门及下级/全公司）。单选。`custom` **不出现**（预留）。某类型未选 = 不下发该类型 `dataScopes`（后端按 self 处理），UI 可默认选“本人”以显式化。
2. **功能权限矩阵**：`GET /api/platform/permissions` 返回按 `moduleName` 分组勾选。
3. **`isSystem` 行**：列表中标“内置”，禁用编辑/删除按钮。
4. **删除**：占用（409 `PLATFORM_ROLE_IN_USE`）与内置（409 `PLATFORM_ROLE_PROTECTED`）要把后端错误信封 message 展示给用户，不要静默吞。
5. 标签/枚举从 contract 常量取，不在组件里硬编码字符串数组。

## 3. 文件清单

### 3.1 `modules/platform/web/package.json`

`dependencies` 加（按字母序）：

```json
"@work/http-client": "workspace:*",
"@work/platform-contract": "workspace:*"
```

改后跑 `pnpm install`（不带 `--frozen-lockfile`）。

### 3.2 新增 `src/api/platform-roles-api-client.ts`

仿 `presence-api-client.ts`，`baseUrl: '/api/platform/'`：

```ts
export interface PlatformRolesApiClient {
  listRoles(): Promise<RoleDto[]>;
  getRole(id: string): Promise<RoleDto>;
  createRole(input: CreateRoleInput): Promise<RoleDto>;
  updateRole(id: string, input: UpdateRoleInput): Promise<RoleDto>;
  deleteRole(id: string): Promise<void>;
  listPermissions(): Promise<PermissionDto[]>;
  assignUserRoles(userId: string, roleIds: string[]): Promise<unknown>;
}
```

> 后端 `GET /roles` 返回 `{ items: RoleDto[] }`；client 解包 `.items`（presence 同款风格按实际后端返回结构对齐——以 M5-2 实测响应为准）。`assignUserRoles(userId, roleIds)` → `put('employees/${encodeURIComponent(userId)}/roles', { roleIds })`：`userId` 走**路径参数**，请求体**只含 `roleIds`**（后端 `AssignEmployeeRolesDto` 只收 `roleIds`，userId 来自 `@Param('id')`；不要把 userId 塞进 body）。

加 `.spec.ts` 断言每个方法打到正确 path/method（仿 `presence-api-client.spec.ts`）。

### 3.3 新增 `src/runtime.ts`

仿 presence `runtime.ts`：`setPlatformRuntime(runtime)` 调 `runtime.createHttpClient({ baseUrl: '/api/platform/' })` → 建 api-client，缓存 `currentUser`；导出 `getPlatformRolesApi()` 与 `__resetPlatformRuntimeForTest()`。

### 3.4 改 `src/module.ts`

- 加 `setRuntime(runtime) { setPlatformRuntime(runtime); }`。
- `/platform/roles` 路由 `load` 指向新 `RolesPage`（保留 org/employees 占位不动）。

### 3.5 改 `src/pages/RolesPage.tsx`（列表）

- 挂载时 `getPlatformRolesApi().listRoles()`；四态：加载中 / 空 / 失败 / 成功表格。
- 表格列：名称、code、状态、内置标记；操作：编辑、删除（内置禁用）。
- “新建角色”入口 → 打开编辑态（新建模式）。
- 删除二次确认；捕获 409 错误信封 message 展示。

### 3.6 新增 `src/pages/RoleEditor.tsx`（编辑/新建，抽屉或独立区块）

- 基本信息：名称、code（新建可填、编辑只读）、描述、状态。
- 功能权限矩阵：`listPermissions()` 按 moduleName 分组多选。
- 数据范围矩阵：`PLATFORM_DATA_TYPES` × 四范围单选。
- 保存：新建 `createRole`，编辑 `updateRole`；成功/失败/校验态。
- 提交前组装 `dataScopes: RoleDataScope[]`（每类型一项）。

### 3.7 用户—角色分配（最小实现）

本期最小：在 RoleEditor 或 EmployeesPage 提供“给员工分配角色”入口，调用 `assignUserRoles(userId, roleIds)` 整组覆盖。若 EmployeesPage 仍为占位、改造成本高，可只在角色侧不做分配 UI，但**必须**在 verification-log 标注“用户分配 UI 延后到 M8 人员管理，本期可经 API/脚本分配”。优先做出最小可用分配（哪怕是简单下拉选员工+选角色）。

> 决策：用户分配 UI 的归属页（角色侧 vs 员工侧）以实现成本择优；列表/编辑/矩阵为主线，分配为辅。

## 4. 测试要求（`*.spec.tsx` / `*.spec.ts`，web 配置）

用 `vitest.web.config.mts`（`*.spec.tsx`，jsdom）。仿 presence 页面 spec 用 mock runtime（`createHttpClient: () => ({get,post,put,delete})`）：

- api-client：各方法 path/method 正确。
- RolesPage：加载成功渲染表格；空态；加载失败态；内置角色删除按钮禁用。
- RoleEditor：矩阵渲染三类型×四范围；提交组装 `dataScopes` 正确；保存失败展示错误。
- 删除 409 错误信封 message 渲染。

## 5. 验证

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test        # 含 web spec
pnpm test:e2e
pnpm build
```

（纯前端切片，无需 DB；浏览器 smoke 放 M5-4。）

## 6. 必须保持不变

- 不改后端 API / 契约 / 迁移。
- 不改 org/employees 占位页（除非做 §3.7 员工侧分配，且仅加分配入口、不动其余）。
- 菜单仍由 Platform Core manifest 派生，不在 web 硬编码菜单。
- `pnpm-lock.yaml` 不手改。

## 7. 完成后更新文档

1. `docs/foundation-progress.md`：§6.2 M5-3 置 `Done` + 日期 + 锚点；§6 下一步改 `M5-4 交付验证`。
2. `docs/verification-log.md`：加 `### M5-3 Role Management Web`，含 Change set、验证结果、用户分配 UI 归属说明、Follow-up=M5-4。

## 8. 提交规范

Conventional Commits 单次提交，显式 `git add`。建议信息：

```
feat(platform-web): role management UI (list/editor/scope matrix)

Replace the roles placeholder with a real admin UI: role list, role editor
with a function-permission matrix and a data-type x scope matrix, and
user-role assignment. Wire platform-web runtime + roles API client following
the presence module pattern.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

</content>
