# Task: M5-4 M5 交付验证

## 状态

Ready for execution（硬依赖 M5-1、M5-2、M5-3 已合入）

## 0. 任务定位

M5 收尾切片：跑全量交付门禁、做端到端浏览器 smoke（角色→按类型范围→业务模块联动），把结果沉淀到 `verification-log.md`，并把 M5 整段在进度板置 `Done`。**不写新功能代码**；只允许修“验证过程中暴露的回归 bug”（并在 log 记录）。

## 1. 必读

1. `docs/rfc/m5-roles-permissions-admin.md` §11 测试、§12 退出标准
2. `docs/runbooks/presence-mvp-smoke.md`（docker postgres 起停、`pnpm db:setup`、`verify:full`、28P01 故障树、浏览器 smoke 流程，本切片复用其 bring-up）
3. `docs/development-workflow.md`（交付门禁定义）
4. 根 `CLAUDE.md`（test 矩阵、env-gated 测试 gotcha）

## 2. 验证矩阵（逐条执行并记录 pass/fail/skipped）

### 2.1 快路径

```powershell
pnpm verify   # lint && typecheck && test && test:e2e && build
```

### 2.2 全路径（需本机 docker postgres）

按 runbook 起 postgres 后：

```powershell
$env:DATABASE_URL="postgresql://work:work@localhost:5432/work_platform"
$env:RUN_POSTGRES_INTEGRATION="true"; $env:RUN_POSTGRES_E2E="true"
$env:PLATFORM_REPOSITORY_DRIVER="postgres"; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="admin123"
pnpm db:setup
pnpm verify:full   # verify + test:db + test:e2e:postgres
```

起不来 postgres：如实记录“依赖 CI verify job 兜底”，不得默不作声跳过。

### 2.3 Docker（若改动影响部署；M5 一般不影响，确认即可）

```powershell
pnpm docker:build
```

## 3. 浏览器 smoke（M5 端到端，核心）

目标：证明**按数据类型范围**真正生效、跨业务模块联动。步骤：

1. `pnpm db:setup` 后以 admin 登录（`admin/admin123` dev）。
2. 进 `/platform/roles`：新建角色「部门负责人」——功能权限给 `presence:board:view` + `platform:employee:view`；数据范围设 `档案=本部门`、`在位状态=本部门`、`日报=本人`。保存成功。
3. 验证 `role_data_scopes`（有 DB 时）：该角色 3 行，profile/presence=department、report=self。
4. 给一个非管理员测试员工（隶属某部门）分配该角色：优先经 M5-3 的 UI 分配入口；若 M5-3 未交付分配 UI，则用 `PUT /employees/:id/roles`（body 仅 `{ roleIds }`）完成，并在 log 注明走 API 路径。
5. 以该员工登录：
   - `/platform/employees`：只看到**本部门**员工（profile=department 生效）。
   - `/presence/board`：看板只显示**本部门**成员状态（presence=department 生效）。
6. 验证保护语义：以 admin 试图删除/编辑「系统管理员」角色 → UI 报 409 受保护；试图删除已被占用的「部门负责人」→ 409 占用提示。
7. 解除占用后删除「部门负责人」成功。

记录每步实际结果（截图或文字描述）。

## 4. 退出确认（对齐 RFC §12）

逐条核对并在 log 打勾：

- [ ] UI 可新建角色并按数据类型分别配范围，落 `role_data_scopes`。
- [ ] 分配后 `CurrentUserDto.dataScopes` 按类型生效：员工列表按 `profile`、presence 看板按 `presence` 实际过滤。
- [ ] `isSystem` 角色不可删/改（409 `PLATFORM_ROLE_PROTECTED`）。
- [ ] 被占用角色不可删（409 `PLATFORM_ROLE_IN_USE`）。
- [ ] `platform:role:assign` 生效；新权限点在 seed 与 manifest。
- [ ] 安全基线 §5/§4.4 已同步（M5-1 完成）；`security-reviewer` 历史结论无未决项。
- [ ] `pnpm verify`（+ 有 DB 时 `verify:full`）、CI、浏览器 smoke 全过。

## 5. 完成后更新文档

1. `docs/foundation-progress.md`：
   - §1 总览：M5 行状态 `Pending → Done`，结论列写“角色管理 + 按类型数据范围 + UI 已交付，门禁就绪”。
   - §6 当前下一步：改为 `M6-0 动态表单 mini + 文件存储 RFC`（`docs/rfc/m6-*.md`），并注明 M5 已退出。
   - §6.2 M5-4 置 `Done` + 日期 + 锚点。
   - 可新增 §M5 专节（仿 §8 M4）记录 M5 切片完成表（可选，与 §6.2 不重复即可）。
2. `docs/verification-log.md`：加 `### M5-4 Roles & Permissions Delivery Verification`，含 §2 命令矩阵实测、§3 smoke 七步结果、§4 退出清单勾选、Follow-up=M6。

## 6. 提交规范

Conventional Commits 单次提交（如有 bug 修复随附），显式 `git add`。建议信息：

```
chore(platform): M5 roles & permissions delivery verification

Run pnpm verify(:full), CI gates and a browser smoke proving per-data-type
scopes filter the employee list and presence board, plus role protection /
in-use delete guards. Mark M5 done; next is M6 (dynamic forms + file storage).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

</content>
