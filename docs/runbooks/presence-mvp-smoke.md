# Presence MVP 交付 Smoke Runbook

适用：M4 在位管理 MVP 本地端到端验证。可重跑。
首次引用：`docs/verification-log.md` 的 `M4-4 Presence MVP Delivery Verification` 章节。

## 1. 前置条件

- Windows + PowerShell（项目主开发环境）。
- Docker Desktop 已安装且引擎正在运行。
- pnpm 10.x、Node 22.x。
- 本仓库工作树干净（`git status --short` 没有非任务包未跟踪文件）。

## 2. 起 PostgreSQL 容器

```powershell
docker compose -f infra/docker-compose.yml up -d postgres
docker ps --filter "name=postgres"
```

期望：postgres 容器状态 `Up`，端口 `5432:5432` 已映射。

**如果 docker ps 显示容器仍 Exited 或不存在**：见 §6 故障树。

## 3. 初始化 schema 与 seed

```powershell
$env:DATABASE_URL = 'postgresql://work:work@localhost:5432/work_platform'
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD = 'admin123'
pnpm db:setup
```

期望：退出码 0；日志包含 `migration` / `Seeded platform foundation` 字样；末尾 JSON 含 `permissionCount`（M4-4 写就时 seed 数值是 11，未来 manifest 变化会改）。

**如果出现 `28P01 password authentication failed for user "work"`**：见 §6 故障树。

## 4. 跑全量验证

```powershell
$env:RUN_POSTGRES_INTEGRATION = 'true'
$env:RUN_POSTGRES_E2E = 'true'
pnpm verify:full
```

`verify:full` 链路：

1. `pnpm lint` —— 期望 pass，可能保留若干历史 warning（Nx ProjectGraph、`employee.controller.ts` non-null assertion、`load-remote-module.ts _descriptor`、`openim-provider.service.ts` 未用 stub 参数）。
2. `pnpm typecheck` —— 期望 pass。
3. `pnpm test` —— 跑 `test:unit`（vitest node env）+ `test:web`（vitest jsdom env），期望全 pass。
4. `pnpm test:e2e` —— 走 `vitest.e2e.config.mts` 默认 include（`apps/**/*.e2e-spec.ts` 和 `modules/**/*.e2e-spec.ts`）。本节顶部已 export `RUN_POSTGRES_INTEGRATION=true` 和 `RUN_POSTGRES_E2E=true`，所以 platform-api memory E2E + platform-api postgres E2E + presence E2E 三类都会被 describe.skipIf 放行真跑（postgres 路径要求 docker postgres 起着）。**第 7 步 `pnpm test:e2e:postgres` 是 superset 之上的显式重跑，跑的 spec 集合是第 4 步的真子集**（只跑 `platform-api.postgres.e2e-spec.ts` 和 `presence.e2e-spec.ts`），是一次冗余的精确确认；期望两步都 pass。
5. `pnpm build` —— 期望 pass。
6. `pnpm test:db` —— 跑 `*.integration.spec.ts`，要求 DB 起着；期望 pass（platform integration 6 case + presence integration 6 case）。
7. `pnpm test:e2e:postgres` —— 跑 `*.e2e-spec.ts` 的 postgres 路径，要求 DB 起着；期望 pass（platform postgres e2e 5 case + presence e2e 6 case）。

## 5. Docker 全栈构建

```powershell
pnpm docker:build
```

期望：8 个 service 镜像（postgres / redis / platform-api / gateway-api / notification-api / im-adapter-api / realtime-gateway / workbench-shell）全部 build 完成无 error。

`postgres` / `redis` 是 pull 官方镜像，不构建；其余 6 个会触发本地 build。如果首次跑会比较慢（~10-20 分钟，pnpm install + 多服务并行）。

## 6. PostgreSQL 28P01 故障树

按顺序排查：

### 6.1 docker postgres 容器没起

```powershell
docker ps --filter "name=postgres"
```

如果没有 `Up` 状态的容器：

```powershell
docker compose -f infra/docker-compose.yml up -d postgres
Start-Sleep -Seconds 5
docker ps --filter "name=postgres"
```

回到 §3 重试。

### 6.2 5432 端口被本地原生 PostgreSQL 占用

```powershell
Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
```

如果输出显示 `OwningProcess` 不是 docker：

- 方案 A：停掉本地原生 postgres（`net stop postgresql-x64-17` 之类）。
- 方案 B：改用本地原生 postgres 的实际密码（不推荐，与 CI 配置不一致）。
- 方案 C：临时改 compose 端口映射（仅本地，不提交）：`'15432:5432'`，然后 `DATABASE_URL` 改 `localhost:15432`。

### 6.3 docker 卷里残留旧密码不匹配（compose POSTGRES_PASSWORD 改过）

如果 §6.1 容器起了、§6.2 端口干净，但 §3 仍然 28P01：很可能旧卷里 work user 的密码不是 `work`（例如以前手动改过、或被另一个 compose 覆盖）。

