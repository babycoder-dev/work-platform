# Task: M3.5-A 让模块 manifest 由各 contract 包统一供给

## 状态

Ready for execution

## 0. 任务定位

本切片属于 **M3.5 收口** 阶段，是 M4-1（presence contract、schema、repository）的硬前置。

M4-0 RFC（`docs/rfc/m4-presence-mvp.md`）已锁定 presence 模块的权限点、菜单、API 路由、领域事件。在 M4-1 真正改 presence contract 之前，必须先把 platform seed 的"模块 manifest 唯一事实源"迁回各 `modules/*/contract` 包，否则 M4-1 改 contract 后 seed 与 contract 会再次漂移。

## 1. 背景

平台 seed 当前把 presence / approval / report 三个业务模块的 `ModuleManifestDto` 内联在 `apps/platform-api/src/seeds/seed-data.ts` 里，与 `modules/<module>/contract` 中已有的 manifest / permissions 存在漂移：

- `modules/presence/contract/src/manifest.ts` 声明了 `presence:status:manage` 与 `/presence/register` 菜单（M4-0 RFC §5 已确认），seed 里都没有。
- `modules/approval/contract/src/index.ts` 声明了 `approval:instance:create`，seed 里只有 `approval:task:approve`；并且 approval/report 当前没有后端实装，但 seed 仍把它们的权限和菜单按 `status='active'` 写入数据库，等于发放了"无任何后端兑现"的权限码。
- `seed-data.spec.ts` 自检"manifest 即 seed 的事实源"，但 contract 包根本没参与，自检只覆盖了内联副本。

本切片把"模块 manifest"的唯一事实源迁到各 `modules/*/contract` 包；平台模块自身的 manifest 留在 `apps/platform-api`；approval / report 在没有后端实装前，manifest 进库但状态为 `disabled`，且不下发它们的权限点和菜单。

完成后，新增/修改模块权限只需要改一处（contract 包），跑一次 `pnpm db:seed` 就生效。

## 2. 必读

按顺序：

1. `AGENTS.md`
2. `docs/doc-index.md`
3. `docs/constitution.md` 第 8、9 节
4. `docs/foundation-blueprint.md` 第 4、5 节
5. `docs/foundation-progress.md` 第 6 节
6. `docs/module-contract.md` 第 2、3、4 节
7. `docs/rfc/m2-permission-menu-audit.md` 第 4 节 M2-2、第 7 节
8. `docs/rfc/m4-presence-mvp.md` 第 5、6 节（权限点与菜单设计，本切片必须保持与之一致）
9. `docs/platform-core.md` 第 3、7 节
10. `apps/platform-api/src/seeds/seed-data.ts`
11. `apps/platform-api/src/seeds/seed-data.spec.ts`
12. `apps/platform-api/src/seeds/seed-platform.ts`
13. `apps/platform-api/src/platform-api.e2e-spec.ts`（"lists menus allowed by..."、"lists module manifests..."、"rejects users without required permissions" 三个用例）
14. `apps/platform-api/src/platform-api.postgres.e2e-spec.ts`
15. `apps/platform-api/src/store/platform-memory.store.ts`（确认内存 fallback 仍能拿到 manifest 列表）
16. `modules/presence/contract/src/manifest.ts`、`permissions.ts`、`index.ts`
17. `modules/approval/contract/src/index.ts`、`modules/report/contract/src/index.ts`
18. `packages/platform-contract/src/rbac.ts`（`ModuleManifestDto` / `MenuDto` / `PermissionDto` 的真正形状）

## 3. 设计要点（必须严格遵守）

1. **两种 manifest 形状不合并**。
   - `WorkModuleManifest`（来自 `@work/platform-sdk`）服务于 Web Shell，沿用现有结构。
   - `ModuleManifestDto`（来自 `@work/platform-contract`）是平台 seed 的事实源。
   - 同一模块在 contract 包里同时导出两种形状；二者共享权限码与菜单 path，但不共享数据结构。
   - 为什么不合并：`WorkModuleManifest` 是前端路由 schema（无 UUID、无 sortOrder、无 status），`ModuleManifestDto` 是数据库行 schema。两者随各自的演化轴变化，强行合并会让 contract 包同时承担两个演化轴。后续如要统一，需要单独 ADR。

