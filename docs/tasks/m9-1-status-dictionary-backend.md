# Task: M9-1 状态字典后端（`presence.status_types` 新表 + archive-only 管理 + 记录 `status` 放宽为字典 key（DROP 枚举 CHECK）+ 服务层校验 + 重叠豁免改键 `is_default` + 事件加 `statusLabel` + 改 M7 订阅器；web/看板反转/forms 均不在本切片）

## 状态

Ready for execution（独立 sub-agent 二审已过：真值清单 10 条全实；1 Major——新 e2e 文件须追加进根 `test:e2e` 显式枚举否则假绿——与 4 Minor 均已修订进文中）

## 0. 任务定位

M9 的第一刀（RFC `docs/rfc/m9-presence-v2.md` §16 M9-1 行），**presence 模块内的 schema 变更 + 新授权面切片**，安全敏感（新权限点 + DROP DB 约束后服务层校验成为唯一防线 + 跨模块改 M7 订阅器）。交付状态字典的**后端**：

1. **新表 `presence.status_types`**（RFC §6）：手写 SQL 迁移 `0001`（presence 独立迁移入口 `db:migrate:presence`）+ `(enterprise_id, key)` 唯一约束 + **`is_default` partial unique index**（企业内至多一个 active 缺省态，DB 强制）+ repository 双实现（memory + postgres）。
2. **预置 5 状态种子**（在岗 working=default / 出差 business_trip / 外出调研 field_research / 外出 out / 休假 leave，与 M4 枚举 key 一致→数据向后兼容）：**运行时幂等 ensure**（见 §2.3 判定，不写进迁移 SQL）。
3. **字典管理 API**（`/api/presence/status-types`）：列出（active）/ 全量列出（含 archived）/ 新建 / 改 label 改序 / **设为缺省（单事务先清后置）** / **停用归档 / 恢复**。**一律 archive、不提供任何硬删代码路径**（RFC §18-① + TOCTOU 消除）。preset 不可删仅可停用、key 创建后不可改。
4. **新权限点 `presence:status-type:manage`**（RFC §7/§18-③）：进 presence contract `permissions.ts` + 两份 manifest + platform seed（经 manifest 单源自动摄取，admin 自动获授）。**不加菜单**（管理 UI = M9-3b，菜单随 UI 切片加）。
5. **记录 `status` 放宽**（RFC §6/§11）：迁移 **DROP `status_records_status_check`**（⚠️ 只 DROP 这一条，`status_records_time_range_check` 保留）+ 增列可空 `form_record_id`（本切片只建列 + 读端映射，**写入留 M9-2**）；contract `PresenceStatus` 联合类型退化为开放字符串（预置 key 抽成 const 数组）。
6. **服务层校验 = 唯一防线**（RFC §6，controller 裸 `@Body()` + CHECK 已 DROP）：登记时校验 **key 存在且 active**（未知/archived → 400）、**缺省态（`is_default`）拒登**（在岗=无记录，400）。
7. **重叠 409 豁免改键**：postgres `:169` / in-memory `:84` 两处硬编码 `status <> 'working'` → 按**当前缺省态 key** 排除（service 解析后传参，双实现行为一致；历史 working 记录因 working=default 天然兼容）。
8. **事件 payload 加 `statusLabel`（硬需求）+ 改 M7 订阅器**（RFC §8，跨模块改点）：`presence.status.changed` 两处发布（created/cancelled）都随行下发字典 label；`modules/notification` 订阅器本地 interface + `buildPresenceContent` 改为消费 `statusLabel`，删除 `formatPresenceStatus` 穷举映射（自定义 key 不再显示裸 key）。

**本切片不做**（划清边界，留后续切片）：

- forms 槽位激活 / `forms:presence-definition:*` 注册 / forms 记录 API 泛化 / `form_record_id` 写入 / 默认员工角色补 `forms:record:submit` → **M9-2**。
- 看板名册反转 / `PlatformEmployeeLookupPort.listEmployeesByScope` 扩面 / 看板响应随行 `statusLabel` → **M9-3a**（本切片 `getBoard`/`getEmployeeStatus` 查询与过滤逻辑**一行不改**）。
- 一切 web（字典管理页 / 登记 v2 UI / `StatusBadge`/`PresenceSection` label 消费迁移）→ **M9-3b**。widening 类型不会破 web 编译（`Record<PresenceStatus,string>` 静默退化，RFC §3 已确认），本切片**不动任何 `.tsx`**。
- Excel 导出 → **M9-4**；交付验证门禁 → **M9-5**。
- M4 遗留 `cancelRecord` 无 `enterprise_id` 复核（已登记 foundation-progress §7.1 follow-up）**本切片不修**——避免和字典改动混在一个 diff 里；若 Codex 顺手修了属越界。