```powershell
docker compose -f infra/docker-compose.yml down
docker volume ls --filter "name=postgres"
# 把下面 <volume-name> 替换为上面 ls 输出里属于本仓库的卷名
# 典型本地是 infra_postgres-data；compose project 名取决于 cwd 与历史，可能也是
# work-platform_postgres-data 或别的；不要直接 rm 不属于本仓库的卷
docker volume rm <volume-name>
docker compose -f infra/docker-compose.yml up -d postgres
Start-Sleep -Seconds 8
```

注意：**这会丢失本地 postgres 卷里的所有数据**。仅本地开发可这么做；生产严禁。同机器若有其他项目共用同一个卷（不常见），先备份。

回到 §3 重试。

### 6.4 Docker Desktop 引擎没起

Windows 上 docker CLI 能运行不代表引擎跑着。打开 Docker Desktop GUI，确认引擎状态绿色。

## 7. 浏览器 smoke 6 步

前置：docker postgres 起着、`pnpm db:setup` 已跑过、`admin/admin123` 可登录。

### 步骤

| # | 操作 | 期望 |
| --- | --- | --- |
| 1 | 终端 A：`pnpm --filter @work/gateway-api start:dev`；等到日志显示 `Nest application successfully started`，监听 3000 | gateway-api on http://127.0.0.1:3000 |
| 2 | 终端 B：`pnpm --filter @work/workbench-shell dev`；等到 Vite 显示 `Local: http://localhost:5173/` | workbench-shell on http://127.0.0.1:5173；vite proxy `/api → 127.0.0.1:3000` |
| 3 | 浏览器打开 http://127.0.0.1:5173/，用 `admin/admin123` 登录 | 登录成功，跳到 `/`，展示 `WorkbenchHome` 和 5 项菜单（组织架构 / 员工管理 / 角色权限 / 在位看板 / 状态登记） |
| 4 | 点 `在位看板`（URL → `/presence/board`） | 看板页加载，loading 状态短暂出现后展示空记录（或之前 e2e 留的记录被清理过；只要不报错即可），看到"刷新"按钮 |
| 5 | 点 `状态登记`（URL → `/presence/register`）。下拉框"状态"选 `出差`（select value 是 enum `business_trip`，显示文本走 `formatStatusLabel` 翻译）。开始时间填 `2026-05-28T10:00`，结束时间填 `2026-05-28T18:00`，备注填 `manual smoke`，点击 `提交登记` 按钮 | 按钮文本短暂变 `提交中…` 然后恢复；表单字段被清空；同页下方"我的最近记录" `<section>` 的 `<ul>` 顶部出现一条新记录，行内字段依次：`出差` / 开始时间本地化 / 结束时间本地化 / 行末出现 `取消` 按钮（因为 `cancelledAt` 为空、被 `activeRecords.some` 计算为 isActive） |
| 6 | 点击新记录行末的 `取消` 按钮 | 按钮文本短暂变 `取消中…`；列表刷新后该行 `取消` 按钮消失，行内追加 `（已取消）`；点导航回 `/presence/board`，看板列表里这条记录不存在（看板只展示未取消的活跃状态） |

### 完成清理

```powershell
# 终端 A: Ctrl+C 关 gateway-api
# 终端 B: Ctrl+C 关 vite
```

可选保留 docker postgres 容器（下次 smoke 复用），或：

```powershell
docker compose -f infra/docker-compose.yml stop postgres
```

## 8. 故障定位

| 现象 | 排查 |
| --- | --- |
| 步骤 3 登录返回 401 + 中文消息 `账号或密码错误` | seed 没跑 / 跑过但 admin password 不是 `admin123`。回到 §3 加 `$env:PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD='true'` 再跑 `pnpm db:seed` 一次重置。 |
| 步骤 3 登录后菜单只有 3 项（没有"在位看板/状态登记"） | seed 没把 presence 菜单写入 / 当前用户没 `presence:board:view` 或 `presence:status:create` 权限。检查 `SELECT permission_code FROM platform.menus WHERE module_name='presence';` 应有两行；检查 admin 角色应含 11 个权限。 |
| 步骤 4 看板页报 401 / 网络错误 | vite proxy 没生效。检查 `apps/workbench-shell/vite.config.ts` 的 `server.proxy` 里 `/api -> http://127.0.0.1:3000`；检查 gateway-api 是否真在 3000 端口（不是 3001）。 |
| 步骤 4 看板页报 `Presence runtime not initialised` | shell bootstrap 没调 `moduleRegistry.applyRuntime`。M4-3 已修复；如果回归，检查 `apps/workbench-shell/src/app/App.tsx` 登录成功分支是否调了 `moduleRegistry.applyRuntime({...})`。 |
| 步骤 5 提交返回 409 | 时间区间和已有未取消记录重叠。换一个时间窗口（如 `2026-05-29`），或先在"我的最近记录"里取消旧记录。 |