2. **稳定 ID 不能动**。`ModuleManifestDto.id` 与 `MenuDto.id` 必须复用现有 seed 里的 UUID，以保持幂等：
   - `platform` 模块 manifest id：`00000000-0000-0000-0000-000000000201`
   - `presence` 模块 manifest id：`00000000-0000-0000-0000-000000000202`
   - `approval` 模块 manifest id：`00000000-0000-0000-0000-000000000203`
   - `report`  模块 manifest id：`00000000-0000-0000-0000-000000000204`
   - 菜单 id：platform/org `…0101`，platform/employees `…0102`，platform/roles `…0103`，presence/board `…0104`。
   - 唯一新增的菜单 id：presence/register 用 `00000000-0000-0000-0000-000000000105`。
   - 当前 ID 段没有按模块号分配的规则。后续在 M3.5-G 跨 schema 数据访问规则文档化时，于 `docs/module-contract.md` 同步定义"模块 UUID 命名规范"，本切片不在范围内。

3. **disabled 模块的语义**：`status='disabled'` 的 manifest 仍然 upsert 进 `platform.module_manifests`（这样运维能看到"模块已声明、未启用"），但它的权限点与菜单**不进入** `platform.permissions` 与 `platform.menus`。这条规则只在 seed 层实现，repository 层和 API 层不需要变更。disabled manifest 的 jsonb payload 仍包含完整 permissions/menus 列表，便于未来切换到 active 时一次性激活。

4. **平台模块 manifest 留在 platform-api**。平台自身（企业/组织/员工/角色/权限）不是业务模块，不应外迁；但应该从 `seed-data.ts` 拆出到独立文件，便于和外来 manifest 并列。

5. **不引入新的 npm 依赖**，所有改动只调整 workspace 包之间的 import。

6. **不改运行时代码、不改迁移、不改 contract 类型**。本切片只动 seed 与 contract 数据。

7. **必须与 M4-0 RFC 对齐**：presence 在 `modules/presence/contract` 中导出的平台 manifest 必须包含所有 3 个权限点（含 `status:manage`）和 2 个菜单（board、register），路径、权限绑定、模块名都与 `docs/rfc/m4-presence-mvp.md` §5、§6 一致。

8. **approval / report contract 目录必须先重构为分文件结构**。它们当前是单文件 `index.ts`（混合 `<module>Permissions` 与 `<module>Events` 常量定义）。本切片要求先把这些常量拆到 `events.ts` 与 `permissions.ts`，再让 index.ts 改为 re-export 桶。`platform-manifest.ts` 必须从兄弟文件（`./permissions`）引入，**禁止**从 `./index` 引入——后者会形成 `index → platform-manifest → index` 的循环依赖。这与 `modules/presence/contract` 当前的目录结构一致。

## 4. 文件清单与具体改动

### 4.0 先重构 approval / report contract 目录（依赖前置）

approval / report contract 当前是单文件 `index.ts`，内含常量定义。本切片所有后续步骤都依赖把它们拆成与 presence 一致的多文件结构，避免 platform-manifest 反向 import index 形成循环依赖。

新增四个文件，内容如下。

`modules/approval/contract/src/events.ts`：

```ts
export const approvalEvents = {
  instanceCompleted: 'approval.instance.completed',
} as const;
```

`modules/approval/contract/src/permissions.ts`：

```ts
export const approvalPermissions = {
  instanceCreate: 'approval:instance:create',
  taskApprove: 'approval:task:approve',
} as const;
```

`modules/report/contract/src/events.ts`：

```ts
export const reportEvents = {
  weeklySubmitted: 'report.weekly.submitted',
} as const;
```

`modules/report/contract/src/permissions.ts`：

```ts
export const reportPermissions = {
  dailyCreate: 'report:daily:create',
  weeklyCreate: 'report:weekly:create',
  weeklyView: 'report:weekly:view',
} as const;
```

### 4.1 新增：`modules/presence/contract/src/platform-manifest.ts`