> **安全门禁判定（写进任务包供二审 + security-reviewer 复核）**：
>
> - **security-reviewer：强制**（RFC §15-9 四切片各自过，M9-1 是第一个）。
> - **不触发 platform 安全基线编辑**：presence 只读写自己 schema，不落 `apps/platform-api/src/{auth,scope,audit}` 子树；`presence:status-type:manage` 是模块内新权限点（既有模型内扩展），不改数据范围模型/最宽取值/`resolveScope` 语义 → 无 ADR、`security-baseline.md` 通常不改（§7 复核）。唯一跨模块改点是 notification 订阅器消费 `statusLabel`（纯展示字段）。
> - **任务包二审**：独立 general sub-agent（带本节决策真值清单），见记忆 `feedback_independent_subagent_review`。
>
> reviewer 关注点：① `presence:status-type:manage` guard 接线（gateway 双全局 Guard 下每个管理端点都带 `@RequirePermissions`）；② 企业隔离——`enterpriseId` **一律取自 `currentUser`**，所有字典读写/记录校验带 `enterprise_id` 条件，绝不从 body/param 读；③ **无硬删**：repository/service/controller 三层都不存在 delete 代码路径；④ `is_default` 唯一由 **partial unique index** 强制 + 设缺省单事务先清后置（并发两个设缺省不能同时成功）；⑤ DROP CHECK 后**服务层校验是唯一防线**——未知/archived/缺省 key 三类拒登有直接测试断言；⑥ 事件 payload 只新增 `statusLabel`（展示信息），无敏感值夹带；⑦ preset 保护（不可删、key 不可改）+ 缺省态不可 archive；⑧ 重叠豁免改键后 postgres/in-memory 行为一致、历史 working 记录不被误判重叠。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md`（模块边界、**统一错误信封**、提交规范）
2. `docs/doc-index.md` §1 优先级、§5 审查规则
3. `docs/rfc/m9-presence-v2.md`（**本切片权威规格**）——重点 **§3 现状盘点**（改点行号与坑位全在此）、**§4 D1/D5**、**§5.1 状态字典**、
   **§6 数据模型**（partial unique index / DROP CHECK / 服务层唯一防线 / 重叠豁免改键）、**§7 权限**（`presence:status-type:manage`）、
   **§8 事件**（`statusLabel` 硬需求 + M7 订阅器同改；notification 本地重定义 payload，类型不破、运行时破）、**§10 审计**、**§11 迁移**、
   **§12 测试要求**、**§13 安全要求**、**§15 退出标准** 1/2/6/8/9/10、**§16** M9-1 行、**§18 拍板** ①②③
4. 根 `CLAUDE.md`（三套 vitest 配置按后缀分流、**Postgres-gated env-gate 静默跳过=假绿**、`verify`/`verify:full` 门禁）
5. `apps/gateway-api/CLAUDE.md`（**双全局 Guard**——新控制器每个端点必须带 `@RequirePermissions`，否则 401/403 行为不对）
6. `modules/presence/CLAUDE.md`（**显式 `@Inject` gotcha**——esbuild 不 emit decorator metadata，裸类型注入 500；presence 迁移入口独立）
7. 既有范式代码（**照搬，不要另起炉灶**）：
   - **迁移范式**：[0000_init_presence.sql](modules/presence/api/src/db/migrations/0000_init_presence.sql)（手写 SQL + `IF NOT EXISTS`；两条 CHECK 约束名就在这里——**只 DROP `status_records_status_check`**）；
     [migrate.ts](modules/presence/api/src/db/migrate.ts)（按文件名 localeCompare 排序、`presence.schema_migrations` 记账——新迁移命名 `0001_m9_status_dictionary.sql`，无需改 migrate.ts）。
     ⚠️ **presence 无 Drizzle schema**（纯手写 SQL + `pg` Pool + 手写 Row 映射，与 platform 不同）——**不涉及 `pnpm db:generate`**，RFC §6 那句"db:generate 同步 Drizzle"对 presence 侧不适用，勿为此发明 drizzle 文件。
   - **repository 接口 + 双实现**：[presence.repository.ts](modules/presence/api/src/db/presence.repository.ts) /
     [postgres-presence.repository.ts](modules/presence/api/src/db/postgres-presence.repository.ts)（`STATUS_RECORD_COLUMNS` + Row 接口 + map 函数范式；**`:169` 附近 `AND status <> 'working'` 是要改的豁免点**）/
     [in-memory-presence.repository.ts](modules/presence/api/src/db/in-memory-presence.repository.ts)（**`:84` `record.status === 'working'` 是另一处豁免点**）
   - **service 范式**：[presence-status.service.ts](modules/presence/api/src/status/presence-status.service.ts)（`@Inject(PRESENCE_REPOSITORY)` + `PLATFORM_AUDIT_SERVICE` 审计 + `EVENT_BUS` 发布——两处 `eventBus.publish` 是加 `statusLabel` 的落点）
   - **controller 范式**：[presence-status.controller.ts](modules/presence/api/src/status/presence-status.controller.ts)（`@Controller('presence/...')` + 每端点 `@RequirePermissions` + `buildAuthAuditContext`；注意它是裸 `@Body()`——**新控制器不要学这点**，用 `dtoValidationPipe`）
   - **DTO 校验管道**：`dtoValidationPipe`（[packages/nest-common/src/http/dto-validation.pipe.ts](packages/nest-common/src/http/dto-validation.pipe.ts)，presence api 已依赖 `@work/nest-common`；DTO class 需 `class-validator`/`class-transformer`——若 presence api `package.json` 尚无这两个直接依赖则补上，版本对齐 platform-api）
   - **模块装配**：[presence.module.ts](modules/presence/api/src/presence.module.ts)（双实现 useFactory 按 `PLATFORM_REPOSITORY_DRIVER` 切换——新 service/controller 挂这里）
   - **contract 单源**：[permissions.ts](modules/presence/contract/src/permissions.ts) + [manifest.ts](modules/presence/contract/src/manifest.ts) + [platform-manifest.ts](modules/presence/contract/src/platform-manifest.ts)（**权限点三处同步**，platform seed 读 platform-manifest 自动摄取 + `grantRolePermissions` 全量授予 admin，无需改 seed 逻辑）
   - **事件契约**：[events.ts](modules/presence/contract/src/events.ts) / [status.dto.ts](modules/presence/contract/src/status.dto.ts)
   - **M7 订阅器（跨模块改点）**：[notification-event.subscriber.ts](modules/notification/api/src/events/notification-event.subscriber.ts)（`:10-19` 本地 interface、`:104-118` `buildPresenceContent`+`formatPresenceStatus`）+ 其 spec [notification-event.subscriber.spec.ts](modules/notification/api/src/events/notification-event.subscriber.spec.ts)
   - **错误映射**：[postgres-error.mapper.ts](modules/presence/api/src/db/postgres-error.mapper.ts)——⚠️ **纠正 RFC §6 的一处口径**：CHECK 分支**不会死代码化**（`status_records_time_range_check` 仍在生效），**保留该分支不要删**；status CHECK DROP 后它只是不再拦状态值。
   - **e2e 范式**：in-memory gateway e2e 照 [people-aggregation.e2e-spec.ts](apps/gateway-api/src/people-aggregation.e2e-spec.ts)（memory driver、`ent-default` 企业、admin 全权限、helper 是 **`createAndLoginUser`**（`:204`）搭无权限/特定范围用户——⚠️ 别与 presence.e2e-spec.ts 的 `createUserWithRole` 混名）；
     Postgres-gated 照 [presence.e2e-spec.ts](apps/gateway-api/src/presence.e2e-spec.ts)（`RUN_POSTGRES_E2E` gate + `pnpm db:setup`）与 [postgres-presence.repository.integration.spec.ts](modules/presence/api/src/db/postgres-presence.repository.integration.spec.ts)（`RUN_POSTGRES_INTEGRATION` gate）

## 2. 设计要点（严格遵守）

### 2.1 契约：`modules/presence/contract`

**`src/events.ts`**（放宽 + 加 label）：

```ts
export const presetPresenceStatusKeys = [
  'working',
  'business_trip',
  'field_research',
  'out',
  'leave',
] as const;
export type PresetPresenceStatusKey = (typeof presetPresenceStatusKeys)[number];

