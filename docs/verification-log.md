# Verification Log

## 2026-05-23

### M3.5-C Login Failure Audit and Lockout

Change set:

- Replaced `PlatformRepository.validatePassword` with `findLocalIdentityByAccount` and `updateLocalIdentitySecurityState`; PostgreSQL and memory implementations now expose the same local identity security-state boundary.
- Rewrote `AuthService.login` to check active lockout before password verification, audit disabled/locked/wrong-password attempts, update failed-attempt counters, lock for 15 minutes after 5 failures, reset counters on success, and keep unknown accounts unaudited.
- Added `lockDurationMinutes` to `PasswordPolicyDto` and `getPasswordPolicy()`.
- Expanded `auth.service.spec.ts`, memory store tests, PostgreSQL repository integration tests, memory E2E, and PostgreSQL E2E for lockout and local identity state.
- Updated `docs/security-baseline.md` §3.2/§3.4/§15, `docs/platform-core.md` §3.2, and `docs/foundation-progress.md` §6/§6.1.

Verification:

- `pnpm install`: pass. Workspace already up to date; pnpm emitted a non-fatal metadata fetch warning through `127.0.0.1:10808`.
- `pnpm lint`: pass. Existing Nx ProjectGraph warnings remain; existing unused-parameter warnings remain in `modules/presence/api/src/status/presence-status.service.ts` and `apps/workbench-shell/src/module-registry/load-remote-module.ts`.
- `pnpm typecheck`: pass.
- `pnpm test`: pass. 12 files / 52 tests passed; PostgreSQL integration tests skipped in the normal unit run.
- `pnpm test:e2e`: pass. Memory E2E 14 tests passed; PostgreSQL E2E skipped in the normal E2E run.
- `pnpm build`: pass.
- PostgreSQL path: `$env:DATABASE_URL='postgresql://work:work@localhost:5432/work_platform'; pnpm db:setup` failed locally with PostgreSQL password authentication failure for user `work`; Docker Desktop engine was not running, so `pnpm test:db` and `pnpm test:e2e:postgres` were not run locally and remain CI-covered.
- `auth.service.spec.ts`用例数：6 -> 14。
- §6.2 assertion 1: `auth.service.spec.ts` increased from 6 to 14 tests and all passed.
- §6.2 assertion 2: `auth.service.spec.ts` test `rejects locked accounts before checking the password` and memory E2E test `locks after five wrong passwords and rejects the correct password while locked` verify that a correct password during lockout still returns 401 with the lockout message.
- §6.2 assertion 3: `auth.service.spec.ts` test `resets the failed-attempt base after an expired lock` verifies `failedAttempts: 1` rather than 6 after an expired lock.
- §6.2 assertion 4: `auth.service.spec.ts` test `does not write audit logs for unknown accounts` verifies unknown accounts do not call `recordAuditLog`.
- §6.2 assertion 5: `auth.service.spec.ts` test `returns the lock duration in the password policy` verifies `lockDurationMinutes: 15`.

Follow-up:

- M3.5-D 首次登录改密 + 管理员重置密码端点。

### M3.5-B2 Phantom Token ADR

Change set:

- Added `docs/adr/0004-cross-process-auth-phantom-token.md` to record the accepted Phantom Token cross-process authentication decision.
- Added `docs/security-baseline.md` §4.4 for cross-process authentication: external opaque token, `/auth/me` introspection, M4-M6 in-process identity injection, and M7 internal short-lived JWT.
- Added `docs/platform-core.md` §3.1 to document `GET /api/platform/auth/me` as the introspection entry for gateway and business services.
- Updated `docs/foundation-progress.md` so M3.5-B2 is Done and the next slice is M3.5-C 登录失败审计 + 锁定策略落地.

Verification:

- `git status --short` confirmed this slice changes only the 5 intended `.md` files; the untracked task package `docs/tasks/m3-5-b2-adr-phantom-token.md` is intentionally excluded from the commit.
- §6.2 A1: ADR status is `Accepted`.
- §6.2 A2: ADR background records that gateway has no `platform` database connection and needs a cross-process token verification mode.
- §6.2 A3: ADR decision 1 keeps the external token opaque instead of JWT and cites immediate revocation under security-baseline §4.1.
- §6.2 A4: ADR decision 2 reuses `GET /api/platform/auth/me` for introspection and does not add a new endpoint.
- §6.2 A5: ADR decision 3 phases M4-M6 as introspection plus in-process identity injection, and M7 as short-lived internal JWT.
- §6.2 A6: ADR decision 4 allows introspection caching with TTL no more than 60 seconds.
- §6.2 A7: ADR decision 5 forbids business modules from directly connecting to the `platform` database to verify tokens.
- §6.2 A8: ADR relationship section references ADR-0003, security-baseline §4, and platform-core §3.
- §6.2 A9: ADR implementation timing states the M4-M6 guard lands with M4-2, the internal JWT lands with M7, and this ADR requires no immediate code changes.
- §6.2 B10: `docs/security-baseline.md` §4.4 matches the ADR decision and keeps §4.1/§4.2/§4.3 and §5 numbering intact.
- §6.2 B11: `docs/platform-core.md` §3.1 documents `/auth/me` introspection and references ADR-0004.

Follow-up:

- M3.5-C 登录失败审计 + 锁定策略落地。

## 2026-05-22

### M3.5-B Gateway Boundary ADR

Change set:

- Added `docs/adr/0003-gateway-boundary.md` to record the accepted gateway boundary decision.
- Updated the two gateway descriptions in `docs/architecture.md` so M4-M6 is described as an API composition host and M7+ as a thin edge gateway.
- Added the M7 business-service split deliverable to `docs/foundation-blueprint.md`.
- Updated `docs/foundation-progress.md` so the next slice is M3.5-B2 ADR-0004 Phantom Token.