```ts
import type { ModuleManifestDto } from '@work/platform-contract';
import { presencePermissions } from './permissions';

export const PRESENCE_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000202';
export const PRESENCE_BOARD_MENU_ID = '00000000-0000-0000-0000-000000000104';
export const PRESENCE_REGISTER_MENU_ID = '00000000-0000-0000-0000-000000000105';

export const presencePlatformManifest: ModuleManifestDto = {
  id: PRESENCE_MODULE_MANIFEST_ID,
  moduleName: 'presence',
  displayName: '在位管理',
  description: '出差、外出调研、休假等在位状态登记与看板',
  apiPrefix: '/api/presence',
  webEntry: '/presence',
  status: 'active',
  permissions: [
    { code: presencePermissions.boardView,    name: '查看在位看板',     moduleName: 'presence' },
    { code: presencePermissions.statusCreate, name: '登记在位状态',     moduleName: 'presence' },
    { code: presencePermissions.statusManage, name: '管理团队在位状态', moduleName: 'presence' },
  ],
  menus: [
    {
      id: PRESENCE_BOARD_MENU_ID,
      moduleName: 'presence',
      title: '在位看板',
      path: '/presence/board',
      permissionCode: presencePermissions.boardView,
      sortOrder: 100,
      status: 'active',
    },
    {
      id: PRESENCE_REGISTER_MENU_ID,
      moduleName: 'presence',
      title: '状态登记',
      path: '/presence/register',
      permissionCode: presencePermissions.statusCreate,
      sortOrder: 110,
      status: 'active',
    },
  ],
};
```

### 4.2 新增：`modules/approval/contract/src/platform-manifest.ts`

```ts
import type { ModuleManifestDto } from '@work/platform-contract';
import { approvalPermissions } from './permissions';

export const APPROVAL_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000203';

export const approvalPlatformManifest: ModuleManifestDto = {
  id: APPROVAL_MODULE_MANIFEST_ID,
  moduleName: 'approval',
  displayName: '审批',
  description: '请假、外出等轻量行政审批流程',
  apiPrefix: '/api/approval',
  webEntry: '/approval',
  status: 'disabled',
  permissions: [
    { code: approvalPermissions.instanceCreate, name: '发起审批',     moduleName: 'approval' },
    { code: approvalPermissions.taskApprove,    name: '处理审批任务', moduleName: 'approval' },
  ],
  menus: [],
};
```

### 4.3 新增：`modules/report/contract/src/platform-manifest.ts`

```ts
import type { ModuleManifestDto } from '@work/platform-contract';
import { reportPermissions } from './permissions';

export const REPORT_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000204';

export const reportPlatformManifest: ModuleManifestDto = {
  id: REPORT_MODULE_MANIFEST_ID,
  moduleName: 'report',
  displayName: '工作汇报',
  description: '日/周工作汇报填写与逐级汇总',
  apiPrefix: '/api/report',
  webEntry: '/report',
  status: 'disabled',
  permissions: [
    { code: reportPermissions.dailyCreate,  name: '提交日报', moduleName: 'report' },
    { code: reportPermissions.weeklyCreate, name: '提交周报', moduleName: 'report' },
    { code: reportPermissions.weeklyView,   name: '查看周报', moduleName: 'report' },
  ],
  menus: [],
};
```

### 4.4 修改：`modules/presence/contract/src/index.ts`

把文件改成 re-export 桶（按字母序，不影响功能但避免合并冲突）：

```ts
export * from './events';
export * from './manifest';
export * from './permissions';
export * from './platform-manifest';
export * from './status.dto';
```

> 顺序对功能无影响；但所有被 `export *` 重导出的命名必须在各文件中**全局唯一**。当前没有冲突；若未来新增导出，需自行排查。

### 4.5 重写：`modules/approval/contract/src/index.ts`

原文件包含 `approvalPermissions` 与 `approvalEvents` 常量定义，已在 §4.0 拆出。本文件改为 re-export 桶：

```ts
export * from './events';
export * from './permissions';
export * from './platform-manifest';
```

### 4.6 重写：`modules/report/contract/src/index.ts`

同 §4.5。改写为：

```ts
export * from './events';
export * from './permissions';
export * from './platform-manifest';
```

### 4.7 修改：`modules/presence/contract/package.json`、`modules/approval/contract/package.json`、`modules/report/contract/package.json`

在 `dependencies` 加入：

```json
"@work/platform-contract": "workspace:*"
```

按字母序插入到 `@work/platform-sdk` 之前，保持现有缩进与字段顺序。三个包都要改。

完成后必须执行 `pnpm install`（不带 `--frozen-lockfile`）让 pnpm 重新生成 `pnpm-lock.yaml`。禁止手编辑 lockfile。CI 的 verify job 才使用 `--frozen-lockfile`，本地交付时不要。