/** M9 起为开放状态字典 key（预置 key 见 presetPresenceStatusKeys） */
export type PresenceStatus = string;

export interface PresenceStatusChangedEvent {
  recordId: string;
  enterpriseId: string;
  userId: string;
  status: PresenceStatus;
  /** 状态字典显示名（M9 硬需求：订阅方展示用，勿再本地穷举映射） */
  statusLabel: string;
  startAt: string;
  endAt?: string;
  changedBy: string;
  changeKind: 'created' | 'cancelled';
}
```

- `PresenceStatus = string` 保留类型别名 → 既有 import 全部零改动编译过（web 的 `Record<PresenceStatus,string>` 静默退化为 `Record<string,string>`，**本切片接受**，M9-3b 主动迁移——RFC §3 已把这记为"编译器不兜底"项，勿在本切片顺手改 web）。

**新建 `src/status-type.dto.ts`**（+ `index.ts` re-export）：

```ts
export type PresenceStatusTypeStatus = 'active' | 'archived';

export interface PresenceStatusTypeDto {
  id: string;
  enterpriseId: string;
  key: string; // 稳定标识，创建后不可改
  label: string;
  isPreset: boolean; // 预置不可删（本就无硬删），恒可停用（缺省态除外）
  isDefault: boolean; // "在岗"缺省态标记（§18-②）
  status: PresenceStatusTypeStatus;
  sortOrder: number;
  createdBy?: string; // 预置种子无 actor → undefined（DB 列可空）
  createdAt: string;
  updatedAt: string;
}

export interface CreatePresenceStatusTypeInput {
  key: string;
  label: string;
  sortOrder?: number;
}

export interface UpdatePresenceStatusTypeInput {
  label?: string;
  sortOrder?: number;
}
```

**`src/status.dto.ts`**：`PresenceStatusRecordDto` 加 `formRecordId?: string`（本切片恒为 undefined，M9-2 开始写入；现在进 DTO + SELECT 映射，省 M9-2 契约翻动）。`PresenceBoardQuery.status` 随 `PresenceStatus` 放宽（陈旧无消费契约，RFC §3"顺手处理"——只放宽类型，不删除，去留 M9-3a 看板改造时定）。

**`src/permissions.ts`**：`presencePermissions` 加 `statusTypeManage: 'presence:status-type:manage'`；`presencePermissionDefinitions` 加 `{ code, name: '管理在位状态字典' }`。

**`src/manifest.ts` + `src/platform-manifest.ts`**：permissions 数组各加一条（三处同步，seed 自动摄取 + admin 自动获授——满足 §18-③"仅 HR/系统管理员"的 seed 侧下限；HR 角色由运行时角色管理配置，本切片不造 HR 角色）。**menus 不动**（无管理 UI 前不加菜单，M9-3b 随 UI 补）。

### 2.2 迁移：`modules/presence/api/src/db/migrations/0001_m9_status_dictionary.sql`

```sql
CREATE TABLE IF NOT EXISTS presence.status_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  key varchar(64) NOT NULL,
  label varchar(64) NOT NULL,
  is_preset boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  status varchar(16) NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_types_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT status_types_key_unique UNIQUE (enterprise_id, key)
);

CREATE UNIQUE INDEX IF NOT EXISTS status_types_default_unique_idx
  ON presence.status_types (enterprise_id)
  WHERE is_default AND status = 'active';

