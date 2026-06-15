# Task: M7-3 调度基建（@nestjs/schedule + schedule 配置 + 占位 job + ①② job 接线点预留）

## 状态

Ready for execution

## 0. 任务定位

M7 第三刀。把"定时任务调度"从无到有长成**可用、可配置、可验证**的基线，供后续 M10 日报等
业务模块直接注册 job。本切片交付：

1. **引入 `@nestjs/schedule`**：在 `modules/notification/api` 落地调度框架（RFC §9.1 已定选型）。
2. **Job 注册框架（读配置而非硬编码）**：一个统一的 job 定义（`key` + 默认 `cron` + handler）+ 启动时
   **从 `schedule_config` 读 cron/enabled 动态注册** 的引导服务（`SchedulerRegistry` + 动态 `CronJob`）。
3. **`notification.schedule_config` 表 + 双实现 repository + 幂等 seed**（迁移 `0002`），存"可配置截止时间/cron"
   等参数，job 读它而非写死。
4. **一个可验证的占位 job**：`notification.heartbeat`（心跳），证明调度框架真能按配置注册并运行，
   **不依赖任何未建业务数据**。
5. **① ② 日报提醒 job 的接线点预留**：定义 job key + **空 handler + 注释指向 M10** + seed 为 `enabled=false`，
   M10 接上在岗/日报数据后即可启用，本切片不实现其业务逻辑。

> **真值修正（必须按此执行，勿照 RFC §19 字面"①②④"）**：RFC §19 切片表把 M7-3 写成"①②④接线点预留"，
> 但 RFC **§9.3 权威**只列 ①②（均为**调度 job**）。**④ `profile.updated` 是事件驱动**（生产者 platform/M8，
> 契约归 `@work/platform-contract`），已在 **M7-2** 的 `modules/notification/contract/src/events.ts`
> `notificationTriggerKeys.profileUpdated` 预留，**不是调度 job、不进 `schedule_config`、本切片不碰**。
> 故 M7-3 只预留 ①② 两个 job 接线点。

**本切片不做**（留后续切片，别越界）：

- ① "在岗但未交日报→提醒本人"、② "日报交齐→提醒负责人" 的**具体业务逻辑**（依赖 M9 在岗名单 + M10 日报
  提交记录，本期都不存在）→ 仅预留 job key + 空 handler + 注释。
- **`schedule_config` 的 HTTP 写接口 / 管理 UI / 写审计**（理由见 §2.7）→ 本切片 `schedule_config` 由迁移 seed、
  由 job 引导服务**只读**消费；`upsert` 方法在 repository 落地（供 repo 测试 + M10 写路径复用），但**不开 controller 端点**。
- SSE 推送端点 + 前端铃铛/工作台卡片 + 触发点配置管理 UI → **M7-4**。
- 交付验证门禁（verify:full / docker:build 全量 + 假绿核查 + 文档总同步）→ **M7-5**。