### 4.8 新增：`apps/platform-api/src/seeds/platform-module-manifest.ts`

```ts
import type { ModuleManifestDto } from '@work/platform-contract';

export const PLATFORM_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000201';
export const PLATFORM_ORG_MENU_ID        = '00000000-0000-0000-0000-000000000101';
export const PLATFORM_EMPLOYEES_MENU_ID  = '00000000-0000-0000-0000-000000000102';
export const PLATFORM_ROLES_MENU_ID      = '00000000-0000-0000-0000-000000000103';

export const platformModuleManifest: ModuleManifestDto = {
  id: PLATFORM_MODULE_MANIFEST_ID,
  moduleName: 'platform',
  displayName: '平台管理',
  description: '企业、组织、员工、角色、权限等平台基础能力',
  apiPrefix: '/api/platform',
  status: 'active',
  permissions: [
    { code: 'platform:org:view',         name: '查看组织', moduleName: 'platform' },
    { code: 'platform:org:manage',       name: '管理组织', moduleName: 'platform' },
    { code: 'platform:employee:view',    name: '查看员工', moduleName: 'platform' },
    { code: 'platform:employee:create',  name: '创建员工', moduleName: 'platform' },
    { code: 'platform:employee:manage',  name: '管理员工', moduleName: 'platform' },
    { code: 'platform:role:view',        name: '查看角色', moduleName: 'platform' },
    { code: 'platform:role:manage',      name: '管理角色', moduleName: 'platform' },
    { code: 'platform:permission:view',  name: '查看权限', moduleName: 'platform' },
  ],
  menus: [
    {
      id: PLATFORM_ORG_MENU_ID,
      moduleName: 'platform',
      title: '组织架构',
      path: '/platform/org',
      permissionCode: 'platform:org:view',
      sortOrder: 10,
      status: 'active',
    },
    {
      id: PLATFORM_EMPLOYEES_MENU_ID,
      moduleName: 'platform',
      title: '员工管理',
      path: '/platform/employees',
      permissionCode: 'platform:employee:view',
      sortOrder: 20,
      status: 'active',
    },
    {
      id: PLATFORM_ROLES_MENU_ID,
      moduleName: 'platform',
      title: '角色权限',
      path: '/platform/roles',
      permissionCode: 'platform:role:view',
      sortOrder: 30,
      status: 'active',
    },
  ],
};
```

### 4.9 重写：`apps/platform-api/src/seeds/seed-data.ts`

整文件替换为：

```ts
import { approvalPlatformManifest } from '@work/approval-contract';
import type { MenuDto, ModuleManifestDto, PermissionDto } from '@work/platform-contract';
import { presencePlatformManifest } from '@work/presence-contract';
import { reportPlatformManifest } from '@work/report-contract';
import { platformModuleManifest } from './platform-module-manifest';

export const DEFAULT_ENTERPRISE_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_DEPARTMENT_ID = '00000000-0000-0000-0000-000000000002';
export const DEFAULT_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000003';
export const DEFAULT_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000004';

export const platformModuleManifests: ModuleManifestDto[] = [
  platformModuleManifest,
  presencePlatformManifest,
  approvalPlatformManifest,
  reportPlatformManifest,
];

const activeModuleManifests = platformModuleManifests.filter(
  (manifest) => manifest.status === 'active',
);

export const platformSeedPermissions: PermissionDto[] = activeModuleManifests.flatMap(
  (manifest) => manifest.permissions,
);

export const platformSeedMenus: MenuDto[] = activeModuleManifests.flatMap(
  (manifest) => manifest.menus,
);
```

> `platformModuleManifests` 仍保持 4 项（含 disabled 的 approval/report），seed 写库时只对 active 的派生权限点和菜单。`seed-platform.ts` 不需要改动，因为它已经分别遍历 `platformModuleManifests`（写 manifests 表）、`platformSeedPermissions`（写 permissions 表）、`platformSeedMenus`（写 menus 表）。

### 4.10 重写：`apps/platform-api/src/seeds/seed-data.spec.ts`

