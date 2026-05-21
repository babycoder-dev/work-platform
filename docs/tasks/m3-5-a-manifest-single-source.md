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

2. **稳定 ID 不能动**。`ModuleManifestDto.id` 与 `MenuDto.id` 必须复用现有 seed 里的 UUID，以保持幂等：
   - `platform` 模块 manifest id：`00000000-0000-0000-0000-000000000201`
   - `presence` 模块 manifest id：`00000000-0000-0000-0000-000000000202`
   - `approval` 模块 manifest id：`00000000-0000-0000-0000-000000000203`
   - `report`  模块 manifest id：`00000000-0000-0000-0000-000000000204`
   - 菜单 id：platform/org `…0101`，platform/employees `…0102`，platform/roles `…0103`，presence/board `…0104`。
   - 唯一新增的菜单 id：presence/register 用 `00000000-0000-0000-0000-000000000105`。

3. **disabled 模块的语义**：`status='disabled'` 的 manifest 仍然 upsert 进 `platform.module_manifests`（这样运维能看到"模块已声明、未启用"），但它的权限点与菜单**不进入** `platform.permissions` 与 `platform.menus`。这条规则只在 seed 层实现，repository 层和 API 层不需要变更。

4. **平台模块 manifest 留在 platform-api**。平台自身（企业/组织/员工/角色/权限）不是业务模块，不应外迁；但应该从 `seed-data.ts` 拆出到独立文件，便于和外来 manifest 并列。

5. **不引入新的 npm 依赖**，所有改动只调整 workspace 包之间的 import。

6. **不改运行时代码、不改迁移、不改 contract 类型**。本切片只动 seed 与 contract 数据。

7. **必须与 M4-0 RFC 对齐**：presence 在 `modules/presence/contract` 中导出的平台 manifest 必须包含所有 3 个权限点（含 `status:manage`）和 2 个菜单（board、register），路径、权限绑定、模块名都与 `docs/rfc/m4-presence-mvp.md` §5、§6 一致。

## 4. 文件清单与具体改动

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
import { approvalPermissions } from './index';

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
import { reportPermissions } from './index';

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

末尾追加：

```ts
export * from './platform-manifest';
```

### 4.5 修改：`modules/approval/contract/src/index.ts`

末尾追加：

```ts
export * from './platform-manifest';
```

### 4.6 修改：`modules/report/contract/src/index.ts`

末尾追加：

```ts
export * from './platform-manifest';
```

### 4.7 修改：`modules/presence/contract/package.json`、`modules/approval/contract/package.json`、`modules/report/contract/package.json`

在 `dependencies` 加入：

```json
"@work/platform-contract": "workspace:*"
```

按字母序插入，保持现有缩进与字段顺序。三个包都要改。

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

按顺序执行，全部必须通过：

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

如果本机有 PostgreSQL，追加：

```powershell
$env:RUN_POSTGRES_E2E="true"
$env:DATABASE_URL="postgresql://work:work@localhost:5432/work_platform"
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="admin123"
pnpm db:setup
pnpm test:db
pnpm test:e2e:postgres
```

如果本机起不来 PostgreSQL，必须在交付说明里写明，依赖 CI 的 verify job 跑这两条；不允许跳过。

幂等性手测：在已经 seed 过的库上再跑一次 `pnpm db:seed`，不应出现唯一约束错误或重复行。

## 7. 完成后更新的文档

1. `docs/foundation-progress.md`
   - 在 §6 "当前下一步" 末尾追加：本切片完成后，下一步为 `M3.5-B ADR-0003 Gateway 边界`。
   - 在 "M3.5 收口切片" 小节里把 3.5-A 标为 Done，并写明完成时间与 verification-log 锚点。
2. `docs/verification-log.md`
   - 追加一条 verification 记录，包含执行的命令、结果、PostgreSQL E2E 是否本机跑过、`pnpm db:seed` 幂等性手测结果。
3. `docs/module-contract.md`
   - 第 2 节 "Manifest" 末尾追加：

     > 各业务模块的 `ModuleManifestDto` 由自身 contract 包导出（参见 `modules/<module>/contract/src/platform-manifest.ts`），平台模块自身由 `apps/platform-api/src/seeds/platform-module-manifest.ts` 提供。`status='disabled'` 的模块只 upsert 到 `platform.module_manifests`，不下发权限点或菜单。

## 8. 提交规范

按 Conventional Commits 单次提交：

```
chore: source module manifests from contract packages

Move presence / approval / report platform-side manifests into their
contract packages so seed-data has a single source of truth. Keep
approval and report disabled until their backends ship; disabled
manifests no longer publish permissions or menus into platform tables.
```

## 9. 完成确认

在 PR/交付说明里列出：

- `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` / `pnpm build` 的结果。
- 本机是否跑了 `pnpm test:db` 与 `pnpm test:e2e:postgres`。若未跑写明原因。
- 在已 seed 过库上重跑 `pnpm db:seed` 的输出（应不报错、不重复）。
- 是否更新了三个文档段落，并附 commit hash。