ALTER TABLE presence.status_records DROP CONSTRAINT IF EXISTS status_records_status_check;
ALTER TABLE presence.status_records ADD COLUMN IF NOT EXISTS form_record_id uuid;
```

- **只 DROP `status_records_status_check`**；`status_records_time_range_check` 与三个索引保留。现有行 status 值原样保留（key 未变 → 向后兼容，RFC §11）。
- `enterprise_id` **无 FK**（跨 schema FK 到 `platform.enterprises` 违反隔离；`status_records` 同款先例）。`created_by` **可空**（预置种子无 actor）。
- `status_types` 自己的 `status` CHECK 是 presence 自有固定二值枚举，与"记录 status 放宽"无关，**保留**。
- **迁移里不 INSERT 种子行**（理由见 §2.3）；并入既有 `db:migrate:presence` 入口，`db:setup` 链顺序不动。

### 2.3 预置种子 = 运行时幂等 ensure（判定：不走迁移 SQL、不走独立 seed 脚本）

> 判定理由（写明供二审）：① 迁移 SQL 写死企业 UUID 要么 import platform 的 `DEFAULT_ENTERPRISE_ID`（`apps/platform-api/src/seeds/seed-data.ts`，presence 不得依赖 platform-api 内部）要么硬编码复制该 UUID（漂移风险），且**对 memory driver 完全无效**（e2e 用 `ent-default` 字符串企业、不跑迁移）；② 独立 seed 脚本要枚举企业 → 读 `platform.enterprises` 跨 schema 违规。**运行时 ensure 一条代码路径同时覆盖双驱动 + 未来多企业**，幂等无竞态（ON CONFLICT DO NOTHING）。

- repository 双实现各加 `ensurePresetStatusTypes(enterpriseId: string): Promise<void>`：对 5 个预置 key 逐条 `INSERT ... ON CONFLICT (enterprise_id, key) DO NOTHING`（postgres 单语句多 VALUES 亦可）；memory 为"key 已存在则跳过"。**不复活/不覆盖已有行**（admin 改过 label、archive 过 preset 都不会被 ensure 重置——ON CONFLICT DO NOTHING 天然满足，测试断言之）。
- 预置内容：`working/在岗/is_preset/is_default/sort 10`、`business_trip/出差/sort 20`、`field_research/外出调研/sort 30`、`out/外出/sort 40`、`leave/休假/sort 50`；`created_by` NULL。
- **调用点**：`PresenceStatusTypeService` 的每个入口（list/create/…）与 `PresenceStatusService.createRecord` 校验前，先 `await ensurePresetStatusTypes(enterpriseId)`。可用 service 内 per-enterprise `Set` memo 避免每请求重复 INSERT（进程内缓存即可，幂等语义下缓存失效无害）。

### 2.4 Repository：扩 `PresenceRepository` 接口 + 双实现

（沿用单 token `PRESENCE_REPOSITORY`，不另起第二个 repository token，driver 切换 factory 不改。）

```ts
export interface PresenceStatusTypePatch {
  label?: string;
  sortOrder?: number;
}