```ts
import { approvalPlatformManifest } from '@work/approval-contract';
import { presencePlatformManifest } from '@work/presence-contract';
import { reportPlatformManifest } from '@work/report-contract';
import { describe, expect, it } from 'vitest';
import { platformModuleManifest } from './platform-module-manifest';
import { platformModuleManifests, platformSeedMenus, platformSeedPermissions } from './seed-data';

describe('platform seed data', () => {
  it('lists every module manifest including disabled ones', () => {
    expect(platformModuleManifests).toEqual([
      platformModuleManifest,
      presencePlatformManifest,
      approvalPlatformManifest,
      reportPlatformManifest,
    ]);
  });

  it('sources the platform module manifest from platform-api', () => {
    expect(platformModuleManifests.find((manifest) => manifest.moduleName === 'platform')).toBe(
      platformModuleManifest,
    );
  });

  it('sources business module manifests from contract packages', () => {
    const byName = new Map(platformModuleManifests.map((manifest) => [manifest.moduleName, manifest]));
    expect(byName.get('presence')).toBe(presencePlatformManifest);
    expect(byName.get('approval')).toBe(approvalPlatformManifest);
    expect(byName.get('report')).toBe(reportPlatformManifest);
  });

  it('keeps approval and report manifests disabled until their backends ship', () => {
    expect(approvalPlatformManifest.status).toBe('disabled');
    expect(reportPlatformManifest.status).toBe('disabled');
  });

  it('only derives permissions and menus from active manifests', () => {
    const expectedPermissionCodes = platformModuleManifests
      .filter((manifest) => manifest.status === 'active')
      .flatMap((manifest) => manifest.permissions.map((permission) => permission.code));
    const expectedMenuIds = platformModuleManifests
      .filter((manifest) => manifest.status === 'active')
      .flatMap((manifest) => manifest.menus.map((menu) => menu.id));

    expect(platformSeedPermissions.map((permission) => permission.code)).toEqual(expectedPermissionCodes);
    expect(platformSeedMenus.map((menu) => menu.id)).toEqual(expectedMenuIds);
    expect(platformSeedPermissions.map((permission) => permission.code)).not.toContain(
      'approval:task:approve',
    );
    expect(platformSeedPermissions.map((permission) => permission.code)).not.toContain(
      'report:weekly:view',
    );
  });

  it('declares the presence management permission and registration menu', () => {
    expect(platformSeedPermissions.map((permission) => permission.code)).toEqual(
      expect.arrayContaining([
        'presence:board:view',
        'presence:status:create',
        'presence:status:manage',
      ]),
    );
    expect(platformSeedMenus.map((menu) => menu.path)).toEqual(
      expect.arrayContaining(['/presence/board', '/presence/register']),
    );
  });

  it('keeps module manifest names unique', () => {
    const moduleNames = platformModuleManifests.map((manifest) => manifest.moduleName);
    expect(new Set(moduleNames).size).toBe(moduleNames.length);
  });

  it('keeps every permission and menu scoped to its declaring module', () => {
    for (const manifest of platformModuleManifests) {
      expect(manifest.permissions.every((permission) => permission.moduleName === manifest.moduleName)).toBe(true);
      expect(manifest.menus.every((menu) => menu.moduleName === manifest.moduleName)).toBe(true);
    }
  });
});
```

### 4.11 修改：`apps/platform-api/src/platform-api.e2e-spec.ts`

定位用例 `'lists module manifests for users with platform permission visibility'`（约第 165 行）。

仓库中的 repository `listActiveModuleManifests` 只返回 `status='active'`，因此 approval / report 仍**不**应出现。把断言改为：

```ts
expect(response.body.items).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ moduleName: 'platform',  apiPrefix: '/api/platform',  status: 'active' }),
    expect.objectContaining({ moduleName: 'presence',  apiPrefix: '/api/presence',  status: 'active' }),
  ]),
);
const returnedModuleNames = (response.body.items as Array<{ moduleName: string }>).map((item) => item.moduleName);
expect(returnedModuleNames).not.toContain('approval');
expect(returnedModuleNames).not.toContain('report');
```

定位用例 `'lists menus allowed by the current user permissions'`，追加一条断言：管理员应能看到"状态登记"菜单：

```ts
expect(response.body.items).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ title: '状态登记', permissionCode: 'presence:status:create' }),
  ]),
);
```

### 4.12 修改：`apps/platform-api/src/platform-api.postgres.e2e-spec.ts`