Verification:

- `git status --short` / tracked diff confirmed this slice changes only the 5 intended `.md` files; the untracked task package `docs/tasks/m3-5-b-adr-gateway-boundary.md` is intentionally excluded from the commit.
- §6.2 A1: ADR status is `Accepted`.
- §6.2 A2: ADR background records the drift between in-process implementation and reverse-proxy style documentation.
- §6.2 A3: ADR decision 1 states M4-M6 gateway-api is an API composition host with embedded business modules.
- §6.2 A4: ADR decision 2 keeps platform-api as a separate process and gives both data-boundary and security-boundary reasons.
- §6.2 A5: ADR decision 3 states M7 splits embedded modules into standalone services plus a thin edge gateway.
- §6.2 A6: ADR decision 4 hard-binds the split trigger to the M7 milestone.
- §6.2 A7: ADR includes "内嵌不等于可以走捷径" and restates constitution §8 module-boundary rules.
- §6.2 A8: ADR relationship section references ADR-0004 and constitution §11 `/api/v1` versioning.
- §6.2 B9: `docs/foundation-blueprint.md` M7 deliverables now include the embedded business-module split, matching ADR-0003 decision 3.
- §6.2 B10: `docs/architecture.md` section 1 and section 3 both describe the updated gateway boundary and reference `docs/adr/0003-gateway-boundary.md`.

Follow-up:

- M3.5-B2 ADR-0004 跨进程鉴权（Phantom Token）。
### M3.5-A Manifest Single Source

Change set:

- Moved presence / approval / report platform-side `ModuleManifestDto` definitions into their contract packages.
- Added platform-owned `platformModuleManifest` under `apps/platform-api/src/seeds/platform-module-manifest.ts`.
- Changed `seed-data.ts` so `platform.module_manifests` receives active and disabled manifests, while permissions and menus are derived only from active manifests.
- Kept approval and report manifests disabled until their backends ship.
- Added the presence `presence:status:manage` permission and `/presence/register` menu to the platform-side presence manifest.
- approval / report contract 目录在本切片被拆分为 events.ts + permissions.ts + platform-manifest.ts，与 presence 的 contract 目录结构保持一致，并避免 `index` / `platform-manifest` 循环依赖。

Verification:

- `pnpm install`: pass. Workspace already up to date; pnpm emitted a non-fatal registry metadata warning while checking pnpm update metadata.
- `pnpm lint`: pass. Existing Nx ProjectGraph warnings and existing unused-parameter warnings remain.
- `pnpm typecheck`: pass.
- `pnpm test`: pass. 12 files / 43 tests passed; PostgreSQL integration tests skipped in the normal unit run.
- `pnpm test:e2e`: pass. Memory E2E 13 tests passed; PostgreSQL E2E skipped in the normal E2E run.
- `pnpm build`: pass.

Static assertions from seed data:

- `platformModuleManifests.length === 4` (`platform`, `presence`, `approval`, `report`).
- Disabled modules are `['approval', 'report']`.
- `platformSeedPermissions.length === 11` (`platform` 8 + `presence` 3).
- `platformSeedPermissions` contains no `approval:*` or `report:*` permission codes.
- `platformSeedMenus.length === 5` (`platform` 3 + `presence` 2).
- `platformSeedMenus` contains both `/presence/board` and `/presence/register`.

The equivalent static behavior is covered by `apps/platform-api/src/seeds/seed-data.spec.ts`, especially the §4.10 vitest case `only derives permissions and menus from active manifests`.

PostgreSQL verification:

- Local PostgreSQL was available through Docker at `localhost:55432`.
- The previous local compose volume was reset before this verification so the SQL assertions describe the fresh M3.5-A seed state.
- `pnpm db:setup`: pass. Migration `0000_init_platform.sql` applied and seed returned `permissionCount=11`.
- `pnpm test:db`: pass with `RUN_POSTGRES_INTEGRATION=true`; 6 tests passed.
- `pnpm test:e2e:postgres`: pass with `RUN_POSTGRES_E2E=true`; 2 tests passed.

```sql
SELECT module_name, count(*) FROM platform.permissions GROUP BY module_name ORDER BY module_name;
```

```text
 module_name | count
-------------+-------
 platform    |     8
 presence    |     3
```

```sql
SELECT module_name, count(*) FROM platform.menus GROUP BY module_name ORDER BY module_name;
```

```text
 module_name | count
-------------+-------
 platform    |     3
 presence    |     2
```

```sql
SELECT module_name, status FROM platform.module_manifests ORDER BY module_name;
```

```text
 module_name |  status
-------------+----------
 approval    | disabled
 platform    | active
 presence    | active
 report      | disabled
```

Idempotency:

- Reran `pnpm db:seed` against the already seeded fresh database: pass.

```text
Seeded platform foundation: {"adminPasswordUpdated":false,"adminRoleId":"00000000-0000-0000-0000-000000000004","adminUserId":"00000000-0000-0000-0000-000000000003","departmentId":"00000000-0000-0000-0000-000000000002","enterpriseId":"00000000-0000-0000-0000-000000000001","permissionCount":11}
```

- Reran the three §6.2.b SQL assertions after the second seed; the permission count, menu count and manifest status outputs remained unchanged.

Follow-up:

- M3.5-B ADR-0003 Gateway 边界。

## 2026-05-21

### M3.5-A Manifest Single Source

Change set:

- Moved presence / approval / report platform-side `ModuleManifestDto` definitions into their contract packages.
- Added platform-owned `platformModuleManifest` under `apps/platform-api/src/seeds/platform-module-manifest.ts`.
- Changed `seed-data.ts` so `platform.module_manifests` still receives active and disabled manifests, while permissions and menus are derived only from active manifests.
- Kept approval and report manifests disabled until their backends ship.
- Added the presence `presence:status:manage` permission and `/presence/register` menu to the platform-side presence manifest.
- Updated E2E assertions for the new presence registration menu and active-only module manifest API behavior.
- Updated module contract and foundation progress documentation for the manifest source rule.

Implementation note:

- The task package originally described importing approval/report permissions from `./index` inside their `platform-manifest.ts` files. That created an ESM circular initialization failure during `pnpm db:setup`. The final implementation splits approval/report permissions and events into dedicated files, keeps the package-root exports unchanged, and imports platform manifests from those non-circular files.

Verification:

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='admin123'
pnpm db:setup
$env:RUN_POSTGRES_INTEGRATION='true'
pnpm test:db
$env:RUN_POSTGRES_E2E='true'
pnpm test:e2e:postgres
pnpm db:seed
```

Result:

- `pnpm install` passed and updated `pnpm-lock.yaml` for new workspace dependencies.
- `pnpm lint` passed after rerunning outside the sandbox; it emitted existing Nx ProjectGraph warnings and existing unused-variable warnings only.
- `pnpm typecheck` passed.
- `pnpm test` passed: 12 files / 43 tests, with PostgreSQL integration tests skipped in the normal unit run.
- `pnpm test:e2e` passed: memory E2E 13 tests, with PostgreSQL E2E skipped in the normal E2E run.
- `pnpm build` passed.
- Local PostgreSQL verification was executed against Docker PostgreSQL on `localhost:55432`.
- `pnpm db:setup` passed after the circular manifest import was fixed; result permission count is 11.
- `pnpm test:db` passed with `RUN_POSTGRES_INTEGRATION=true`: 6 tests.
- `pnpm test:e2e:postgres` passed with `RUN_POSTGRES_E2E=true`: 2 tests. The local already-seeded database required a one-time `PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD=true pnpm db:seed` before this check because the existing admin password did not match `admin123`.
- Idempotency check passed: rerunning `pnpm db:seed` on the already seeded database completed without unique constraint errors or duplicate row failures and returned `adminPasswordUpdated=false`, `permissionCount=11`.

## 2026-05-21

### M4 Presence MVP RFC

Change set:

- Added `docs/rfc/m4-presence-mvp.md` for the first real business module milestone.
- Added `docs/domain-glossary.md` to define shared platform and business terminology before M4 implementation.
- Updated `docs/doc-index.md` with the M4 reading path and glossary responsibility.
- Updated `docs/foundation-progress.md` to enter M4 and set M4-1 as the next implementation slice.

Review focus:

- Presence module must keep independent contract/API/Web/repository/schema boundaries.
- Presence module must use Platform Core for login, permissions, menus, data scope and audit.
- M4 implementation must replace current mock user and in-memory array behavior before production paths are accepted.

Result:

- M4-0 documentation slice completed.
- Next slice is M4-1: presence contract, schema and repository.

## 2026-05-21

### M3 Browser Smoke Verification

Scope:

- Started Workbench Shell locally at `http://127.0.0.1:5173/`.
- Stopped the previously running compose `platform-api` container that occupied port `3001`.
- Started the current `platform-api` source with `PLATFORM_REPOSITORY_DRIVER=memory` on port `3001`.
- Used the browser automation session to verify the Shell against the current source tree.

Verification:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/platform/health
Invoke-WebRequest http://127.0.0.1:5173
POST http://127.0.0.1:3001/api/platform/auth/login
```

Browser checks:

- Login with `admin/admin123` succeeded against the memory repository.
- Shell loaded current user `系统管理员` and rendered four authorized menus from Platform Core.
- `/platform/org` rendered the mounted organization placeholder page.
- `/platform/employees` rendered the mounted employee management placeholder page.
- `/platform/roles` rendered the mounted role-permission placeholder page.
- `/presence/board` rendered the mounted presence board placeholder page.
- `/missing` rendered the unknown route state.
- Direct access to `/platform/org` after logout returned to the login view.

Result:

- M3 browser-level smoke passed.
- M3 Web Shell 可用基座 can be treated as complete.
- Local smoke processes were stopped after verification, and the compose `platform-api` service was restored with host port `3001` mapped.

## 2026-05-21

### M3 Platform Management Placeholder Routes

Change set:

- Added `@work/platform-web` as a mounted platform management Web module.
- Registered platform routes for `/platform/org`, `/platform/employees`, and `/platform/roles`.
- Added lightweight platform management placeholder pages for organization, employee, and role-permission management.
- Registered `platformWebModule` in Workbench Shell so Platform Core menus resolve to mounted routes.
- Updated Workbench navigation tests for mounted platform management routes.
- Updated the foundation progress board for M3-2.

Verification:

```powershell
pnpm install --lockfile-only
pnpm install
pnpm --filter @work/platform-web typecheck
pnpm --filter @work/platform-web lint
pnpm --filter @work/workbench-shell typecheck
pnpm --filter @work/workbench-shell lint
pnpm test -- apps/workbench-shell/src/app/navigation.spec.ts
pnpm --filter @work/workbench-shell build
pnpm verify
$env:NPM_REGISTRY='https://registry.npmmirror.com'
docker compose --progress plain -f infra/docker-compose.prod.yml build
```

Result:

- Lockfile and local workspace links were updated for `@work/platform-web`.
- Platform Web typecheck and lint passed.
- Workbench Shell typecheck and lint passed; only existing Nx ProjectGraph and `_descriptor` warnings were emitted.
- Workbench navigation unit tests passed with 4 tests.
- Workbench Shell production build passed and emitted platform placeholder page chunks.
- `pnpm verify` passed.
- Docker Compose production build passed with `NPM_REGISTRY=https://registry.npmmirror.com`.