export interface PresenceRepository {
  // ...既有 5 个方法保持签名不变，仅 findOverlappingRecord 的 query 类型扩字段...
  ensurePresetStatusTypes(enterpriseId: string): Promise<void>;
  listStatusTypes(
    enterpriseId: string,
    options: { includeArchived: boolean },
  ): Promise<PresenceStatusTypeDto[]>;
  findStatusTypeById(enterpriseId: string, id: string): Promise<PresenceStatusTypeDto | undefined>;
  // 含 archived 行（create 查重 / 登记校验判 status / cancel 解析 label 三个调用点都依赖此语义）
  findStatusTypeByKey(
    enterpriseId: string,
    key: string,
  ): Promise<PresenceStatusTypeDto | undefined>;
  createStatusType(input: {
    enterpriseId: string;
    key: string;
    label: string;
    sortOrder: number;
    createdBy: string;
  }): Promise<PresenceStatusTypeDto>;
  updateStatusType(
    enterpriseId: string,
    id: string,
    patch: PresenceStatusTypePatch,
  ): Promise<PresenceStatusTypeDto | undefined>;
  setDefaultStatusType(
    enterpriseId: string,
    id: string,
  ): Promise<PresenceStatusTypeDto | undefined>;
  setStatusTypeStatus(
    enterpriseId: string,
    id: string,
    status: PresenceStatusTypeStatus,
  ): Promise<PresenceStatusTypeDto | undefined>;
}
```

- **无任何 delete 方法**（archive-only 在接口层就成立）。
- `listStatusTypes` 排序 `sort_order ASC, created_at ASC`；`includeArchived:false` 只回 active。
- `setDefaultStatusType`（postgres）：**单事务**（`pool.connect()` 拿 client，`BEGIN` → `UPDATE ... SET is_default = false, updated_at = now() WHERE enterprise_id = $1 AND is_default` → `UPDATE ... SET is_default = true, updated_at = now() WHERE enterprise_id = $1 AND id = $2 AND status = 'active' RETURNING ...` → `COMMIT`，异常 `ROLLBACK`）；第二步 0 行（id 不存在/跨企业/archived）→ 整体回滚返回 undefined。memory 同步等价。partial unique index 兜底并发。
- 所有 `WHERE` 都带 `enterprise_id`（跨企业隔离在 repository 层就成立，service 层再兜一道）。
- 每个写方法都刷 `updated_at`。
- `PresenceRepositoryOverlapQuery` 加 `exemptStatusKey: string`（必填——调用方唯一，service 总能解析出缺省 key）；postgres `AND status <> $n` 替换硬编码 `'working'`；in-memory 同改 `record.status === query.exemptStatusKey`。
- `STATUS_RECORD_COLUMNS`/Row/map 加 `form_record_id` → `formRecordId`（INSERT 语句不加列，可空默认 NULL）。

### 2.5 PresenceStatusTypeService（新，命门：archive-only + 缺省态守护 + 审计）

新建 `modules/presence/api/src/status-type/presence-status-type.service.ts`，注入 `@Inject(PRESENCE_REPOSITORY)` + `@Inject(PLATFORM_AUDIT_SERVICE)`（显式 `@Inject`，presence CLAUDE.md gotcha）。**不注入 eventBus**——字典变更不发任何事件（RFC 未要求，看板实时性由 M9-3a 查询侧保证；发了 = 越界）。

统一前置：每个公开方法先 `ensurePresetStatusTypes(currentUser.enterpriseId)`。

- `list(currentUser)` → active 列表（登记页用）。
- `listAll(currentUser)` → 含 archived 全量（管理页用）。
- `create(currentUser, input, auditContext)`：
  - `key` 规格：`/^[a-z][a-z0-9_]{1,63}$/`（DTO 层校验）；**与 preset key 或既有 key（含 archived）重复 → 409**（service 先 `findStatusTypeByKey` 给出明确文案"状态类型 key 已存在"，DB 唯一约束兜底并发——`postgres-error.mapper` 已把 23505 → 409）。
  - 新建恒 `isPreset:false`、`isDefault:false`、`status:'active'`（**缺省态只能经 setDefault 转移，不能新建即缺省**）；`sortOrder` 缺省 0；`createdBy = currentUser.id`。
- `update(currentUser, id, patch, auditContext)`：只准改 `label`/`sortOrder`（key/isPreset/isDefault/status 不进 patch 面；DTO `forbidNonWhitelisted` 兜底）。id 不存在/跨企业 → 404。archived 行允许改 label（历史展示纠错），写明即可。
- `setDefault(currentUser, id, auditContext)`：目标必须 active，否则 404/409（archived → 409"已停用的状态类型不能设为缺省"）；repository 单事务先清后置；返回 undefined → 404。
- `archive(currentUser, id, auditContext)`：**`isDefault` 行拒绝 archive**（409"缺省状态类型不可停用"——否则企业没有缺省态，看板/M10 判定失锚）；已 archived → 409（幂等语义不采用，暴露 UI 陈旧）。preset **可以** archive（§18-①"preset 恒不可删、仅可停用"）。
- `restore(currentUser, id, auditContext)`：archived → active。
  > **对 RFC 的显式补充（供二审/reviewer 复核，非越界）**：RFC §5.1 只列了"停用归档"未列恢复；但 `(enterprise_id, key)` 唯一约束**含 archived 行**，误停用后 key 被永久烧掉、无法重建同名类型 → archive-only 语义必须配对称恢复操作才运维可用。授权同 `manage`、有审计、restore 后不自动恢复 default 位（`is_default` 仍为 false 除非它本来就是——而缺省态本就不可 archive，故 restore 恒不产生第二个 default，partial index 无冲突面）。
- **审计**（每个写操作，成功路径；照 `presence-status.service.ts` 的 `auditService.record` 范式）：`action` 取 `presence.status-type.create|update|set-default|archive|restore`，`resourceType: 'presence.status_type'`，`resourceId: id`，`metadata` 记 `key` + 变更前后关键字段（`label`/`sortOrder`/`status`/`isDefault` 的 before/after），符合 RFC §10"前后 label/status/default"。

### 2.6 PresenceStatusTypeController（新）

`modules/presence/api/src/status-type/presence-status-type.controller.ts`，`@Controller('presence/status-types')`，每端点显式 `@RequirePermissions`（gateway 双全局 Guard）：

| 方法/路径           | 权限                          | 说明                                                           |
| ------------------- | ----------------------------- | -------------------------------------------------------------- |
| `GET /`             | `presence:status:create`      | active 列表（登记页数据源；含缺省态行，web 过滤不可选）        |
| `GET /all`          | `presence:status-type:manage` | 全量（含 archived，管理页数据源）                              |
| `POST /`            | `presence:status-type:manage` | 新建（`dtoValidationPipe(CreateStatusTypeDto)`）               |
| `PATCH /:id`        | `presence:status-type:manage` | 改 label/sortOrder（`dtoValidationPipe(UpdateStatusTypeDto)`） |
| `POST /:id/default` | `presence:status-type:manage` | 设为缺省（单事务）                                             |
| `POST /:id/archive` | `presence:status-type:manage` | 停用归档                                                       |
| `POST /:id/restore` | `presence:status-type:manage` | 恢复                                                           |

- 路由注意：`GET /all` 字面量与 `PATCH /:id` 分属不同方法无冲突；控制器前缀与既有 `presence/board`、`presence/status-records` 不重叠。
- **任务包决策（RFC 未细至此，供 reviewer 裁量）**：① `GET /` 权限门选 `presence:status:create`——登记页数据源跟登记权限走，且 gateway 双全局 Guard 下端点必须挂权限点；② archived 行允许改 label（§2.5）——停用后纠错历史展示文案的运维场景。restore 端点的补充论证另见 §2.5 显式块。
- **DTO（新建 `presence-status-type.dto.ts`，class-validator）**：`CreateStatusTypeDto`（`key`: `@Matches(/^[a-z][a-z0-9_]{1,63}$/)`；`label`: `@IsString() @IsNotEmpty() @MaxLength(64)`；`sortOrder?`: `@IsInt() @Min(0)` + `@IsOptional()`）；`UpdateStatusTypeDto`（label/sortOrder 均可选，**至少一项**可由 service 判定或 `@ValidateIf` 处理，两者皆缺 → 400）。`dtoValidationPipe` 已开 whitelist+forbidNonWhitelisted，未知字段（如 `isDefault`）→ 400。
- 既有 `PresenceStatusController.createRecord` 的裸 `@Body()` **保持不动**（M4 面；服务层校验是 RFC 指定防线，DTO 管道化留后续切片顺手做——本切片改它会连带 M4 测试面，越界）。

### 2.7 PresenceStatusService 改造（登记校验 + 豁免改键 + statusLabel）

`createRecord` 新流程（替换现 `:96-161`，次序即 RFC §5.2 ①→②→③→④ 的本切片子集）:

1. 部门信息前置检查（既有，不动）。
2. `await repository.ensurePresetStatusTypes(enterpriseId)`；`type = await repository.findStatusTypeByKey(enterpriseId, input.status)`。
   - `!type || type.status !== 'active'` → `BadRequestException('状态类型不存在或已停用')`；
   - `type.isDefault` → `BadRequestException('缺省状态（在岗）无需登记')`。
3. 解析当前缺省态：`defaultType = (await repository.listStatusTypes(enterpriseId, { includeArchived: false })).find((t) => t.isDefault)`（或加一个 `findDefaultStatusType` 辅助——实现自便，但**缺省 key 必须来自字典而非硬编码 'working'**）；`findOverlappingRecord({ ..., exemptStatusKey: defaultType.key })`，重叠 → 409（既有文案不动）。
4. 建记录、审计（既有 metadata 已含 status，不动）。
5. `eventBus.publish` payload 加 `statusLabel: type.label`。

`cancelRecord`：同样前置 `await repository.ensurePresetStatusTypes(enterpriseId)`（存量企业首个 presence 操作可能就是取消历史记录，未 ensure 会解析不到 label）；发布前解析 `label = (await repository.findStatusTypeByKey(enterpriseId, cancelled.status))?.label ?? cancelled.status`（取消历史记录时其类型可能已 archived——archived 行仍可读、label 照用；字典查无此 key（理论不可能）兜底裸 key）。payload 加 `statusLabel: label`。

`getBoard` / `getEmployeeStatus` / `listOwnRecords`：**不动**（名册反转与看板 statusLabel 随行下发 = M9-3a）。

### 2.8 M7 订阅器（跨模块改点，`modules/notification`）

[notification-event.subscriber.ts](modules/notification/api/src/events/notification-event.subscriber.ts)：

- 本地 `PresenceStatusChangedPayload`（`:10-19`）：`status` 放宽为 `string`，**加 `statusLabel?: string`**（**可选**——本地重定义本就不信任生产方，与下行 `??` 兜底自洽；若声明必填则兜底成死代码、类型与实现打架。保持本地重定义、不 import presence-contract——维持既有解耦风格）。
- `buildPresenceContent`：改用 `payload.statusLabel ?? payload.status`（防御性兜底，进程内总线无滞留旧事件，但兜底零成本）；**删除 `formatPresenceStatus` 穷举映射函数**（`:109-118`）。
- 同步更新 [notification-event.subscriber.spec.ts](modules/notification/api/src/events/notification-event.subscriber.spec.ts)：既有用例 payload 补 `statusLabel`；**新增用例**：自定义 key（如 `vip_visit` + label `贵宾接待`）→ 通知 content 含"贵宾接待"、不含裸 `vip_visit`。

### 2.9 模块装配

`presence.module.ts`：`controllers` 加 `PresenceStatusTypeController`；`providers` 加 `PresenceStatusTypeService`；`exports` 视 M9-2 需要可加（本切片无外部消费者，不强求）。

## 3. 模块结构增量

### `modules/presence/contract`

- `src/events.ts`：`PresenceStatus` 放宽 + `presetPresenceStatusKeys` + 事件加 `statusLabel`（§2.1）。
- `src/status-type.dto.ts`（新）+ `src/index.ts` re-export。
- `src/status.dto.ts`：`formRecordId?` + `PresenceBoardQuery.status` 随放宽。
- `src/permissions.ts` / `src/manifest.ts` / `src/platform-manifest.ts`：`presence:status-type:manage` 三处同步（§2.1）。

### `modules/presence/api`

- `src/db/migrations/0001_m9_status_dictionary.sql`（§2.2）。
- `src/db/presence.repository.ts`：接口扩状态字典方法 + `OverlapQuery.exemptStatusKey`（§2.4）。
- `src/db/postgres-presence.repository.ts` / `src/db/in-memory-presence.repository.ts`：双实现（含豁免改键两处、`form_record_id` 读映射、`setDefault` 事务）。
- `src/status-type/`：`presence-status-type.service.ts` / `presence-status-type.controller.ts` / `presence-status-type.dto.ts` / `presence-status-type.service.spec.ts`（§2.5/§2.6）。
- `src/status/presence-status.service.ts`：登记校验 + 豁免键 + `statusLabel`（§2.7）；`presence-status.service.spec.ts` 扩用例。
- `src/db/in-memory-presence.repository.spec.ts`：扩字典/豁免用例。
- `src/db/postgres-presence.repository.integration.spec.ts`：扩（§4.2 Postgres-gated）。
- `src/presence.module.ts`：装配（§2.9）。
- `package.json`：如需补 `class-validator`/`class-transformer` 直接依赖（版本对齐 platform-api；`pnpm install` 后 lockfile 一并提交）。

### `modules/notification/api`

- `src/events/notification-event.subscriber.ts` + spec：消费 `statusLabel`（§2.8）。**只动这一个文件对 + 不碰 notification 其它面**。

### `apps/gateway-api`

- `src/presence-status-types.e2e-spec.ts`（新，in-memory memory-driver e2e，§4.2）。
- `src/presence.e2e-spec.ts`（Postgres-gated）：扩自定义状态注册链路断言（§4.2）。

### 根 `package.json`（⚠️ 必改，否则新 e2e 假绿）

- **`test:e2e` 脚本是显式文件枚举（非 glob）**——vitest 收到位置参数后只跑列出的文件。必须把
  `apps/gateway-api/src/presence-status-types.e2e-spec.ts` **追加进 `test:e2e` 枚举**，否则该文件写完也一行不跑、
  `pnpm test:e2e` / `pnpm verify` 全绿但 §4.2 整块 in-memory e2e 断言从未执行（与 env-gate 假绿同性质且更隐蔽）。
  跑完须在 vitest 输出里**确认出现该文件名**。`test:e2e:postgres` 枚举已含 `presence.e2e-spec.ts`，不用动。

### `docs`

- 见 §7。

> 不动 `apps/platform-api`（无 platform 代码改点——权限点经 manifest 单源摄取）；不动 forms/files/report/approval；不动任何 web 包。

## 4. 验证

### 4.1 命令（全过）

```bash
pnpm install                    # 若补 class-validator/transformer 依赖
NODE_ENV=test pnpm lint && NODE_ENV=test pnpm typecheck
NODE_ENV=test pnpm test         # 单元 + web（web 无改动但须全绿回归；NODE_ENV=test 见记忆）
NODE_ENV=test pnpm test:e2e     # in-memory e2e（须先把新 e2e 文件追加进该脚本的显式枚举，§3；输出里确认文件名出现）
NODE_ENV=test pnpm build
# 有本地 Postgres 时（迁移 + 双实现 + partial index 真跑，别假绿）：
pnpm verify:full                # 含 test:db + test:e2e:postgres（env gate 见根 CLAUDE.md）
```

> 本切片**有迁移但不改部署形态**（无新 app/compose 变更），`pnpm docker:build` 非必跑（留 M9-5）。**务必确认 Postgres-gated 真跑**（`RUN_POSTGRES_INTEGRATION`/`RUN_POSTGRES_E2E` gate 静默跳过=假绿；source-review 判定而非裸 grep）。presence 无 Drizzle，**不跑 `pnpm db:generate`**。

### 4.2 断言（必须覆盖）

- **PresenceStatusTypeService 单元（memory driver）**：
  - ensure 幂等：首次 list 见 5 预置（working 为 default/preset、sort 升序）；改 label / archive 某 preset 后再触发 ensure **不被重置/复活**。
  - create：合法 key 成功（isPreset/isDefault 恒 false）；与 preset key 重复 → 409；与**已 archived** 的 key 重复 → 409；非法 key 格式 → 400（DTO 层）。
  - update：改 label/sortOrder 生效 + `updatedAt` 刷新；不存在/跨企业 id → 404；patch 带 `isDefault`/`key` → 400（forbidNonWhitelisted）。
  - setDefault：转移后旧 default 清位、新 default 置位（**单事务**——postgres 侧断言进集成测试）；对 archived 行 → 409；此后按新缺省 key 豁免重叠（联动断言见下）。
  - archive：普通 active 行成功；**default 行 → 409**；已 archived → 409；preset 非 default 行**可以** archive。
  - restore：archived → active；restore 不改变 `isDefault`。
  - **无硬删**：repository 接口与 service 无任何 delete 方法（结构性断言可用 typecheck/审查代替运行时断言，写进验收说明即可）。
  - 审计：每个写操作一条，metadata 含 key + before/after。
  - 跨企业：所有方法对他企业 id 一律 404/undefined（repository 层 `enterprise_id` 条件）。
- **PresenceStatusService 单元（扩既有 spec）**：
  - **未知 key 登记 → 400**；**archived key → 400**（先 archive 再登记）；**缺省态 key（working）→ 400**——服务层唯一防线的三类直接断言（RFC §12）。
  - 自定义 active key（先 create）登记成功；事件 payload 含 `statusLabel`（= 字典 label）；审计 metadata.status 为该 key。
  - 重叠豁免改键：与既有非缺省记录区间重叠 → 409；历史 `working` 记录存在时新登记**不被误判重叠**（working=default 豁免）；**setDefault 转移到自定义类型后**，旧 working 记录不再豁免、新缺省 key 记录豁免（豁免键跟随字典而非硬编码——双向断言）。
  - cancelRecord 事件带 `statusLabel`；被取消记录的类型已 archived 时 label 仍解析（archived 行可读）。
- **in-memory repository 单元（扩既有 spec）**：`exemptStatusKey` 生效；`ensurePresetStatusTypes` 幂等；`setDefaultStatusType` 先清后置。
- **notification 订阅器单元（扩既有 spec）**：见 §2.8（自定义 key 显示 label 非裸 key；既有用例补 `statusLabel` 后全绿）。
- **e2e（in-memory，新 `presence-status-types.e2e-spec.ts`，照 people-aggregation 范式 memory driver）**：
  - admin：`GET /api/presence/status-types` 见 5 预置 → `POST` 建 `vip_visit/贵宾接待` → `PATCH` 改 label → `POST :id/archive` → `GET /all` 见 archived、`GET /` 不见 → `POST :id/restore` 后复现。
  - **无 `presence:status-type:manage` 的用户**（有 `presence:status:create`）：`GET /` 200；`POST`/`PATCH`/`default`/`archive`/`restore` → 403（PermissionGuard）。
  - 登记链路：`presence:status:create` 用户以 `vip_visit` 登记 → 201 且记录 status=`vip_visit`；以 `working` 登记 → 400；以未知 key → 400；archive `vip_visit` 后再登记 → 400。
  - 越界防护：`POST /api/presence/status-types` 带 `isDefault:true` → 400。
- **Postgres-gated（集成 + e2e，确认 gate 真跑）**：
  - 集成（`postgres-presence.repository.integration.spec.ts`）：`presence.status_types` 表/唯一约束/partial index 存在；**并发唯一性**：直接 SQL 插第二行 `is_default AND status='active'` → 违反 `status_types_default_unique_idx` 报错；`setDefaultStatusType` 事务先清后置；**`status_records` 已无 `status_records_status_check`**（插入自定义 key 行成功）而 `status_records_time_range_check` 仍拦 `start_at >= end_at`；`form_record_id` 列存在且可空；`ensurePresetStatusTypes` 重复调用行数不变。
  - e2e（`presence.e2e-spec.ts` 扩）：admin 建自定义类型 → 用户登记该类型 → `GET mine` 可见；`working` 登记 → 400。
- **回归**：platform / presence / files / forms / notification 既有单元 + e2e 全绿；presence 看板/按人查询行为不变（M9-3a 前）；web 测试全绿（类型放宽不破编译的实证）。
- 验收禁止假数据/占位蒙混；Postgres-gated 结论 source-review 判定。

## 5. 退出标准

1. `presence.status_types` 建表（迁移 `0001` + 双实现）+ `(enterprise_id,key)` 唯一 + **`is_default` partial unique index** 就位；预置 5 行经**运行时幂等 ensure**（双驱动一致、不复活不覆盖）。
2. 字典管理 API 七端点落地（active 列表 / 全量 / 新建 / 改 label 改序 / 设缺省单事务 / archive / restore），**全链路无硬删代码路径**；preset 不可删、key 不可改、缺省态不可 archive、新建不可直接 default。
3. `presence:status-type:manage` 进 contract 三处 + platform seed 自动摄取（admin 获授）；**不加菜单**。
4. `status_records.status` 放宽：**DROP `status_records_status_check`**（time_range_check 保留、error mapper CHECK 分支保留）+ `form_record_id` 增列（读映射就位、无写入）；现有数据零迁移改动。
5. 服务层校验落地且有直接断言：**未知 / archived / 缺省态 key 登记均 400**；重叠 409 豁免键改为**当前缺省态 key**（postgres+in-memory 两处硬编码 `'working'` 清除，setDefault 转移后豁免跟随字典）。
6. `presence.status.changed` payload 加 `statusLabel`（created/cancelled 两处发布）；**M7 订阅器已改消费 `statusLabel`**、`formatPresenceStatus` 穷举已删，自定义 key 通知文案显示 label（订阅器 spec 断言）。
7. 审计覆盖字典 create/update/set-default/archive/restore（metadata 含 key + before/after）；登记/取消审计不回退。
8. 字典服务**不发任何事件**；presence 不读任何 `platform.*`；`getBoard`/`getEmployeeStatus` 行为与 M8-5a 交付态逐字节一致（M9-3a 前不动）。
9. `security-reviewer` 独立二审通过（§0 八关注点）。
10. 单元 + e2e 全绿（`NODE_ENV=test`）；**新 in-memory e2e 文件已追加进根 `package.json` `test:e2e` 显式枚举且确认被收集**（vitest 输出含该文件名）；Postgres-gated **确认真跑**（表/索引/DROP CHECK/事务）；`pnpm verify` 全绿；lockfile 若有依赖增补一并提交。

## 6. 必须保持不变（避免越界）

- **不动 forms**（槽位激活/权限注册/记录 API 泛化/守护测试翻转 = M9-2）；`form_record_id` 只建列不写入。
- **不动看板与按人查询逻辑**（名册反转 + `listEmployeesByScope` 端口 + 看板 `statusLabel` 随行 = M9-3a）；不碰 `packages/platform-contract` 的端口定义。
- **不动任何 web 包**（presence web / platform web 的 label 消费迁移 = M9-3b）。
- **不修 M4 遗留 `cancelRecord` enterprise 复核 follow-up**（已登记 §7.1，独立处理）。
- 不新发明除 `presence:status-type:manage` 外的权限点；不改 auth/rbac/token/session；不动 `apps/platform-api` 代码。
- 字典变更**不发事件**；`presence.status.changed` 契约除 `status` 放宽 + `statusLabel` 外零变化（事件名/changeKind/字段名都不动）。
- notification 侧只改订阅器文件对（interface + content builder + spec），不动触发点配置/接收人解析/SSE。
- 既有 `PresenceStatusController.createRecord` 裸 `@Body()` 维持现状（服务层校验为防线）；`postgres-error.mapper.ts` CHECK 分支**保留**（time_range_check 仍消费它）。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：§6.6 M9 切片表 M9-1 → Done（含 reviewer 结论、Postgres-gated 真跑结论）+ §6"下一步"改指 M9-2。
- `docs/architecture.md`：§4 `presence.status_types` 从"已列实体"改为已落地（一句话：字典 + archive-only + 缺省态 + partial unique index）。
- `docs/module-contract.md`：presence 权限点表加 `presence:status-type:manage`、路由表加 `presence/status-types` 七端点；事件表 `presence.status.changed` 注明 `status` 开放 key + `statusLabel`。
- `docs/domain-glossary.md`：补"状态字典（status_types）""缺省态（is_default，在岗=无记录）""archive-only 停用"术语。
- `docs/security-baseline.md`：**通常不改**（§0 判定：模块内权限点扩展，不触平台规则）；若 reviewer 认定需补数据范围说明再同变更补。
- `docs/doc-index.md` §7：catalog 增 M9-1 任务包行。
- `docs/verification-log.md`：追加 `M9-1 Status Dictionary Backend` 锚点（reviewer 结论 + Postgres-gated 真跑证据 + 三类拒登/豁免改键/statusLabel 断言结果 + 假绿核查 + 真实门禁数字）。

## 8. 提交规范

- 代码分支由 Codex 负责（`feat/m9-1-status-dictionary`），走 PR；本任务包属纯文档，由规划方提交 main。
- 代码提交 Conventional Commits：`feat(presence): status dictionary with archive-only management and open status keys`。
- 提交信息说明：① `presence.status_types` 新表 + partial unique index + 双实现 + 运行时幂等预置；② 管理 API 七端点 + `presence:status-type:manage`（无硬删）；③ 记录 `status` 放宽（DROP status CHECK、time_range CHECK 保留）+ `form_record_id` 增列；④ 服务层三类拒登 + 重叠豁免改键 `is_default`；⑤ 事件加 `statusLabel` + M7 订阅器消费；⑥ security-reviewer 结论。
- 合并前过 §0 security-reviewer；交付前跑完 §4 命令，结论贴进 `docs/verification-log.md`。