若文件中存在对 `module-manifests` 列表或 `/menus/my` 内容的断言，按 4.11 同样规则更新。若没有相关断言（只有 login / departments / 写审计），无需改动。先把文件读到 EOF 再决定。

### 4.13 修改：`apps/platform-api/package.json`

在 `dependencies` 加入 workspace 依赖：

```json
"@work/approval-contract": "workspace:*",
"@work/presence-contract": "workspace:*",
"@work/report-contract": "workspace:*"
```

按字母序插入到 dependencies 区块，保持现有缩进。

## 5. 必须保持不变（避免越界）

- 数据库迁移文件、`platform.repository.ts` 接口、`postgres-platform.repository.ts` 实现。
- `platform-memory.store.ts`（内存 store 仍读取 `platformModuleManifests`，本切片不动）。
- `modules/presence/contract/src/manifest.ts`（`WorkModuleManifest`，给 Web Shell 用，本切片只动平台侧 manifest）。
- 任何运行时控制器或 service 行为。
- 任何 docker / CI 配置。
- `pnpm-lock.yaml` 不要手改；让 `pnpm install` 重新生成。
- M4-0 RFC 已定义的权限码、菜单 path、模块名，全部保留。

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

> `pnpm install` 不带 `--frozen-lockfile`；改了 contract 包 dependencies 后必须让 pnpm 重新生成 `pnpm-lock.yaml`。

如果本机有 PostgreSQL，追加：

```powershell
$env:RUN_POSTGRES_E2E="true"
$env:DATABASE_URL="postgresql://work:work@localhost:5432/work_platform"
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="admin123"
pnpm db:setup
pnpm test:db
pnpm test:e2e:postgres
```

如果本机起不来 PostgreSQL，必须在交付说明里写明，依赖 CI 的 verify job 跑这两条；不允许默不作声地跳过。

### 6.2 数据库状态断言（核心，不能省）

仅证明命令通过不够。本切片的核心约束是"disabled 模块的权限**没**进 platform.permissions"。必须显式断言。

**6.2.a 静态断言（任何环境都要做，写进 verification-log）**

读 `apps/platform-api/src/seeds/seed-data.ts`、`platform-module-manifest.ts` 和三个 contract 包的 `platform-manifest.ts`，得到以下数字并在 verification-log 里写出来：

- `platformModuleManifests.length === 4`（platform / presence / approval / report）
- `platformModuleManifests.filter(m => m.status === 'disabled').map(m => m.moduleName)` 必须是 `['approval', 'report']`
- `platformSeedPermissions.length === 11`（platform 8 + presence 3）
- `platformSeedPermissions` 不包含任何以 `approval:` 或 `report:` 开头的 code
- `platformSeedMenus.length === 5`（platform 3 + presence 2）
- `platformSeedMenus.map(m => m.path)` 必须包含 `/presence/board` 和 `/presence/register`

这些断言在 §4.10 的 spec 用例里已经覆盖（`vitest run apps/platform-api/src/seeds/seed-data.spec.ts`），但 verification-log 必须自然语言复述这几个数字，便于未来 reviewer 不跑测试也能交叉验证。

**6.2.b 数据库断言（仅在本机有 PostgreSQL 时执行）**

```sql
-- 期望：platform=8, presence=3
SELECT module_name, count(*) FROM platform.permissions GROUP BY module_name ORDER BY module_name;

-- 期望：platform=3, presence=2
SELECT module_name, count(*) FROM platform.menus GROUP BY module_name ORDER BY module_name;

-- 期望：4 行；approval / report 的 status='disabled'，platform / presence 的 status='active'
SELECT module_name, status FROM platform.module_manifests ORDER BY module_name;
```

任何一条不符合期望即视为本切片**未通过**。

### 6.3 幂等性手测

在已经 seed 过的库上再跑一次 `pnpm db:seed`，不应出现唯一约束错误或重复行。再次跑 6.2.b 的三条 SQL，结果必须**保持一致**（数字不变）。

## 7. 完成后更新的文档

> 说明：以下描述均为目标"最终态"，不是相对增量。Codex 实际看到的文件可能已存在部分目标内容；以目标态为准比对当前文件，缺什么补什么、错什么改什么。