## 2026-05-21

### M3 Shell Route State Handling

Change set:

- Added route resolution states for Web Shell home, loadable module pages, forbidden direct access, platform menus without mounted pages, and unknown paths.
- Updated Web Shell content rendering so unimplemented platform menus no longer fall back to the generic home panel.
- Added a module loading state and a dedicated module load failure state.
- Extended Workbench navigation unit tests for route state resolution.
- Updated the foundation progress board to close M2 and track M3-1.

Verification:

```powershell
pnpm --filter @work/workbench-shell typecheck
pnpm --filter @work/workbench-shell lint
pnpm test -- apps/workbench-shell/src/app/navigation.spec.ts
pnpm --filter @work/workbench-shell build
pnpm verify
$env:NPM_REGISTRY='https://registry.npmmirror.com'
docker compose --progress plain -f infra/docker-compose.prod.yml build
```

Result:

- Workbench Shell typecheck passed.
- Workbench Shell lint passed; only existing Nx ProjectGraph and `_descriptor` warnings were emitted.
- Workbench navigation unit tests passed with 3 route-state tests.
- Workbench Shell production build passed.
- `pnpm verify` passed after the route-state error cleanup fix.
- Docker Compose production build passed after the final route-state error cleanup fix with `NPM_REGISTRY=https://registry.npmmirror.com`.

## 2026-05-20

### M2 Web Shell Platform Menu Consumption

Change set:

- Added `GET /api/platform/auth/me` for access-token based current user recovery.
- Updated Web Shell to login through Platform Core, persist access token, load current user, and render navigation from `GET /api/platform/menus/my`.
- Added route permission matching so local module routes are loaded only when current user permissions allow them.
- Added Workbench navigation unit tests.
- Added Vite dev proxy and Nginx production proxy for `/api/platform`.
- Updated Platform Core docs, M2 RFC, and foundation progress.

Verification:

```powershell
pnpm install --lockfile-only
pnpm install
pnpm --filter @work/platform-api typecheck
pnpm --filter @work/workbench-shell typecheck
pnpm --filter @work/workbench-shell lint
pnpm test -- apps/workbench-shell/src/app/navigation.spec.ts
pnpm test:e2e
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_INTEGRATION='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'
pnpm test:db
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_E2E='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'; Remove-Item Env:\PLATFORM_REPOSITORY_DRIVER -ErrorAction SilentlyContinue
pnpm test:e2e:postgres
pnpm verify
$env:NPM_REGISTRY='https://registry.npmmirror.com'
docker compose --progress plain -f infra/docker-compose.prod.yml build
docker builder prune -f
$env:NPM_REGISTRY='https://registry.npmmirror.com'
docker compose --progress plain -f infra/docker-compose.prod.yml build
```

Result:

- Lockfile and workspace install completed after adding Workbench Shell dependencies on `@work/http-client` and `@work/platform-contract`.
- Platform API and Workbench Shell typechecks passed.
- Workbench Shell lint passed; only existing Nx ProjectGraph and `_descriptor` warnings were emitted.
- Workbench navigation unit tests passed.
- Memory E2E passed, including `GET /api/platform/auth/me`.
- PostgreSQL repository integration passed.
- PostgreSQL E2E passed, including access-token current user recovery.
- `pnpm verify` passed.
- First Docker Compose production build after the frontend URL fix failed while exporting the Workbench image because Docker Desktop had a stale BuildKit snapshot (`parent snapshot ... does not exist`), not because the app build failed.
- `docker builder prune -f` cleared the local builder cache.
- Docker Compose production build then passed with `NPM_REGISTRY=https://registry.npmmirror.com`.

## 2026-05-19

### M2 Platform Write Audit Coverage

Change set:

- Added shared request audit context extraction for authenticated Platform API requests.
- Added `account` to `CurrentUserDto` so platform write audits can record actor account.
- Added audit writes for department creation, employee creation, employee status updates, employee role assignment, and role creation.
- Added memory E2E and PostgreSQL E2E coverage for platform write audit actions and request context propagation.
- Updated Platform Core docs, M2 RFC, and foundation progress.

Verification:

```powershell
pnpm --filter @work/platform-contract typecheck
pnpm --filter @work/platform-api typecheck
pnpm --filter @work/platform-api lint
pnpm test -- apps/platform-api/src/audit/platform-write-audit.spec.ts
pnpm test -- apps/platform-api/src/auth/auth.service.spec.ts apps/platform-api/src/store/platform-memory.store.spec.ts
pnpm test:e2e
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_INTEGRATION='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'
pnpm test:db
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_E2E='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'; Remove-Item Env:\PLATFORM_REPOSITORY_DRIVER -ErrorAction SilentlyContinue
pnpm test:e2e:postgres
pnpm verify
$env:NPM_REGISTRY='https://registry.npmmirror.com'
docker compose --progress plain -f infra/docker-compose.prod.yml build
```

Result:

- Platform contract and Platform API typechecks passed.
- Platform API lint passed; only existing Nx ProjectGraph boundary warnings were emitted.
- Platform write audit service tests passed, including audit failure propagation.
- Targeted auth and memory store unit tests passed.
- Memory E2E passed, including platform write audit assertions.
- PostgreSQL repository integration passed.
- PostgreSQL E2E passed, including department, role, employee, status, and role-assignment audit persistence.
- `pnpm verify` passed.
- First Docker build attempt hit a transient Docker Hub metadata EOF for `node:22-bookworm-slim`; retry passed with `NPM_REGISTRY=https://registry.npmmirror.com`.

## 2026-05-19