> **安全门禁判定（重要，与 M7-2 不同）**：本切片**不改** `auth/scope/audit/rbac/repositories` 子树、
> **不动**密码/token/权限模型/数据范围模型、**不新增任何 HTTP 端点/权限点**、**不新增 platform 读端口**、
> 只在 notification 自有 schema 加一张表 + 进程内调度框架。按 `docs/security-baseline.md` §16 字面，
> **非强制 security-reviewer 门禁项**（M7-2 强制是因为新增了 platform 组织/角色读端口；本切片没有）。
> 故本切片**不要求** security-reviewer 二审；任务包本身的二审仍按规范走独立 general sub-agent。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、统一错误信封、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m7-notification-scheduler.md`（**本切片权威规格**）——重点 **§9 定时任务调度基建**（§9.1 选型、
   §9.2 本期做、§9.3 预留）、§11 schema（`schedule_config`）、§14 审计（注意调度配置写审计依赖写路径，本切片无写路径）、
   §19 切片（M7-3 行）、§20 本期做/预留表（"调度框架+可配置截止时间+占位 job"=本期做；"①②日报提醒 job 逻辑"=预留）
4. `modules/presence/CLAUDE.md`（模块隔离、**显式 `@Inject` gotcha**、跨模块只走事件/公共 API）
5. `apps/gateway-api/CLAUDE.md`（两个全局 Guard；本切片不加路由，但需知 notification 模块由 gateway 装配一次）
6. 既有范式代码（**照搬，不要另起炉灶**）：
   - **配置表全链路范式**（schedule_config 完全照此做）：
     - 迁移 + 幂等 seed：`modules/notification/api/src/db/migrations/0001_init_trigger_config.sql`
     - 行类型：`modules/notification/api/src/db/schema/trigger-config.schema.ts`
     - repository 接口：`.../db/trigger-config.repository.ts`；双实现：`in-memory-trigger-config.repository.ts` /
       `postgres-trigger-config.repository.ts`；token：`db/trigger-config-repository.token.ts`
     - 装配 + driver gate（`NOTIFICATION_REPOSITORY_DRIVER || PLATFORM_REPOSITORY_DRIVER === 'memory'`）：
       `modules/notification/api/src/notification.module.ts`（postgres provider `:30-33` + driver-gate factory `:48-59`）
     - repo 测试：`db/trigger-config.repository.spec.ts`；postgres 集成测试范式：
       `db/postgres-notification.repository.integration.spec.ts`（env-gated）
   - **迁移自动发现**：`modules/notification/api/src/db/migrate.ts:70-80`（`migrations/*.sql` 排序自动跑，**新增 `0002` 无需改 migrate.ts / 根脚本**）
   - **生命周期服务范式**（`OnModuleInit`/`OnModuleDestroy`）：`modules/files/api/src/files/files-cleanup.service.ts`、
     `modules/notification/api/src/events/notification-event.subscriber.ts`（订阅器同款生命周期 + handler 整体 try/catch）
   - **contract 常量/类型范式**：`modules/notification/contract/src/events.ts`（`as const` key 表 + 决策注释）、
     `trigger-config.dto.ts`（DTO/输入类型），`index.ts` `export *`
   - **显式 `@Inject`**：`notification-event.subscriber.ts`、`trigger-config.service.ts`（每个注入都 `@Inject(token)`）

## 2. 设计要点（严格遵守）

### 2.1 引入 `@nestjs/schedule` 与装配位

- `modules/notification/api/package.json` `dependencies` 新增 **`@nestjs/schedule`（与 Nest 11 兼容的版本，
  当前 `^6.x`，其 peer 接受 `@nestjs/common/core ^10 || ^11`；定版以 pnpm 解析为准，提交更新后的 `pnpm-lock.yaml`）**。
- 动态 `CronJob` 用 `import { CronJob } from 'cron';`。**`cron` 必须在同一 `package.json` `dependencies` 里显式声明**
  （版本与 @nestjs/schedule 传递的对齐，当前 `^4.x`）——本仓**无 `.npmrc`**，pnpm 走默认严格 hoisting，
  一个包只能 import 自己 `dependencies` 声明过的包；`cron` 仅作 @nestjs/schedule 的传递依赖时，
  从 notification/api 直接 `import 'cron'` 会 resolve 失败（typecheck/build 报错，CI frozen-lockfile 下更难定位）。
  **不要**等"报错再加"，开工即显式加。
- 在 **`modules/notification/api/src/notification.module.ts`** `imports` 加 `ScheduleModule.forRoot()`
  （`@nestjs/schedule`）。**只在 notification 模块装一次**：notification 由 gateway 装配一次（`gateway.module.ts`），
  故 `forRoot()` 全进程仅执行一次，`SchedulerRegistry` 全局可用。
  > 决策：调度框架**本切片由 notification 模块承载**（① ② 是"发提醒通知"的 job，handler 天然属 notification）。
  > 若 M10 report 模块将来需自注册 job，再评估把 `ScheduleModule.forRoot()` 上提到 gateway 组合根——**本切片不预设、不上提**。

### 2.2 Job 注册框架（读配置动态注册，命门）

新增引导服务 `SchedulerBootstrapService`（`modules/notification/api/src/scheduler/scheduler-bootstrap.service.ts`，
`implements OnModuleInit, OnModuleDestroy`，仿订阅器生命周期）：

- 持有一组**静态 job 定义** `ScheduledJobDefinition { key: string; defaultCron: string; run: () => Promise<void> }`，
  由各 job 提供（见 §2.3/§2.4）。注入方式用显式 `@Inject`（§2.8）。
- `onModuleInit()`：对每个 job 定义：
  1. `findScheduleConfig(key)` 读 `schedule_config`（seed 保证有行）；缺行则用 `defaultCron` + `enabled=true`
     兜底（防 NPE，并记 `Logger.warn`，正常路径不应发生）。
  2. **`enabled=false` → 跳过注册**（① ② 预留 job 默认 disabled，故启动时不挂 cron——这就是"接线点预留"的体现）。
  3. `enabled=true` → `new CronJob(config.cron, () => void this.runSafely(def))`，
     `schedulerRegistry.addCronJob(key, job)` + `job.start()`。
- `runSafely(def)`：**整体 try/catch**，失败仅 `Logger.error`（与订阅器 F3 同理——job 抛错不得让调度器崩、
  不得影响其他 job；RFC §8.3 best-effort，本期不重试/补偿）。
- `onModuleDestroy()`：**对本服务注册过的每个 key `job.stop()` + `schedulerRegistry.deleteCronJob(key)`**。
  - **硬约束（vitest 假死陷阱）**：`@nestjs/schedule` 的 `CronJob` 会持有活动定时器（open handle）；
    若测试/进程销毁时不 `stop()`，**vitest 会因未关闭句柄挂住或报 "did not exit"**。务必在 `onModuleDestroy`
    停掉并删除所有本服务注册的 job；只删自己注册的 key，不动别处的 cron。

> 用 `SchedulerRegistry` + 动态 `CronJob`（而非 `@Cron('...')` 装饰器）是**刻意的**：装饰器把 cron 写死在编译期，
> 无法满足 RFC §9.2"job 读配置而非硬编码 / 可配置截止时间"。

### 2.3 占位 job：`notification.heartbeat`（可验证，零业务依赖）

- 新增 `modules/notification/api/src/scheduler/jobs/heartbeat.job.ts`（`@Injectable() HeartbeatJob`），
  提供 `ScheduledJobDefinition`（key=`scheduleJobKeys.heartbeat`，defaultCron 见下，`run` 见下）。
- `run()`：**可观测且可断言**——更新内部 `lastRunAt: Date | null` 与 `runCount: number`（进程内字段），
  并 `Logger.debug('notification heartbeat tick')`。**不读写任何业务表**（证明框架可用，不依赖未建数据）。
  暴露 `getStatus(): { lastRunAt, runCount }` 供测试断言（**不开 HTTP 端点**，§2.7）。
- seed 默认 cron：低频即可（如每小时 `0 * * * *`），`enabled=true`。**测试不依赖 cron 真的到点触发**——
  直接 `app.get(HeartbeatJob).run()` 断言 `getStatus()` 变化 + 断言 `SchedulerRegistry` 已按 seed 的 cron 注册该 job（§5）。

### 2.4 预留 ① ② 日报提醒 job（接线点，空 handler + 注释）

- 新增 `modules/notification/api/src/scheduler/jobs/report-reminder.jobs.ts`，提供两个 `ScheduledJobDefinition`：
  - ① `scheduleJobKeys.reportReminderDue`（`report.reminder.due`）：`run()` **空实现** + 注释
    `// 预留(M10)：在岗(M9)且未交日报(M10)→提醒本人；依赖 M9 在岗名单 + M10 日报提交记录，本切片不存在生产数据。`
  - ② `scheduleJobKeys.reportReminderCompleted`（`report.reminder.completed`）：`run()` **空实现** + 注释
    `// 预留(M10)：日报交齐→提醒部门负责人；依赖 M10 日报提交统计，本切片不存在生产数据。`
- 两者 seed 为 **`enabled=false`**（故启动时不注册 cron，纯接线点）；cron 给一个合理占位（如 `0 9 * * *`），
  `params` 留 `{}`（M10 在此存"日报截止时间"等可配置参数）。
- **不**为 ① ② 写任何接收人解析/通知生成逻辑（那是 M10）；空 handler 被调用应是无副作用 no-op。

### 2.5 `notification.schedule_config` 表 + 双实现 repository

- **迁移** `modules/notification/api/src/db/migrations/0002_init_schedule_config.sql`（migrate.ts 自动发现）：

  ```sql
  CREATE TABLE IF NOT EXISTS notification.schedule_config (
    job_key text PRIMARY KEY,
    cron text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    params jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  -- 占位心跳 job：本期唯一启用的 job，证明调度框架可用
  INSERT INTO notification.schedule_config (job_key, cron, enabled, params)
  VALUES ('notification.heartbeat', '0 * * * *', true, '{}'::jsonb)
  ON CONFLICT (job_key) DO NOTHING;

  -- 预留(M10) ①②：默认 disabled，仅占接线点；M10 接上日报数据后启用
  INSERT INTO notification.schedule_config (job_key, cron, enabled, params)
  VALUES
    ('report.reminder.due', '0 9 * * *', false, '{}'::jsonb),
    ('report.reminder.completed', '0 9 * * *', false, '{}'::jsonb)
  ON CONFLICT (job_key) DO NOTHING;
  ```

  本切片**全局配置（不按 enterprise 分）**；多租户分级调度配置【预留】（SQL/注释标注）。

- **行类型** `db/schema/schedule-config.schema.ts`：`ScheduleConfigRecord { jobKey; cron; enabled; params; updatedAt: Date }`
  （`params` 类型用 `Record<string, unknown>`）。
- **repository 接口** `db/schedule-config.repository.ts`：`listScheduleConfigs()`、`findScheduleConfig(jobKey)`、
  `upsertScheduleConfig(jobKey, { cron?, enabled?, params? })`（**`upsert` 供 repo 测试 + M10 写路径复用，本切片无 HTTP 写入口**）。
- **双实现**：`in-memory-schedule-config.repository.ts`（构造函数内置上面三行同款默认，仿 in-memory-trigger-config）/
  `postgres-schedule-config.repository.ts`（仿 postgres-trigger-config，`upsert` 用 `INSERT ... ON CONFLICT DO UPDATE`）。
- **token** `db/schedule-config-repository.token.ts`：`NOTIFICATION_SCHEDULE_CONFIG_REPOSITORY = Symbol.for(...)`。
- **装配 + driver gate**：`notification.module.ts` 加 postgres provider（`inject: [NOTIFICATION_DB_POOL]`）+
  in-memory provider + driver-gate factory（**完全照搬 `NOTIFICATION_TRIGGER_CONFIG_REPOSITORY` 那段：postgres provider
  `:30-33` + gate factory `:48-59`**）。

### 2.6 contract：job key 常量 + 类型

- 新增 `modules/notification/contract/src/schedule.ts`：

  ```ts
  export const scheduleJobKeys = {
    // 占位心跳 job：证明调度框架可用，零业务依赖（M7-3）
    heartbeat: 'notification.heartbeat',
    // 预留(M10) ①：在岗且未交日报→提醒本人。依赖 M9 在岗 + M10 日报，M7-3 仅占 job key + 空 handler。
    reportReminderDue: 'report.reminder.due',
    // 预留(M10) ②：日报交齐→提醒部门负责人。依赖 M10 日报统计，M7-3 仅占 job key + 空 handler。
    reportReminderCompleted: 'report.reminder.completed',
    // 注意：④ profile.updated 是【事件驱动】(notificationTriggerKeys.profileUpdated, 生产者 platform/M8)，
    // 不是调度 job，不在此列、不进 schedule_config。
  } as const;

  export interface ScheduleConfigDto {
    jobKey: string;
    cron: string;
    enabled: boolean;
    params: Record<string, unknown>;
    updatedAt: string; // ISO
  }
  // 供 M10 写路径复用；本切片无 HTTP 写入口。
  export interface UpdateScheduleConfigInput {
    cron?: string;
    enabled?: boolean;
    params?: Record<string, unknown>;
  }
  ```

- `modules/notification/contract/src/index.ts` 加 `export * from './schedule';`。

### 2.7 为什么本切片不开 `schedule_config` 写接口 / 写审计（决策）

- RFC **§12 HTTP API 表中没有任何 `schedule-config` 端点**；M7-4 前端范围也只含触发点配置 UI + 铃铛，**无调度配置 UI**。
- RFC §14"调度配置变更→审计"只在**存在写路径时**才有意义；本切片 `schedule_config` 由**迁移 seed**，
  由 job 引导服务**只读**消费，**没有写路径**，故本切片不落写接口、不落写审计、不加权限点。
- 真正需要调度配置可调的是 ①② 日报 job（M10）。届时按 trigger-config 同款范式补
  `GET/PUT /api/notification/schedule-config` + `notification:schedule-config:manage` 权限 + 写审计
  （action 如 `notification.schedule-config.update`），**M7-3 不做**。repository 已备 `upsert`，M10 接线成本极低。
- **可观测性**：占位 job 是否在跑用**进程内字段 + DI 断言**验证（§5），**不新增 HTTP 端点**——既不扩攻击面，
  也对齐 RFC §12（无调度端点）。

### 2.8 显式 `@Inject`（presence CLAUDE gotcha）

所有新增 provider 的注入一律**显式 `@Inject(token)`**（esbuild/tsx 不 emit decorator metadata，裸类型注入会 500）。
涉及 `SchedulerRegistry`（`@nestjs/schedule` 导出，按其文档注入；如裸注入失败则 `@Inject(SchedulerRegistry)`）、
`NOTIFICATION_SCHEDULE_CONFIG_REPOSITORY`、各 job 类（`@Inject(HeartbeatJob)` 等）。

### 2.9 单实例调度边界（best-effort，预留）

- `@nestjs/schedule` 是**进程内**调度：多副本部署时**每个副本都会各自触发 cron**（重复执行）。本期内网**单实例
  部署**足够（与 RFC §10 SSE 单实例直推一致）。**多副本调度协调（分布式锁 / leader 选举 / DB advisory lock）
  【预留】**——在 `SchedulerBootstrapService` 顶部注释标注此边界，多副本时再补。

## 3. 模块结构增量

### 3.1 `modules/notification/contract`

- `src/schedule.ts`（§2.6）+ `index.ts` 导出。

### 3.2 `modules/notification/api`

- `package.json`：加 `@nestjs/schedule` 依赖（§2.1）。
- `src/scheduler/scheduler-bootstrap.service.ts`（§2.2）。
- `src/scheduler/jobs/heartbeat.job.ts`（§2.3）。
- `src/scheduler/jobs/report-reminder.jobs.ts`（§2.4，① ② 空 handler 预留）。
- `src/scheduler/scheduled-job.ts`（`ScheduledJobDefinition` 接口，或并入 bootstrap 文件）。
- `src/db/schema/schedule-config.schema.ts` + `src/db/migrations/0002_init_schedule_config.sql`（§2.5）。
- `src/db/schedule-config.repository.ts`（接口）+ `in-memory-schedule-config.repository.ts` +
  `postgres-schedule-config.repository.ts` + `db/schedule-config-repository.token.ts`（§2.5）。
- `src/notification.module.ts`：`imports` 加 `ScheduleModule.forRoot()`；`providers` 加 schedule-config 双实现 +
  driver-gate factory + 三个 job 类 + `SchedulerBootstrapService`。

> 不动 `notification.controller.ts`（本切片不加端点）。不动 presence/files/forms/platform（本切片与它们无关）。

## 4. 数据库

- `0002_init_schedule_config.sql`：建表 + 三行幂等 seed（§2.5）。
- `db:setup` / `db:migrate:notification` **无需改**（migrate.ts 自动发现 `migrations/*.sql`）。
- 迁移幂等：重复 `db:migrate:notification` 不报错（`schema_migrations` 去重 + `IF NOT EXISTS` + `ON CONFLICT DO NOTHING`）。

## 5. 验证

### 5.1 命令（全过）

```bash
pnpm install                    # 装 @nestjs/schedule，提交 lockfile
pnpm lint && pnpm typecheck
pnpm test                       # 单元 + web
pnpm test:e2e                   # in-memory e2e
pnpm build
# 有本地 Postgres 时：
pnpm verify:full                # 含 test:db / test:e2e:postgres（注意 env-gated 假绿）
```

> 本切片不改部署形态（不删/加 app、不改 compose、不改 Dockerfile），`pnpm docker:build` 非必跑。

### 5.2 断言（必须覆盖）

- **单元**：
  - `schedule_config` repository 双实现：`list` / `find`（命中/缺行返回 undefined）/ `upsert`（新增 + 更新，
    cron/enabled/params 各字段 COALESCE 语义正确）。
  - `SchedulerBootstrapService`：给定 seed 配置，`onModuleInit` 后 `SchedulerRegistry` **含 `notification.heartbeat`**
    且**取回的 `CronJob` 的 cron 表达式 == seed 的 `0 * * * *`**（断言读出的调度表达式，证明"读配置而非硬编码"
    这一 §9.2 命门——闭合"动态读配置"证明链；cron@4 暴露表达式的属性名以实际 API 为准，如 `cronTime`）；
    **不含** `report.reminder.due` / `report.reminder.completed`（disabled 不注册）；
    `onModuleDestroy` 后这些 key 从 registry 删除（断言 `getCronJobs()`/`doesExist` 清理干净——证明无 open handle 泄漏）。
  - `HeartbeatJob.run()`：调用后 `getStatus()` 的 `runCount+1`、`lastRunAt` 更新。
  - `runSafely`（或等价路径）：注入会抛错的 `run` → **不抛**（断言吞异常仅记日志，证明 job 失败不崩调度器）。
  - ① ② 预留 job 的 `run()`：调用为 no-op、不抛错（确认空 handler 安全）。
- **e2e（in-memory，`apps/gateway-api/src/*.e2e-spec.ts`，经 `GatewayModule`，`PLATFORM_REPOSITORY_DRIVER=memory`）**：
  - 可新增轻量 `scheduler.e2e-spec.ts`，或扩 `notification.e2e-spec.ts`：应用经 gateway 启动后，
    `app.get(SchedulerRegistry)` **含 heartbeat、不含两个 report 预留 job**（证明 `ScheduleModule.forRoot` +
    bootstrap 经真实组合根接通）；`app.get(HeartbeatJob).run()` 后状态变化。**应用 `close()` 不挂起**（句柄清理生效）。
    - **确认 `afterAll` 真的调了 `app.close()`**：§2.2 的句柄清理走 `onModuleDestroy`，由 `app.close()` 触发；
      cron@4 的 CronJob 定时器**不像** `files-cleanup.service.ts` 的 `setInterval` 那样 `.unref()`，不 close 则定时器仍是活动句柄、
      vitest 会挂起/"did not exit"。新增/扩写的 e2e 必须有 `afterAll(() => app.close())`。
- **Postgres-gated**：`schedule_config` repository postgres 集成测试（env-gated，仿
  `postgres-notification.repository.integration.spec.ts`；**确认 gate 真跑过**，别假绿）。
- **回归**：既有 notification/presence/files/forms 单元 + e2e **全绿**——重点确认引入 `ScheduleModule` 后
  **测试进程能正常退出**（无 vitest "did not exit"/挂起；§2.2 句柄清理）。
- 验收禁止假数据/占位蒙混；source-review 判定而非裸 grep。

## 6. 退出标准

1. `@nestjs/schedule` 引入，`ScheduleModule.forRoot()` 在 notification 模块装配一次，lockfile 已提交。
2. `SchedulerBootstrapService` 从 `schedule_config` **读配置动态注册** job；`enabled=false` 不注册；
   `run` 整体 try/catch 不崩调度器；`onModuleDestroy` 停并删本服务注册的所有 job（无 open handle 泄漏）。
3. 占位 job `notification.heartbeat` 跑通且可断言（`run()` + registry 注册校验）。
4. ① `report.reminder.due`、② `report.reminder.completed` 预留：job key + 空 handler + 注释指向 M10 +
   seed `enabled=false`；本切片不实现其业务逻辑。
5. `notification.schedule_config` 表 + 三行幂等 seed + 双实现 repository（含 `upsert`）；`db:migrate:notification` 幂等。
6. contract `scheduleJobKeys` + `ScheduleConfigDto`/`UpdateScheduleConfigInput` 落地并导出，④ 非 job 的注释到位。
7. **不**新增 HTTP 端点 / 权限点 / 写审计（§2.7 决策）；**不**碰 auth/scope/audit/presence/files/forms/platform。
8. `pnpm verify` 全绿，测试进程正常退出。

## 7. 必须保持不变（避免越界）

- 不引入重型调度/队列（Bull/Redis/Kafka/外部 cron）——仅 `@nestjs/schedule`（RFC §2、§9.1）。
- 不动 auth/scope/audit/rbac/repositories 规则；不新增 platform 读端口；不新增 HTTP 端点/权限点。
- 不动 presence/files/forms/platform 代码与既有 notification 的事件订阅/触发点配置链路（M7-2 成果）。
- 不实现 ①② 业务逻辑、不开 schedule_config 写接口/UI（M10）；不做 SSE/前端（M7-4）。
- notification 不读写其它模块 schema；调度只在 notification 自有 schema + 进程内。

## 8. 完成后更新文档

- `docs/foundation-progress.md`：M7-3 完成结论 + 下一步 M7-4；M7 切片表（若有）标 M7-3 done。
- `docs/architecture.md`：调度基建落位——notification 模块承载 `@nestjs/schedule`（`ScheduleModule.forRoot`）、
  `notification.schedule_config` 配置表、`SchedulerBootstrapService` 从配置**动态注册 `CronJob`**、占位 heartbeat job、
  ①② 预留接线点；并写明**单实例调度边界 + 多副本协调【预留】**（§2.9）。
- `docs/security-baseline.md`：**无需改**（本切片不动 auth/scope/audit、不新增端点/权限/敏感字段——按 §16 判定非门禁项；
  在 verification-log 注明此判定即可）。
- `docs/deployment.md`：若需，注明 `schedule_config` 迁移随 `db:migrate:notification` 自动跑（入口未变）+ **单实例调度**部署约束。
- `docs/verification-log.md`：追加 `M7-3 Scheduler Infrastructure` 锚点与结论（含"非 security-reviewer 门禁项"判定 + 假绿核查结论）。

## 9. 提交规范

- Conventional Commits：`feat(notification): scheduler infrastructure (@nestjs/schedule + schedule_config + heartbeat job)`；
  伴随可拆 `feat(notification): reserve report-reminder job wiring points (M10)`。
- 提交信息说明三块：①调度框架（ScheduleModule + 从配置动态注册 + best-effort + 句柄清理）②schedule_config 表/双实现/seed
  ③占位 heartbeat job + ①② 预留接线点；并注明本切片**非 security-reviewer 门禁项**的判定依据（§2.7/§7）。
- 交付前跑完 §5 命令，结论贴进 `docs/verification-log.md`。