1. `docs/foundation-progress.md`
   - §6 "当前下一步" 段落必须显示下一步为 `M3.5-B ADR-0003 Gateway 边界`，并在段落中包含一句指向本任务包路径的引用。
   - §6.1 "M3.5 收口切片" 表必须存在；3.5-A 的状态必须为 `Done`，并在说明列写明完成日期（执行交付时的实际日期）与 verification-log 锚点 `M3.5-A Manifest Single Source`。
2. `docs/verification-log.md` 顶部追加一条记录，标题 `## YYYY-MM-DD` + `### M3.5-A Manifest Single Source`，至少包含：
   - **Change set**：列出本切片关键改动；必须显式提到 approval / report contract 目录被拆分为 events.ts + permissions.ts + platform-manifest.ts，与 presence 一致。
   - **Verification**：
     - 6 条命令的实际结果（pass / fail / skipped）。
     - §6.2.a 静态断言的 6 个数字逐一复述。
     - §6.2.b 数据库断言：本机有 PostgreSQL 时贴 SQL 实际输出；无则写 "本机无 PostgreSQL，依赖 CI verify job 兜底" 并显式列出 §4.10 的 vitest 用例已覆盖等价断言。
     - §6.3 幂等性手测：本机有 PostgreSQL 时贴第二次 `pnpm db:seed` 的输出；无则记为 "依赖 CI"。
   - **Follow-up**：下一切片 `M3.5-B ADR-0003 Gateway 边界`。
3. `docs/module-contract.md` 第 2 节 "Manifest" 必须包含以下段落（位置紧跟"M2-2 起..."段之后）：

   > 各业务模块的 `ModuleManifestDto` 由自身 contract 包导出（参见 `modules/<module>/contract/src/platform-manifest.ts`），平台模块自身由 `apps/platform-api/src/seeds/platform-module-manifest.ts` 提供。`status='disabled'` 的模块只 upsert 到 `platform.module_manifests`，不下发权限点或菜单。

## 8. 提交规范

按 Conventional Commits 单次提交。使用显式 `git add <files>` 列出本切片产物，**不要**用 `git add -A` / `git add .`。

**包含**在本次 commit 内的文件（按 git status 分类）：

modified:
- `apps/platform-api/package.json`
- `apps/platform-api/src/platform-api.e2e-spec.ts`
- `apps/platform-api/src/platform-api.postgres.e2e-spec.ts`
- `apps/platform-api/src/seeds/seed-data.spec.ts`
- `apps/platform-api/src/seeds/seed-data.ts`
- `docs/foundation-progress.md`
- `docs/module-contract.md`
- `docs/verification-log.md`
- `modules/approval/contract/package.json`
- `modules/approval/contract/src/index.ts`
- `modules/presence/contract/package.json`
- `modules/presence/contract/src/index.ts`
- `modules/report/contract/package.json`
- `modules/report/contract/src/index.ts`
- `pnpm-lock.yaml`

new:
- `apps/platform-api/src/seeds/platform-module-manifest.ts`
- `modules/approval/contract/src/events.ts`
- `modules/approval/contract/src/permissions.ts`
- `modules/approval/contract/src/platform-manifest.ts`
- `modules/presence/contract/src/platform-manifest.ts`
- `modules/report/contract/src/events.ts`
- `modules/report/contract/src/permissions.ts`
- `modules/report/contract/src/platform-manifest.ts`

**不要**包含：
- `docs/tasks/m3-5-a-manifest-single-source.md`（本任务包，由审查者维护）。
- `docs/doc-index.md`（入口注册由审查者另行提交）。
- `.tmp/` 或任何本地缓存。

Commit 模板：

```
chore: source module manifests from contract packages

Move presence / approval / report platform-side manifests into their
contract packages so seed-data has a single source of truth. Keep
approval and report disabled until their backends ship; disabled
manifests no longer publish permissions or menus into platform tables.

Refactor approval and report contract directories into per-concern
files (events.ts / permissions.ts / platform-manifest.ts) to match
the presence layout and avoid index/platform-manifest cycles.
```

## 9. 完成确认

在 PR/交付说明里列出：

- `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` / `pnpm build` 的结果。
- 本机是否跑了 `pnpm test:db` 与 `pnpm test:e2e:postgres`。若未跑写明原因。
- 在已 seed 过库上重跑 `pnpm db:seed` 的输出（应不报错、不重复）。
- 是否更新了三个文档段落，并附 commit hash。