### M2 Module Manifest Registration

Change set:

- Added `ModuleManifestDto` to the platform contract.
- Made platform seed permissions and menus derive from `platformModuleManifests`.
- Seeded `platform.module_manifests` idempotently before permissions and menus.
- Added repository support for listing active module manifests in memory and PostgreSQL implementations.
- Added `GET /api/platform/module-manifests`, protected by `platform:permission:view`.
- Updated module contract, Platform Core docs, M2 RFC, and foundation progress.

Verification:

```powershell
pnpm --filter @work/platform-contract typecheck
pnpm --filter @work/platform-api lint
pnpm --filter @work/platform-api typecheck
pnpm test -- apps/platform-api/src/seeds/seed-data.spec.ts apps/platform-api/src/store/platform-memory.store.spec.ts apps/platform-api/src/auth/auth.service.spec.ts
pnpm test:e2e
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_INTEGRATION='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'
pnpm test:db
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_E2E='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'; Remove-Item Env:\PLATFORM_REPOSITORY_DRIVER -ErrorAction SilentlyContinue
pnpm test:e2e:postgres
pnpm verify
$env:NPM_REGISTRY='https://registry.npmmirror.com'
docker compose --progress plain -f infra/docker-compose.prod.yml build
```

Result:

- Platform contract and Platform API typechecks passed.
- Platform API lint passed; only existing Nx ProjectGraph boundary warnings were emitted.
- Seed data tests passed, including manifest-derived permissions and menus.
- Memory E2E passed, including module manifest API authorization.
- PostgreSQL repository integration passed, including active module manifest listing.
- PostgreSQL E2E passed.
- `pnpm verify` passed.
- Full production Docker Compose build passed with `NPM_REGISTRY=https://registry.npmmirror.com`.
- Self-review found no P2 or higher issues. Runtime manifest writes remain intentionally out of scope until validation, signing/review, and package verification are designed.

## 2026-05-19

### M2 Review Follow-up

Change set:

- Fixed disabled roles contributing permissions to `CurrentUserDto`.
- Added login audit context propagation for trace id, client IP, and user agent.
- Added tests for disabled role permission filtering, audit write failure, `/menus/my` 401, and PostgreSQL audit context persistence.
- Marked pre-manifest business-module permissions as M2-1 placeholders.
- Moved `setUserRoles` employee lookup into the same PostgreSQL transaction as role replacement.
- Updated M2 RFC, Platform Core docs, and foundation progress.

Verification:

```powershell
pnpm --filter @work/platform-api lint
pnpm --filter @work/platform-api typecheck
pnpm test -- apps/platform-api/src/auth/auth.service.spec.ts
pnpm test:e2e
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_INTEGRATION='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'
pnpm test:db
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_E2E='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'; Remove-Item Env:\PLATFORM_REPOSITORY_DRIVER -ErrorAction SilentlyContinue
pnpm test:e2e:postgres
pnpm verify
$env:NPM_REGISTRY='https://registry.npmmirror.com'
docker compose --progress plain -f infra/docker-compose.prod.yml build
```

Result:

- Platform API lint and typecheck passed.
- Auth service tests passed, including disabled role filtering and audit failure propagation.
- Memory E2E passed, including `/menus/my` 401 coverage.
- PostgreSQL repository integration passed.
- PostgreSQL E2E passed, including audit trace id, IP, and user agent persistence.
- `pnpm verify` passed.
- Full production Docker Compose build passed with `NPM_REGISTRY=https://registry.npmmirror.com`.

## 2026-05-18

### M2 Permission Menu Audit Start

Change set:

- Added M2 RFC for permission, menu, and audit closure.
- Added menu and audit contract DTOs.
- Seeded first platform menus.
- Added `GET /api/platform/menus/my`, filtered by current user permissions.
- Added repository support for permission-filtered menus and audit log writes.
- Added successful login audit writes.
- Updated Platform Core docs and progress tracker for M2.

Verification:

```powershell
pnpm --filter @work/platform-api lint
pnpm --filter @work/platform-api typecheck
pnpm --filter @work/platform-contract typecheck
pnpm test -- apps/platform-api/src/auth/auth.service.spec.ts apps/platform-api/src/store/platform-memory.store.spec.ts apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts
pnpm test:e2e
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_INTEGRATION='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'
pnpm test:db
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_E2E='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'; Remove-Item Env:\PLATFORM_REPOSITORY_DRIVER -ErrorAction SilentlyContinue
pnpm test:e2e:postgres
pnpm verify
$env:NPM_REGISTRY='https://registry.npmmirror.com'
docker compose -f infra/docker-compose.prod.yml build --progress plain
```

Result:

- Platform API lint passed; only the existing Nx ProjectGraph boundary warnings were emitted.
- Platform API and platform contract typechecks passed.
- Targeted auth, memory store, and repository tests passed; repository integration tests were also executed against PostgreSQL through `pnpm test:db`.
- Memory E2E passed: admin sees allowed menus and a limited user receives an empty menu list.
- PostgreSQL E2E passed: seed admin sees seed menus and successful login writes `platform.audit_logs`.
- `pnpm verify` passed.
- Full production Docker Compose build passed with `NPM_REGISTRY=https://registry.npmmirror.com`.

## 2026-05-18

### Default PostgreSQL Repository Switch

Change set:

- Changed `platform-api` repository driver default from `memory` to `postgres`.
- Kept `PlatformMemoryStore` as an explicit test/local fallback through `PLATFORM_REPOSITORY_DRIVER=memory`.
- Updated memory E2E to opt into the memory repository explicitly.
- Updated PostgreSQL E2E to prove the unset driver path uses PostgreSQL by default.
- Updated Platform Core docs, M1 RFC status, README, foundation progress, and Compose smoke documentation.
- Added configurable `PLATFORM_API_HOST_PORT` for direct platform-api deployment smoke.

Completed locally:

```powershell
pnpm test -- apps/platform-api/src/repositories/repository-driver.config.spec.ts
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_E2E='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'; Remove-Item Env:\PLATFORM_REPOSITORY_DRIVER -ErrorAction SilentlyContinue
pnpm test:e2e:postgres
pnpm test:e2e
$env:RUN_POSTGRES_INTEGRATION='true'
pnpm test:db
pnpm verify
docker compose -f infra/docker-compose.prod.yml config --quiet
$env:NPM_REGISTRY='https://registry.npmmirror.com'; docker compose -f infra/docker-compose.prod.yml build platform-api --progress plain
$env:POSTGRES_HOST_PORT='55432'; $env:PLATFORM_API_HOST_PORT='3001'; docker compose -f infra/docker-compose.prod.yml up -d postgres platform-api
Invoke-RestMethod http://localhost:3001/api/platform/health
$env:NPM_REGISTRY='https://registry.npmmirror.com'; docker compose -f infra/docker-compose.prod.yml build --progress plain
```

Result:

- Repository driver config tests passed: default is PostgreSQL, memory remains explicit fallback.
- PostgreSQL E2E passed with `PLATFORM_REPOSITORY_DRIVER` unset.
- Memory E2E passed with explicit `PLATFORM_REPOSITORY_DRIVER=memory`.
- PostgreSQL repository integration passed.
- `pnpm verify` passed.
- Compose config validation passed.
- First platform-api image build attempt hit transient `ECONNRESET` against the default npm registry; retry with `NPM_REGISTRY=https://registry.npmmirror.com` passed.
- Compose platform-api smoke passed: `GET /api/platform/health` returned `{"status":"ok","service":"platform-api"}`.
- Full production Docker Compose build passed with `NPM_REGISTRY=https://registry.npmmirror.com`.

## 2026-05-17

### Compose PostgreSQL Volume Reset And Port Override

Change set:

- Reset local Compose PostgreSQL volume after approval.
- Made PostgreSQL and Redis host ports configurable through `POSTGRES_HOST_PORT` and `REDIS_HOST_PORT`.
- Reduced `infra/postgres/init.sql` to schema creation only so application migrations own platform table definitions.
- Documented host port overrides in deployment docs and `.env.prod.example`.

Completed locally:

```powershell
docker compose -f infra/docker-compose.prod.yml down -v
$env:POSTGRES_HOST_PORT='55432'; docker compose -f infra/docker-compose.prod.yml up -d postgres
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'
pnpm db:setup
$env:RUN_POSTGRES_E2E='true'; $env:PLATFORM_REPOSITORY_DRIVER='postgres'
pnpm test:e2e:postgres
$env:RUN_POSTGRES_INTEGRATION='true'
pnpm test:db
docker compose -f infra/docker-compose.prod.yml config --quiet
docker compose -f infra/docker-compose.prod.yml build --progress plain
```

Result:

- Fresh Compose PostgreSQL published successfully on `localhost:55432`.
- `pnpm db:setup` applied `0000_init_platform.sql` and seeded platform foundation successfully.
- PostgreSQL E2E passed: 1 file, 2 tests.
- PostgreSQL repository integration passed: 1 file, 4 tests.
- Docker Compose config validation passed.
- Production Docker Compose build passed after cache reuse.
- A parallel local run of `test:db` and PostgreSQL E2E against the same database produced a Vitest worker exit; both commands passed when run sequentially.

## 2026-05-17

### Repository Error Mapping And DB Integration Gate

Change set:

- Added PostgreSQL error mapping for unique and foreign-key violations.
- Wrapped PostgreSQL repository write paths so raw database constraint errors become platform `ApiError` values.
- Added unit coverage for the PostgreSQL error mapper.
- Added PostgreSQL repository integration coverage for employee creation, role creation, role assignment, session persistence, duplicate resources, foreign-key references, and transaction rollback.
- Added `pnpm test:db` and wired it into GitHub Actions with `RUN_POSTGRES_INTEGRATION=true`.
- Updated M1 progress and RFC CI requirements.

Completed locally:

```powershell
pnpm test -- apps/platform-api/src/repositories/postgres-error.mapper.spec.ts apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts
pnpm --filter @work/platform-api typecheck
pnpm verify
pnpm test:db
docker run -d --rm --name work-platform-test-postgres -e POSTGRES_USER=work -e POSTGRES_PASSWORD=work -e POSTGRES_DB=work_platform -p 55432:5432 postgres:17
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'; $env:RUN_POSTGRES_INTEGRATION='true'; $env:NODE_ENV='production'; $env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'
pnpm test:db
```

Result:

- Targeted mapper unit tests passed.
- PostgreSQL integration spec is skipped locally unless `RUN_POSTGRES_INTEGRATION=true`.
- Platform API typecheck passed.
- `pnpm verify` passed.
- `pnpm test:db` command is present and skips locally without the integration env flag; CI runs it against the PostgreSQL service.
- Real PostgreSQL repository integration passed locally against a temporary `postgres:17` container on `localhost:55432` with `RUN_POSTGRES_INTEGRATION=true`.
- `docker compose -f infra/docker-compose.prod.yml up -d postgres` reached healthy state, but the existing persistent volume rejected the documented `work` password. The volume was not reset; this is local environment state, not an M1 code failure.

## 2026-05-17

### Lockfile And Document Review Follow-up

Change set:

- Added `pnpm-lock.yaml`.
- Changed GitHub Actions install to `pnpm install --frozen-lockfile`.
- Changed production Dockerfiles to copy `pnpm-lock.yaml` and run frozen lockfile installs.
- Added configurable Docker build registry through `NPM_REGISTRY`.
- Closed M1 RFC open questions as decided records.
- Aligned security baseline wording for current `scrypt` password hashing and future argon2id migration.
- Marked PostgreSQL-backed session storage as the M1 session target.
- Updated document gap milestones in `docs/doc-index.md`.
- Updated foundation progress for the lockfile hard gate.

Completed locally:

```powershell
pnpm install --lockfile-only --ignore-scripts --registry=https://registry.npmjs.org
pnpm install --frozen-lockfile
pnpm verify
$env:NPM_REGISTRY='https://registry.npmmirror.com'; pnpm docker:build
```

Result:

- `pnpm-lock.yaml` generated successfully.
- Frozen lockfile install passed.
- `pnpm verify` passed.
- Docker production build passed with `NPM_REGISTRY=https://registry.npmmirror.com`.
- Dockerfiles and Compose still default to `https://registry.npmjs.org/`; `NPM_REGISTRY` exists for controlled build environments that need an internal or regional mirror.

Coverage note:

- CI PostgreSQL E2E had already passed in the prior gate and remains the authoritative database E2E path for M1.
- Direct local PostgreSQL E2E via temporary Docker port mapping was not completed in this run because Docker Desktop did not publish Postgres host ports consistently on this machine, and direct container-IP connections were unstable. This is recorded as a local Docker Desktop networking issue, not an M1 exit blocker.
- Lint still reports existing warnings for skipped Nx ProjectGraph boundary checks and two underscore-prefixed unused parameters, but no lint errors.

## 2026-05-17

### Architecture Document Review Fixes

Change set:

- Aligned `constitution.md` milestone wording with `foundation-blueprint.md` M1-M3 exits.
- Clarified `platform.domain_events` as M1 table/schema and M2 active outbox behavior.
- Clarified notification and IM behavior before M7.
- Added API versioning, Qt license review, Windows 7 legacy build, token/session key, TLS, backup/restore, and database connection pool guidance.
- Added the architecture checklist to the PR template.
- Updated the foundation progress tracker.

Completed locally:

```bash
git diff --check
```

Result:

- Documentation diff passed whitespace checks.
- No code or runtime behavior changed in this slice.

## 2026-05-17

### CI PostgreSQL E2E Gate

Change set:

- Added `test:e2e:postgres` script for the PostgreSQL-backed Platform API E2E spec.
- Added PostgreSQL 17 service container to the GitHub Actions `verify` job.
- Added CI `pnpm db:setup` before verification.
- Added CI PostgreSQL E2E execution with `PLATFORM_REPOSITORY_DRIVER=postgres`.
- Updated the foundation progress tracker.

Local checks:

```powershell
$env:DATABASE_URL='postgresql://work:work@localhost:55434/work_platform'
$env:NODE_ENV='production'
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='ci-admin-password'
pnpm db:setup
$env:RUN_POSTGRES_E2E='true'
$env:PLATFORM_REPOSITORY_DRIVER='postgres'
pnpm test:e2e:postgres
```

Result:

- PostgreSQL setup passed against a temporary local PostgreSQL container.
- PostgreSQL E2E passed: 1 file, 2 tests.
- Temporary PostgreSQL container was removed after verification.
- This gate is expected to run in GitHub Actions on push to `main`.

## 2026-05-17

### Platform PostgreSQL Repository Toggle

Change set:

- Upgraded the Platform repository contract to async methods.
- Added `DbModule` and PostgreSQL pool provider for `platform-api`.
- Added `PostgresPlatformRepository` for enterprises, departments, employees, local identities, roles, permissions, user roles, and sessions.
- Added `PLATFORM_REPOSITORY_DRIVER` so local tests can keep using memory while production Compose selects PostgreSQL.
- Added optional PostgreSQL E2E smoke coverage with `RUN_POSTGRES_E2E=true`.
- Updated the foundation progress tracker.

Completed locally:

```bash
pnpm --filter @work/platform-api typecheck
pnpm test -- apps/platform-api/src/auth/auth.service.spec.ts apps/platform-api/src/store/platform-memory.store.spec.ts apps/platform-api/src/repositories/repository-driver.config.spec.ts
pnpm test:e2e
pnpm verify
pnpm docker:build
```

Database smoke test:

```powershell
docker run -d --name work-platform-pg-repo-test -e POSTGRES_USER=work -e POSTGRES_PASSWORD=work -e POSTGRES_DB=work_platform -p 55433:5432 postgres:15
$env:DATABASE_URL='postgresql://work:work@localhost:55433/work_platform'
$env:RUN_POSTGRES_E2E='true'
$env:PLATFORM_REPOSITORY_DRIVER='postgres'
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='admin123'
pnpm test:e2e -- apps/platform-api/src/platform-api.postgres.e2e-spec.ts
```

Result:

- Targeted typecheck passed.
- Targeted unit tests passed: 3 files, 10 tests.
- Default E2E passed with memory repository, while PostgreSQL E2E remained skipped unless explicitly enabled.
- PostgreSQL E2E passed against a temporary PostgreSQL container: 1 file, 2 tests.
- The smoke test covered seeded admin login, protected department access, employee creation, hashed local identity login, and empty permissions for a user without roles.
- Final row counts after the PostgreSQL smoke test: 2 employees, 2 local identities, 3 sessions.
- Temporary PostgreSQL container was removed after verification.
- Full `pnpm verify` passed.
- First Docker build attempt hit transient `ECONNRESET` during container `pnpm install`; a retry completed successfully and built all production Compose images.

## 2026-05-17

### Docker Build Context

Change set:

- Added root `.dockerignore` to keep local dependencies, build outputs, environment files, logs, and cache directories out of Docker build context.

Completed locally:

```bash
pnpm docker:build
```

Result:

- Production Docker Compose build passed.
- Built images: `infra-platform-api`, `infra-gateway-api`, `infra-notification-api`, `infra-im-adapter-api`, `infra-realtime-gateway`, and `infra-workbench-shell`.

## 2026-05-16

### Platform Migration And Seed Scripts

Change set:

- Added root `db:migrate`, `db:seed`, and `db:setup` scripts.
- Added a PostgreSQL migration runner backed by `platform.schema_migrations`.
- Added idempotent Platform Core seed data for default enterprise, root department, permissions, admin role, admin employee, local identity, role permissions, and user-role binding.
- Added bootstrap configuration tests and seed permission uniqueness tests.
- Added production bootstrap environment examples and deployment instructions.
- Updated ESLint flat config to ignore generated `dist`, `node_modules`, and `coverage` directories.

Completed locally:

```bash
pnpm verify
```

Result:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` passed.
- Unit tests passed: 8 files, 20 tests.
- E2E tests passed: 1 file, 8 tests.
- Lint still prints existing warnings for unused underscore-prefixed parameters and missing Nx cached project graph, but no lint errors remain.

Database smoke test:

```powershell
docker run -d --name work-platform-pg-test -e POSTGRES_USER=work -e POSTGRES_PASSWORD=work -e POSTGRES_DB=work_platform -p 55432:5432 postgres:15
$env:DATABASE_URL='postgresql://work:work@localhost:55432/work_platform'
$env:NODE_ENV='production'
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD='TempAdminPass123!'
pnpm db:setup
pnpm db:setup
```

Result:

- First run applied `0000_init_platform.sql` and seeded 12 permissions.
- Second run was idempotent and did not overwrite the existing admin password.
- Final row counts: 1 enterprise, 1 department, 1 employee, 12 permissions, 1 role, 12 role-permission bindings, 1 user-role binding.
- Temporary PostgreSQL container was removed after verification.

Docker build:

```bash
pnpm docker:build
```

Result:

- Local Docker daemon is running.
- Build is blocked locally because Docker still tries to reach Docker Hub through `127.0.0.1:10808`, and that proxy endpoint refuses connections.
- Failing image metadata pulls: `node:22-bookworm-slim` and `nginx:1.27-alpine`.

## 2026-05-11

### Platform Auth And Permission Guards

Change set:

- Added server-side access session storage to the Platform repository contract.
- Added `PlatformAuthGuard` for Bearer token authentication.
- Added `PermissionGuard` and `@RequirePermissions(...)` for endpoint-level RBAC checks.
- Protected Platform organization, employee, permission, and role endpoints.
- Added unit coverage for access token authentication and access session storage.
- Added API E2E coverage for unauthenticated 401, authenticated department listing, no-permission 403, and normalized traceable errors.

Completed in GitHub Actions:

```bash
pnpm install --no-frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
docker compose -f infra/docker-compose.prod.yml build
```

Result:

- Latest CI run `25679429356` passed.
- Production Docker Compose build passed after the auth/RBAC changes.

### CI And Shared HTTP Foundation

Change set:

- Fixed service TypeScript module resolution for CI.
- Fixed React type dependencies for the presence web module.
- Switched Vitest config files to ESM-compatible `.mts` entry points.
- Made Platform API controllers use explicit Nest injection so E2E tests do not depend on emitted constructor metadata.
- Opted GitHub Actions into Node 24 execution and allowed pnpm build scripts required by `@nestjs/core`, `esbuild`, and `nx`.

Completed in GitHub Actions:

```bash
pnpm install --no-frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
docker compose -f infra/docker-compose.prod.yml build
```

Result:

- Latest CI run `25653821220` passed.
- Unit tests passed: event bus, platform memory store, auth service.
- API E2E passed: login and department listing.
- Docker production compose build passed.
- GitHub Actions now runs the JavaScript actions under Node 24 compatibility mode. GitHub still emits an annotation because some upstream action versions target Node 20, but execution is already forced to Node 24.

Local dependency lock attempt:

```bash
pnpm install --lockfile-only --ignore-scripts --registry=https://registry.npmjs.org
```

Result:

- Current development machine could not generate `pnpm-lock.yaml`.
- The configured default registry is `https://registry.npmmirror.com`.
- Official registry attempt failed with certificate/registry access errors including `ERR_TLS_CERT_ALTNAME_INVALID` and `ERR_PNPM_FETCH_403`.

Follow-up:

- Generate and commit `pnpm-lock.yaml` from a stable network environment.
- After the lockfile is committed, change CI install to `pnpm install --frozen-lockfile`.
- Keep the CI workflow green before starting larger feature modules.

## 2026-05-10

Change set:

- Scaffold platform foundation.
- Add Platform Core repository boundary.
- Add unit and API E2E test files.
- Add Docker Compose deployment assets.
- Add CI and engineering workflow docs.

Attempted:

```bash
corepack enable
pnpm install
pnpm install --registry=https://registry.npmjs.org/
pnpm install --registry=https://registry.npmjs.org/ --fetch-timeout 600000
```

Result:

- `pnpm` itself is available as `10.0.0`.
- Dependency installation did not complete in the current environment.
- First attempt hit registry connection reset errors.
- Later attempts timed out before `node_modules` or `pnpm-lock.yaml` were created.

Completed checks:

- All workspace `package.json` files parse as valid JSON.
- Git working tree and staged files were reviewed before commit.

Must run in CI or stable network environment:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm docker:build
```

Follow-up:

- Commit generated `pnpm-lock.yaml` after the first successful install.
- Keep CI required before merging future PRs.
