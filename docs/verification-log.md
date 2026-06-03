# Verification Log

## 2026-06-03

### M6-1 Forms And Files Shared Backend Foundation

Scope:

- Implemented the M6-1 backend foundation slice from `docs/rfc/m6-dynamic-forms-file-storage.md`.
- Added shared backend modules `modules/forms/{contract,api}` and `modules/files/{contract,api}`.
- Did not implement file upload provider logic, upload HTTP API, Forms definition HTTP API, or Forms record service/API.

Change set:

- Contracts:
  - Added server-side manifests with `apiPrefix=/api/forms` and `/api/files`, no menus and no web entry.
  - Registered active M6-1 permissions:
    `forms:profile-definition:{view,manage}`, `forms:report-definition:{view,manage}`,
    `forms:record:{submit,view}`, `files:object:{upload,view-own}`.
  - Kept `forms:presence-definition:{view,manage}` reserved and unregistered.
  - Exported events `forms.definition.updated`, `forms.record.created`, `files.object.uploaded`.
  - Exported field types, DTO/schema types, §5.2.1 hard-limit constants, and public port tokens
    `FORMS_SERVICE` / `FILE_STORAGE_SERVICE`.
- Schema and migrations:
  - Added independent forms migration runner and `forms.schema_migrations`.
  - Added `forms.form_definitions`, `forms.form_fields`, `forms.form_records`, and
    `forms.form_record_values` with `enterprise_id`, composite unique constraints, and composite FKs.
  - Added independent files migration runner and `files.schema_migrations`.
  - Added `files.file_objects` and `files.file_references` with `enterprise_id`, single-reference
    uniqueness, `staged_expires_at NOT NULL`, status checks, and composite FK.
- Repository:
  - Added memory and PostgreSQL repositories for forms and files metadata/data-access skeletons.
  - Repository reads take `enterpriseId`; cross-tenant reads return `undefined` / empty arrays.
  - PostgreSQL integration tests cover empty-schema migration, idempotent rerun, tenant isolation, and
    composite-FK rejection of cross-tenant child rows.
- Platform / gateway:
  - Registered forms/files manifests in platform seed, so seed-derived active permissions include forms/files.
  - Added a PostgreSQL seed assertion that the seeded admin role receives all new forms/files permissions.
  - Mounted `FormsModule` and `FilesModule` in `gateway-api`.
  - Added public `/api/forms/health` and `/api/files/health` smoke routes to prove module-prefix mounting.
- Scripts:
  - Added `db:migrate:files` and `db:migrate:forms`.
  - Changed `db:setup` order to platform -> presence -> files -> forms -> seed.
  - Added forms/files repository integration specs to `test:db`.
  - Restricted `test:e2e` to no-DB e2e files so `verify:full` does not duplicate Postgres e2e suites
    when `RUN_POSTGRES_E2E=true`; DB e2e remains covered by `test:e2e:postgres`.

Validation:

- `pnpm install`: pass.
- `pnpm verify`: pass.
  - Unit/node: 19 files passed, 112 tests passed; Postgres-gated specs skipped without env.
  - Web/jsdom: 4 files passed, 19 tests passed.
  - E2E: 2 files passed, 27 tests passed; Postgres-gated e2e skipped without env.
  - Lint still prints existing Nx ProjectGraph warnings and existing warning-only unused/non-null assertions;
    no lint errors.
- PostgreSQL local verification:
  - Started local Docker PostgreSQL `postgres:15` on port 55432.
  - `pnpm db:setup`: pass. Applied platform, presence, files, forms migrations in the required order;
    seed result `permissionCount=20`.
  - Validation exposed that `test:e2e` re-collected Postgres e2e suites under full-path env vars,
    which intermittently produced Vitest worker `ERR_IPC_CHANNEL_CLOSED`. The script was narrowed to
    no-DB e2e files; `test:e2e:postgres` remains the DB e2e gate.
  - Final `pnpm verify:full`: pass.
    - `test:db`: 4 files passed, 23 tests passed, including forms/files empty-schema + idempotent
      migration + repository isolation.
    - `test:e2e:postgres`: 2 files passed, 13 tests passed.
  - Temporary PostgreSQL container was removed after verification.

Follow-up:

- M6-2: implement local disk Files provider, upload API, staged / attached lifecycle, cleanup, quotas,
  rate limits, disk threshold checks, Docker volume/deployment docs, and required security-reviewer pass.

## 2026-06-02

### M6-0 Dynamic Forms Mini And File Storage Proposed RFC

Scope:

- Drafted `docs/rfc/m6-dynamic-forms-file-storage.md` as a backend-first Proposed RFC.
- No feature code, dependency, lockfile, migration, or frontend implementation changed in this slice.
- Frontend configuration and submission UI remain deferred until the product prototype is confirmed.

Change set:

- Defined fixed form slots, typed fields, snapshot record values, and separate `forms.*` schema ownership.
- Chose local disk + `LocalFileStorageProvider` for the first file-storage implementation; MinIO remains a
  replaceable future provider.
- Defined a separate `files.*` schema, opaque storage keys, upload limits, MIME / extension allowlists,
  traversal protection, Docker volume persistence, and backup requirements.
- Kept file contents private: M6 does not expose a generic content-download route that authorizes by UUID
  alone. Domain modules must proxy content through their own authorization-aware APIs.
- Defined public Forms / Files ports and a Platform employee lookup port so later modules can validate
  people and file fields without cross-schema reads.
- Split M6 into backend slices M6-1 through M6-4 and deferred Web work to M6-W pending prototype review.
- Updated document index, progress board, and domain glossary.

Independent security review:

- First pass: `BLOCK`. The reviewer identified three High and five Medium RFC gaps before M6-1.
- Split definition permissions by slot family so profile and report administrators cannot edit each other's
  definitions; reserved presence slots remain 404 until M9.
- Added `staged -> attached` file lifecycle, owner-bound attachment, `files.file_references`, staged TTL
  cleanup, tenant / user quotas, upload rate limits, and disk free-space rejection plus alert logging.
- Added composite tenant FKs for Forms child rows and Files references so PostgreSQL rejects cross-tenant
  parent-child contamination even if a repository filter regresses.
- Added magic-byte detection, safe download headers, concrete form input limits, sensitive coordinated
  backup / restore requirements, and metadata-volume integrity checks.
- Updated `docs/module-contract.md` with the shared backend module exception and synchronized the service
  split timing to vNext. Updated `docs/security-baseline.md` §4.4 to the same ADR-0005 timing.
- Second pass: `BLOCK`. The original three High and five Medium findings were closed. The reviewer found
  three remaining Medium specification ambiguities.
- Synchronized the shared backend module exception into root `AGENTS.md`, not only `docs/module-contract.md`.
- Froze Files attachment as a single-reference model and added `staged -> attached` versus
  `staged -> deleting -> deleted` atomic claim rules, exact-reference idempotency, cleanup retry behavior,
  and concurrent attach / cleanup tests.
- Third pass: `BLOCK`. The second-pass findings were closed. The reviewer identified two remaining Medium
  cleanup convergence details.
- Made `staged_expires_at` mandatory for every staged object; quota accounting now includes `deleting`
  objects until disk release is confirmed. Cleanup treats an already-missing disk file as idempotent success
  so a prior database update failure can converge to `deleted`.
- Final pass: `LGTM / PASS`. The reviewer confirmed no remaining High or Medium findings. M6-0 was
  accepted on 2026-06-03 before M6-1 implementation started.

Validation:

- `git diff --check`: pass.
- `rg` consistency scan: pass. Stale progress text saying the M6 RFC did not exist was removed.
- `pnpm exec prettier --check docs/rfc/m6-dynamic-forms-file-storage.md docs/doc-index.md docs/domain-glossary.md docs/foundation-progress.md`:
  not run successfully because this new docs-only worktree has no installed `prettier` binary.
- `pnpm verify`: intentionally not run; this Proposed RFC slice changes documentation only.

Follow-up:

- Proceed with M6-1 backend foundation implementation.

## 2026-06-01

### M5-4 Roles & Permissions Delivery Verification

Scope:

- Executed `docs/tasks/m5-4-delivery-verification.md`: full local gates, PostgreSQL gates,
  Docker build, browser smoke, and M5 documentation close-out.
- No new feature scope was added. The code changes below are regressions exposed during
  delivery verification.

Validation-exposed fixes:

- Fixed `POST /roles` tenant isolation: `enterpriseId` is now derived from the authenticated
  user instead of trusting the request body. Added an E2E assertion with a forged tenant id.
- Fixed gateway local runtime: use `tsx` with the root tsconfig so decorated Nest source
  imported across workspaces starts correctly; enable decorators in the shared tsconfig.
- Mounted platform controllers below `/api/platform` in the gateway, matching the Shell and
  manifest contract. Updated the gateway-composition presence E2E paths.
- Fixed presence-web board and mine clients to unwrap backend `{ items }` envelopes. Updated
  API-client and page tests.
- Serialized E2E spec files because PostgreSQL suites share the seeded admin account; parallel
  password mutation/reset caused nondeterministic `verify:full` failures.
- Closed the security second-pass cross-tenant role authorization gap: role
  get/list/update/delete operations are scoped by the authenticated tenant, role assignment
  validates every `roleId` and the target employee against that tenant before persistence, and cross-tenant hits return
  404 to avoid existence disclosure. The same review found and closed an employee-creation
  bypass: public `POST /employees` no longer accepts `roleIds`, so assignment always goes through
  guarded `PUT /employees/:id/roles`; employee creation also derives `enterpriseId` from the
  authenticated user. `CreateEmployeeInput` and both repositories no longer allow roles during
  employee creation. Employee departments are validated against the authenticated tenant in the
  service and repositories. Repositories validate assignment role ids defensively, and auth ignores
  any persisted cross-tenant role or department contamination. Rejected role update/delete, role
  assignment, and employee department-reference writes record bounded failure audits without
  cross-tenant details. PostgreSQL treats malformed UUID paths as missing resources and truncates
  audit `resourceId` values to the schema bound, preserving 404 + failure-audit behavior for oversized
  ids. Other employee-side bare-id mutations (`updateStatus` and `resetPassword`) remain a recorded follow-up for M8
  personnel/organization work or a dedicated security slice.

Command matrix:

- `pnpm install --frozen-lockfile`: pass; lockfile unchanged.
- `pnpm verify`: pass after dependency install.
- `docker compose -f infra/docker-compose.yml up -d postgres`: pass after starting Docker
  Desktop Linux engine.
- PostgreSQL env + `pnpm db:setup`: pass; seed reports `permissionCount=12`.
- PostgreSQL env + `pnpm verify:full`: pass. Unit: 126 passed. Web: 19 passed. E2E: 39
  passed. Repository integration: 18 passed. PostgreSQL E2E: 13 passed.
- `pnpm docker:build`: pass. The first attempt hit a transient registry `ECONNRESET`; a clean
  standalone rerun built all six images successfully.
- GitHub Actions: latest pushed `main` run for M5-3 passed. This M5-4 branch needs its own CI
  run after push.

Browser smoke:

1. Pass. Started gateway + Shell against Docker PostgreSQL and signed in as `admin/admin123`.
2. Pass. Created `部门负责人` through `/platform/roles`, granting `presence:board:view` and
   `platform:employee:view`; set `profile=department`, `presence=company`, `report=self`.
3. Pass. Queried `platform.role_data_scopes`; the created role persisted exactly those three
   rows.
4. Pass. Used the M5-3 role-side UI assignment entry to assign the role to a non-admin test
   employee.
5. Pass. Authenticated as that employee. `/api/platform/auth/me` returned the three distinct
   scopes; `/api/platform/employees` returned only same-department employees, while the
   browser `/presence/board` rendered same-department and cross-department status fixtures.
   The employees Web page remains the intentional M5-3 placeholder, so profile filtering was
   verified through the authenticated gateway API. Presence fixtures were inserted directly
   into PostgreSQL for the smoke and removed afterwards.
6. Pass. The system administrator row disables edit/delete in the UI; direct PATCH and DELETE
   both returned `409 PLATFORM_ROLE_PROTECTED`. Deleting the assigned `部门负责人` role returned
   `409 PLATFORM_ROLE_IN_USE`. Native browser confirmation blocked automated prompt control,
   so the delete error assertion used the authenticated API fallback.
7. Pass. Cleared the employee role assignment with `PUT /employees/:id/roles` body
   `{ "roleIds": [] }`, then deleted `部门负责人` successfully with HTTP 200. Audit rows include
   `platform.role.create`, both `platform.employee.roles.assign` writes, and
   `platform.role.delete`.

Exit checklist:

- [x] UI configures per-data-type scopes and persists `role_data_scopes`.
- [x] `CurrentUserDto.dataScopes` applies by type: employees use `profile`; presence board
  uses `presence`.
- [x] `isSystem` roles reject update/delete with `PLATFORM_ROLE_PROTECTED`.
- [x] Assigned roles reject deletion with `PLATFORM_ROLE_IN_USE`.
- [x] `platform:role:assign` exists in manifest, seed permissions, and the seeded admin role.
- [x] Security baseline §4.4 / §5 is synchronized; prior security review has no unresolved
  M5 blocking item. Security second-pass High finding for cross-tenant role access is closed;
  employee-side bare-id mutation follow-up is recorded above.
- [x] Local `pnpm verify`, PostgreSQL `pnpm verify:full`, Docker build, and browser smoke pass.
  Latest pushed `main` CI is green; this branch CI follows after push.

Follow-up:

- Initiate M6 dynamic forms mini + file storage. Its RFC has not been created yet.

### M5-3 Role Management Web

Scope:

- Implemented `docs/tasks/m5-3-role-management-web.md` only. Backend API, contracts,
  migrations, scope parsing, organization placeholder, and employees placeholder remain unchanged.

Change set:

- Replaced `/platform/roles` placeholder with role list loading/empty/error/success states,
  system-role read-only controls, create/edit/delete flows, and backend deletion message display.
- Added platform-web runtime injection and a roles API client following the presence-web pattern;
  list endpoints unwrap `{ items }`, role updates use `PATCH`, and employee assignment sends only
  `{ roleIds }` to the encoded employee path.
- Added a grouped function-permission matrix and the `PLATFORM_DATA_TYPES` data-scope matrix with
  three data types, four editable scopes, explicit `self` defaults, and no `custom` editor.
- Added a minimal role-side user assignment UI: enter an employee ID, select roles, and replace
  that employee's role set. M8 personnel management may move this into an employee-centric UI.
- Added `PATCH` support to `@work/http-client`, platform-web Testing Library dependencies, API
  client tests, page tests, and the required lockfile update produced by `pnpm install`.

Verification:

- `pnpm install`: pass; lockfile updated by pnpm for platform-web workspace dependencies.
- `pnpm lint`: pass. Pre-existing Nx ProjectGraph and unused/non-null-assertion warnings unchanged.
- `pnpm typecheck`: pass.
- `pnpm test`: pass.
- `pnpm test:e2e`: pass.
- `pnpm build`: pass.
- `git diff --check`: pass.
- Browser smoke intentionally deferred to M5-4 per task package.

Follow-up:

- M5-4 delivery verification: run full delivery gates and browser smoke for
  role creation, per-type scope behavior, assignment, protected role behavior, and presence linkage.

## 2026-05-31

### M5-2 Role Management API

Scope:

- Implemented `docs/tasks/m5-2-role-management-api.md` only. Web role management remains M5-3.

Change set:

- Added repository `updateRole` / `deleteRole` / `countUsersWithRole` across PostgreSQL and memory implementations.
- Added `GET /roles/:id`, `PATCH /roles/:id`, and `DELETE /roles/:id`; system roles are protected and assigned roles cannot be deleted.
- Added `UpdateRoleDto`, duplicate `dataType` service validation, and memory duplicate-code behavior matching PostgreSQL.
- Switched `PUT /employees/:id/roles` from `platform:role:manage` to `platform:role:assign`.
- Added `platform.role.update` / `platform.role.delete` audit records and updated role API E2E coverage.

Verification:

- `pnpm install`: pass; lockfile unchanged.
- `pnpm lint`: pass. Pre-existing Nx ProjectGraph and unused/non-null-assertion warnings unchanged.
- `pnpm typecheck`: pass.
- `pnpm test`: pass. Unit: 99 passed, 17 PostgreSQL-gated skipped. Web: 8 passed.
- `pnpm test:e2e`: pass. Memory: 23 passed; PostgreSQL-gated: 12 skipped.
- `pnpm build`: pass.
- `git diff --check`: pass.
- PostgreSQL §10 verification: blocked locally. `localhost:5432` is not listening; `pnpm db:setup`
  fails with `connect EACCES ::1:5432` and `connect ECONNREFUSED 127.0.0.1:5432`.
  CI or a running local PostgreSQL must execute `pnpm db:setup`, `pnpm test:db`, and
  `pnpm test:e2e:postgres`.

Security review:

- `security-reviewer`: LGTM. Role CRUD and assignment permission wiring, protected/in-use
  `ApiError` envelopes, DTO validation, and audit metadata are correct.
- Closed during review: PostgreSQL audit persistence now bounds external `traceId` and `ip`
  values to their `varchar(128)` columns; PATCH duplicate `dataType` has explicit 400 coverage.
- Out-of-scope hardening follow-ups: repository unit-of-work for atomic mutation + audit;
  transactional role deletion or row locking to close the narrow count/delete concurrency
  window; align pre-existing Drizzle cascade metadata with migration SQL in a schema slice.

Follow-up:

- M5-3 Web role management UI.

### M5-1 RBAC Data Model and Scope

Scope:

- Implemented `docs/tasks/m5-1-rbac-data-model-scope.md` only. Role CRUD expansion and the
  `PUT /employees/:id/roles` guard switch remain M5-2.

Change set:

- Replaced single role `data_scope` with `platform.role_data_scopes` keyed by
  `profile | presence | report`; added `roles.is_system`.
- Changed `CurrentUserDto.dataScopes` to `Record<PlatformDataType, DataScope[]>` and
  `PlatformScopePort.resolveScope(user, dataType)`.
- Wired employee listing to `profile`, presence board to `presence`, admin seed to three
  `company` rows with `is_system=true`, and added `platform:role:assign`.
- Updated `docs/security-baseline.md` §4.4 and §5.3 for the introspection payload and model B.

Verification:

- `pnpm install`: pass; lockfile unchanged.
- `pnpm verify`: pass (`lint`, `typecheck`, `test`, `test:e2e`, `build`).
- Unit: 98 passed, 16 PostgreSQL-gated skipped. Web: 8 passed. Memory e2e: 20 passed,
  11 PostgreSQL-gated skipped.
- `git diff --check`: pass.
- `pnpm docker:build`: blocked locally because Docker Desktop Linux engine is not running
  (`//./pipe/dockerDesktopLinuxEngine` missing).
- PostgreSQL §10.1 / §10.3 verification: depends on CI. Local `postgresql-x64-17` is stopped,
  `localhost:5432` is not listening, and Docker Compose cannot start PostgreSQL for the same
  missing Docker Desktop engine. Equivalent specs cover schema shape, memory role round-trip,
  PostgreSQL role round-trip when the DB gate is enabled, scope isolation, active-role grouping,
  and dynamic manifest-derived permission seed data. CI must still run `pnpm db:setup`,
  `pnpm test:db`, `pnpm test:e2e:postgres`, seed idempotency, and the four SQL assertions in §10.3.

Security review:

- `security-reviewer`: LGTM. No scope widening, wrong-type consumer, custom/missing fallback,
  introspection payload, repository/seed consistency, or M5-2 scope-creep finding.
- Residual risk: CI PostgreSQL migration, seed idempotency, and SQL state assertions remain required.

Follow-up:

- M5-2 role management API, including duplicate `dataType` request validation and the
  `platform:role:assign` guard switch.

## 2026-05-27

### M4-4 Presence MVP Delivery Verification

Scope:

- Final M4 delivery verification slice per `docs/rfc/m4-presence-mvp.md §11`. No new feature code; no presence/api or presence/web changes.

Change set:

- Added `pnpm verify:full` script = `pnpm verify && pnpm test:db && pnpm test:e2e:postgres`. `pnpm verify` itself unchanged so local fast-path stays docker-free.
- Renamed env gate in `modules/presence/api/src/presence.e2e-spec.ts` from `RUN_POSTGRES_INTEGRATION` to `RUN_POSTGRES_E2E`, aligning with `apps/platform-api/src/platform-api.postgres.e2e-spec.ts`. This closes a latent CI gap: the `test:e2e:postgres` job in `.github/workflows/ci.yml` only sets `RUN_POSTGRES_E2E=true`, so the presence e2e suite was being silently skipped in CI before this change.
- Added `docs/runbooks/` directory; first runbook is `docs/runbooks/presence-mvp-smoke.md` covering docker postgres bring-up, `pnpm db:setup`, `pnpm verify:full`, `pnpm docker:build`, 28P01 troubleshooting tree, and 6-step browser smoke.
- Updated `docs/doc-index.md` §1 / §3 / §7 to include `docs/runbooks/*.md` in the document priority list, the responsibility table, and the "completed gaps" list.
- Updated `docs/foundation-progress.md`: M4-4 → Done, M4 整段 → Done, §6 "当前下一步" → `M5-0: 审批 MVP RFC`.
- Follow-up fix commit (driven by the findings below): added `@Public()` to `apps/platform-api/src/auth/auth.controller.ts` `login` and `password-policy`; added explicit `@Inject(PresenceStatusService)` to `presence-status.controller.ts` and `presence-board.controller.ts`; fixed two invalid `startAt > endAt` payloads plus open-ended support in `modules/presence/api/src/presence.e2e-spec.ts`.

Verification (run against local docker postgres `work/work@5432`, 2026-05-30):

- `pnpm install`: pass. (lockfile unchanged)
- `pnpm lint`: pass. Pre-existing Nx ProjectGraph and unused-parameter warnings unchanged.
- `pnpm typecheck`: pass.
- `pnpm test`: pass.
- `pnpm test:e2e`: pass (memory path).
- `pnpm build`: pass.
- `pnpm verify`: pass.
- `docker compose -f infra/docker-compose.yml up -d postgres`: pass (had to stop a native `postgresql-x64-17` holding host 5432, then `--force-recreate` so the container published 5432 — see `docs/runbooks/presence-mvp-smoke.md §6.2`).
- `pnpm db:setup`: pass; `permissionCount=11`.
- `RUN_POSTGRES_INTEGRATION=true RUN_POSTGRES_E2E=true pnpm verify:full`: pass (after the fixes below).
- `pnpm test:db` alone: pass (platform integration 10 case + presence integration 6 case = 16).
- `pnpm test:e2e:postgres` alone: pass (platform postgres e2e 5 case + presence e2e 6 case = 11). This was the first time the presence e2e actually executed (previously skipped via the env-gate bug); it surfaced the three findings below.
- `pnpm docker:build`: <PASS / FAIL — 用户填>.
- Browser smoke: <PASS / FAIL — 用户按 `docs/runbooks/presence-mvp-smoke.md §7` 6 步跑完后填结果>。
- CI: <下一次 push 后看 GitHub Actions verify + docker-build job，按结果填>。

Findings (uncovered the first time the presence e2e ran, all fixed in the follow-up commit):

- F1 (product, gateway login broken): `auth/login` and `auth/password-policy` were never marked `@Public()`. In standalone `platform-api` the `PlatformAuthGuard` is applied selectively per-route, so login was reachable; but the gateway (M4-2) registers `PlatformAuthGuard` as a global `APP_GUARD`, so unmarked routes are blocked. Result: login through gateway:3000 (the M4-3 dev entry and the deployment entry) returned 401 "未登录". Never caught because the only gateway-level login e2e (presence) was being skipped. Fix: `@Public()` on both routes (same pattern as the gateway health controller).
- F2 (product, presence DI under esbuild): `PresenceStatusController` and `PresenceBoardController` injected `PresenceStatusService` via constructor type reflection, which needs `emitDecoratorMetadata`. The vitest/tsx (esbuild) transpile does not emit it, so Nest injected `undefined` → every presence read/write threw `TypeError: Cannot read properties of undefined (reading 'createRecord')` → 500. The rest of the codebase uses explicit `@Inject(...)` tokens precisely to avoid metadata reliance; these two controllers were the only exception. Fix: explicit `@Inject(PresenceStatusService)`.
- F3 (test data): two presence e2e cases built `startAt > endAt` (default-parameter trap: `createPayload(start, undefined)` still applies the default endAt) so the API correctly rejected them with 400. Fix: `createPayload` now supports `null` for open-ended records; the cancel case uses a valid same-day range and the board case uses an open-ended record.

Assertion A1: pass. `package.json` `scripts.verify:full` exists and equals `pnpm verify && pnpm test:db && pnpm test:e2e:postgres`.
Assertion A2: pass. `modules/presence/api/src/presence.e2e-spec.ts` line 12 uses `RUN_POSTGRES_E2E`; no `RUN_POSTGRES_INTEGRATION` reference remains in this file.
Assertion A3: pass. `docs/runbooks/presence-mvp-smoke.md` exists; contains the 28P01 troubleshooting tree (容器没起 / 端口占用 / 卷旧密码 / Docker Desktop 引擎) and the 6-step browser smoke checklist.
Assertion A4: pass. `docs/doc-index.md` §1 lists `docs/runbooks/*.md` between tasks and verification-log; §3 has a `docs/runbooks/*.md` row; §7 "已补齐" lists `docs/runbooks/presence-mvp-smoke.md`.
Assertion A5: pass. `docs/foundation-progress.md` §1 总览表 M4 行 → Done；§6 当前下一步 → `M5-0: 审批 MVP RFC`；§8.1 / §8.2 / §8.3 反映 M4-4 完成、M4 整段完成。
Assertion A6: pass (2026-05-30). `RUN_POSTGRES_INTEGRATION=true RUN_POSTGRES_E2E=true pnpm verify:full` ran end-to-end green after the F1–F3 fixes; presence e2e went 0/6 → 6/6.
Assertion A7: <用户跑完后填>. `pnpm docker:build` pass.
Assertion A8: <用户跑完后填>. Browser smoke 6 步全过。

Follow-up:

- M4-2 verification-log A10 历史 "failed locally due environment" 记录保留；本切片解 28P01 + 修 e2e env gate 后该阻塞已实质闭合。M4-3 verification-log Follow-up 中关于 M4-4 交付验证集合（pnpm verify、test:db、PostgreSQL E2E、Docker build、browser smoke、CI）的项一并闭合。
- M5-0：审批 MVP RFC（`docs/rfc/m5-approval-mvp.md`），定义状态机、审批权限、事件、schema 边界。
- 可选：未来 M8 客户端交付前可考虑引入 Playwright，把 presence browser smoke 自动化（参考 `docs/runbooks/presence-mvp-smoke.md §7`）；本切片明确不引（D4）。

## 2026-05-25

### M4-1 Presence Contract Schema Repository

Change set:

- Extended `@work/presence-contract` PresenceStatusRecordDto with `enterpriseId / employeeNo / createdBy / createdAt / cancelledAt`; CreatePresenceStatusRecordInput unchanged.
- Added `modules/presence/api/src/db/migrations/0000_init_presence.sql` creating `presence` schema, `presence.status_records` table, status enum check, time range check, and three indexes per RFC §8.
- Added `modules/presence/api/src/db/migrate.ts` with `runPresenceMigrations()` maintaining `presence.schema_migrations`; CLI entry point preserved.
- Added `modules/presence/api/src/db/db.config.ts`, `postgres-error.mapper.ts`, `presence.repository.ts`, `postgres-presence.repository.ts`, `in-memory-presence.repository.ts`; PresenceRepository methods strictly per RFC §8 (listActiveRecords / listUserRecords / createRecord / cancelRecord / findOverlappingRecord).
- Added `in-memory-presence.repository.spec.ts` covering enterprise/time/scope filters, cancelled exclusion, history sort, overlap detection, open-ended overlap, and double-cancel return value.
- Added `postgres-presence.repository.integration.spec.ts` skipped unless `RUN_POSTGRES_INTEGRATION=true`; covers create/list/cancel round trip, double-cancel, scope filters, user history, overlap rules, and check-constraint rejection.
- Added `pg` dependency and `@types/pg` devDependency to `modules/presence/api/package.json`; added `@work/errors` workspace dependency for ApiError reuse.
- Added `pnpm db:migrate:presence` script; chained into `pnpm db:setup`; extended `pnpm test:db` to include the presence integration spec.

Verification:

- `pnpm install`: pass. `pnpm-lock.yaml` updated with `pg@^8.13.1` and `@types/pg@^8.11.10` entries for `@work/presence-api`.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass. New file `modules/presence/api/src/db/in-memory-presence.repository.spec.ts` contributes 7 tests; Postgres integration spec skipped in the normal unit run.
- PostgreSQL path: `$env:RUN_POSTGRES_INTEGRATION='true'; pnpm db:setup` first hit sandbox `spawn EPERM` in tsx/esbuild; rerun outside sandbox reached PostgreSQL and failed with `28P01` password authentication failure for user `work`. Therefore `pnpm test:db` was not run locally and remains CI-covered; presence integration spec has 6 gated cases.
- Assertion 1: `modules/presence/contract/src/status.dto.ts` exports `PresenceStatusRecordDto` with all 14 fields including `enterpriseId / employeeNo / createdBy / createdAt / cancelledAt`.
- Assertion 2: `modules/presence/api/src/db/migrations/0000_init_presence.sql` creates schema `presence`, table `presence.status_records` with 15 columns including `updated_at timestamptz NOT NULL DEFAULT now()`, the status enum CHECK, the time range CHECK, and three indexes (`status_records_user_start_idx`, `status_records_department_start_idx`, `status_records_status_start_idx`). No FK references `platform.*`.
- Assertion 3: `modules/presence/api/src/db/migrate.ts` calls `CREATE SCHEMA IF NOT EXISTS presence` and writes to `presence.schema_migrations`, not `platform.schema_migrations`.
- Assertion 4: `PresenceRepository` interface in `presence.repository.ts` has exactly 5 methods (`listActiveRecords`, `listUserRecords`, `createRecord`, `cancelRecord`, `findOverlappingRecord`).
- Assertion 5: `grep -R "apps/platform-api" modules/presence` returns no source matches; `grep -R "import .* from .*apps/" modules/presence` returns no matches.
- Assertion 6: `grep -R "platform\." modules/presence/api/src/db` returns no matches in repository or migration files (only the `presence.` prefix appears in SQL).
- Assertion 7: Root `package.json` `db:migrate:presence` script exists and `db:setup` chains it between `db:migrate` and `db:seed`; `test:db` includes both platform and presence integration spec paths.
- Assertion 8: `presence.module.ts`, `presence-status.service.ts`, `presence-board.controller.ts`, `presence-status.controller.ts`, `apps/gateway-api/src/gateway.module.ts`, `apps/platform-api/src/platform.module.ts` are not modified by this slice.

Follow-up:

- M4-2: presence API, permission guard wiring, audit; presence-api process entry, gateway-api → PlatformModule import, PlatformScopeService injection token export in `@work/platform-contract`.
- Module-contract §7.1.6 platform export inventory should be revisited when M4-2 starts to confirm whether PlatformScopeService injection token needs to be re-exported through `@work/platform-contract` before consumption.

### M4-2 Presence API Permission Audit

Change set:

- Cleared M4-1 deviation: `PresenceStatusRecordDto.enterpriseId/employeeNo/createdBy/createdAt` are required again; `cancelledAt` stays optional.
- Removed `?? ''` dead code patches in `modules/presence/api/src/db/in-memory-presence.repository.ts` (lines 92 and 101) introduced by the M4-1 DTO-optional workaround.
- Added `packages/platform-contract/src/scope.ts` exposing `PLATFORM_SCOPE_SERVICE` token + `PlatformScopePort` interface and `PlatformScope / PlatformScopeKind` types.
- Added `packages/platform-contract/src/audit.ts` exposing `PLATFORM_AUDIT_SERVICE` token + `PlatformAuditPort` interface.
- Added `apps/platform-api/src/audit/platform-audit.service.ts` implementing `PlatformAuditPort` by delegating to `PLATFORM_REPOSITORY.recordAuditLog`.
- Updated `apps/platform-api/src/scope/platform-scope.service.ts` to `implements PlatformScopePort` and to import `PlatformScope / PlatformScopeKind` from `@work/platform-contract`; resolution logic unchanged.
- Updated `apps/platform-api/src/platform.module.ts`: providers add `PlatformAuditService` and `useExisting` bindings for both `PLATFORM_SCOPE_SERVICE` and `PLATFORM_AUDIT_SERVICE`; `PermissionGuard` provider keeps its slot but is now imported from `@work/nest-common` (class physically migrated); exports expose `PlatformAuthGuard`, `PermissionGuard`, `AuthService`, `PLATFORM_SCOPE_SERVICE`, `PLATFORM_AUDIT_SERVICE`.
- Added `apps/platform-api/src/index.ts` exporting `PlatformModule` and `PlatformAuthGuard` for cross-package consumption.
- Migrated `RequirePermissions` decorator and `PermissionGuard` class from `apps/platform-api/src/rbac/` into `packages/nest-common/src/auth/`; added new `Public` decorator and `RequestWithAuth / CurrentUserAuthSnapshot / buildAuthAuditContext` interfaces in the same directory.
- Deviation: `packages/nest-common/src/auth/permission.guard.ts` uses `constructor(private readonly reflector: Reflector)` instead of the task draft's `@Inject(Reflector)` parameter decorator because `packages/nest-common` does not enable parameter decorators; Nest still resolves `Reflector` by type metadata in consuming apps.
- Updated `apps/platform-api/src/auth/platform-auth.guard.ts` to also short-circuit when `IS_PUBLIC_ROUTE_METADATA` is set (inject `Reflector`); other behaviour unchanged.
- Updated import paths in platform-api controllers to source `RequirePermissions / PermissionGuard` from `@work/nest-common`.
- Added `packages/nest-common/package.json` peer/dev dependency on `@nestjs/core` because the migrated `PermissionGuard` imports `Reflector` from `@nestjs/core`.
- Added `packages/event-bus/src/event-bus.token.ts` exposing `EVENT_BUS` Symbol token.
- Added `modules/presence/api/src/db/presence-db.module.ts` providing `PRESENCE_DB_POOL` + `PresenceDbPoolLifecycle` (mirrors platform DbModule pattern, separate Pool from platform — same database, separate pool).
- Added `modules/presence/api/src/db/presence-repository.token.ts` exposing `PRESENCE_REPOSITORY` Symbol token.
- Rewrote `modules/presence/api/src/status/presence-status.service.ts` as the real service injecting `PRESENCE_REPOSITORY`, `PLATFORM_SCOPE_SERVICE`, `PLATFORM_AUDIT_SERVICE`, `EVENT_BUS`; implements `getBoard / listOwnRecords / createRecord / cancelRecord` with scope-aware filtering, overlap conflict detection, audit emission, and `presence.status.changed` event publishing.
- Rewrote `modules/presence/api/src/status/presence-status.controller.ts` and `modules/presence/api/src/status/presence-board.controller.ts` to use `@RequirePermissions(...)` from `@work/nest-common`, extract `currentUser` from request, and build audit context via `buildAuthAuditContext`.
- Rewrote `modules/presence/api/src/presence.module.ts`: `imports: [PlatformModule, PresenceDbModule]`; providers include `PostgresPresenceRepository` (Pool injected), `PRESENCE_REPOSITORY` (useExisting Postgres), `EVENT_BUS` (useFactory new MemoryEventBus), `PresenceStatusService`.
- Updated `modules/presence/api/package.json` to add workspace dependencies `@work/platform-api`, `@work/platform-contract`, `@work/nest-common`, `@work/event-bus`, and devDependencies `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/testing`, `supertest`, `@types/supertest`.
- Rewrote `apps/gateway-api/src/gateway.module.ts`: `imports: [PlatformModule, PresenceModule]`; providers register two `APP_GUARD` entries (`PlatformAuthGuard`, `PermissionGuard`).
- Updated `apps/gateway-api/src/system/health.controller.ts` to mark all routes `@Public()`.
- Updated `apps/gateway-api/package.json` to add workspace dependencies `@work/platform-api`, `@work/platform-contract`, `@work/nest-common`, and devDependencies `@nestjs/testing`, `supertest`, `@types/supertest`.
- Added `modules/presence/api/src/status/presence-status.service.spec.ts` covering create success/conflict/no-department, cancel by owner/manager/forbidden/missing, getBoard for scope=self/company/department/department_tree/degraded-self.
- Added `modules/presence/api/src/presence.e2e-spec.ts` (gated by `RUN_POSTGRES_INTEGRATION=true`) covering 401 (no token), 403 (insufficient permission), 200 create, 409 overlap, 200 cancel, board scope filtering.
- Deviation: the presence e2e spec runs the real `GatewayModule` with `configurePlatformHttp(app, { globalPrefix: 'api' })`, so platform helper routes are mounted at `/api/auth`, `/api/roles`, and `/api/employees` in the gateway process rather than `/api/platform/...`; this matches the current gateway module mounting shape and avoids changing platform controllers.
- Updated `vitest.e2e.config.mts` and root `test:e2e:postgres` so the presence e2e file under `modules/**` is discoverable.
- Updated `docs/module-contract.md §7.1`: corrected `PlatformScopeService` injection examples/templates to token + interface; added `PLATFORM_AUDIT_SERVICE` to the available outlets and removed it from the pending outlets list.
- Updated `docs/foundation-progress.md §1 / §6 / §8.1 / §8.2 / §8.3` to move M4-2 to Done and set M4-3 as next slice.
- Updated `docs/platform-core.md §5` to mention that business modules inject `PlatformScopePort` via `PLATFORM_SCOPE_SERVICE` from `@work/platform-contract`.

Verification:

- `pnpm install`: pass. `pnpm-lock.yaml` updated naturally for the new workspace dependencies and `@types/supertest` / `supertest` entries.
- `pnpm lint`: pass. Existing Nx ProjectGraph warnings remain; existing warnings remain for `apps/platform-api/src/users/employee.controller.ts` non-null assertion and `apps/workbench-shell/src/module-registry/load-remote-module.ts` `_descriptor`.
- `pnpm typecheck`: pass.
- `pnpm test`: pass. 15 files / 90 tests passed; 2 Postgres integration files skipped in normal unit run. New `presence-status.service.spec.ts` contributes 12 tests.
- `RUN_POSTGRES_INTEGRATION=true pnpm test:db`: failed locally after sandbox rerun outside sandbox with PostgreSQL `28P01` password authentication failure for user `work`; both gated suites loaded, then failed in beforeAll DB connection. This is the same local DB auth blocker recorded in M4-1, not a skipped command.
- `RUN_POSTGRES_INTEGRATION=true pnpm test:e2e:postgres`: failed locally after sandbox rerun outside sandbox with PostgreSQL `28P01` password authentication failure for user `work` while the presence e2e spec invoked `pnpm db:setup`. The suite loaded and remains CI-coverable once DB credentials are valid.
- `pnpm build`: pass.
- `git diff --check`: pass.
- Assertion 1: pass. `modules/presence/contract/src/status.dto.ts` declares `enterpriseId / employeeNo / createdBy / createdAt` as required (no `?`) and `cancelledAt` as optional.
- Assertion 2: pass. `modules/presence/api/src/db/in-memory-presence.repository.ts` no longer contains `?? ''` after `b.createdAt` on lines 92 or 101.
- Assertion 3: pass. `packages/platform-contract/src/scope.ts` and `packages/platform-contract/src/audit.ts` exist; `packages/platform-contract/src/index.ts` re-exports both modules; tokens are declared with `Symbol.for(...)`.
- Assertion 4: pass. `apps/platform-api/src/platform.module.ts` exports `PlatformAuthGuard`, `PermissionGuard`, `AuthService`, `PLATFORM_SCOPE_SERVICE`, `PLATFORM_AUDIT_SERVICE`; providers register `PermissionGuard` from `@work/nest-common` and both `useExisting` bindings.
- Assertion 5: pass. `packages/nest-common/src/auth/` contains four files (`public.decorator.ts`, `permission.guard.ts`, `request-with-auth.ts`, `require-permissions.decorator.ts`); `packages/nest-common/src/index.ts` re-exports them; `apps/platform-api/src/rbac/require-permissions.decorator.ts` and `apps/platform-api/src/rbac/permission.guard.ts` no longer exist.
- Assertion 6: pass. `apps/gateway-api/src/gateway.module.ts` imports `[PlatformModule, PresenceModule]` and registers two `APP_GUARD` providers using `PlatformAuthGuard` and `PermissionGuard`.
- Assertion 7: pass. `modules/presence/api/src/presence.module.ts` imports `[PlatformModule, PresenceDbModule]`, declares `PRESENCE_REPOSITORY` provider using `useExisting: PostgresPresenceRepository`, and declares `EVENT_BUS` provider using `useFactory: () => new MemoryEventBus()`.
- Assertion 8: pass. `pnpm typecheck` passes for every workspace package.
- Assertion 9: pass. `pnpm test` passes; `presence-status.service.spec.ts` has 12 green tests and asserts audit action / metadata and `presence.status.changed` event payload.
- Assertion 10: failed locally due environment. With `RUN_POSTGRES_INTEGRATION=true`, `pnpm test:e2e:postgres` loaded the Postgres-gated presence e2e suite, but local `pnpm db:setup` failed on PostgreSQL `28P01` password authentication for user `work`, so the 6 scenarios could not execute locally.
- Assertion 11: pass. `docs/module-contract.md §7.1.6` lists `PLATFORM_SCOPE_SERVICE` and `PLATFORM_AUDIT_SERVICE` under available outlets; the previous "platform audit service" entry under pending outlets is removed.

Follow-up:

- M4-3 presence Web 页面（看板、登记表单）按 M4-2 已可用 API 接入。
- 平台员工 / 部门 lookup service 仍在 §7.1.6 待补列表，由后续业务切片按需扩出。
- `PresenceRepository.cancelRecord` 当前接口签名只接 `recordId / actorUserId / cancelledAt`，未强制 `enterpriseId` 隔离；后续若引入跨企业角色须扩签名加 `enterpriseId`。当前 RBAC 不下发跨企业 token，无法触发。
- M7 时把 `EVENT_BUS` provider 从 `MemoryEventBus` 切换为 Redis Stream client；`PLATFORM_SCOPE_SERVICE` / `PLATFORM_AUDIT_SERVICE` 实现切换为 HTTP introspection client。

### M4-3 Presence Web

Change set:

- Closed the M4-2 follow-up by changing `PermissionGuard` to explicit `constructor(@Inject(Reflector) ...)`, removing reliance on emitted constructor metadata in esbuild-driven test environments.
- Enabled `experimentalDecorators` only in `packages/nest-common/tsconfig.json` so the source-only package can typecheck parameter decorator syntax; `emitDecoratorMetadata` remains unset.
- Added `WorkWebModuleRuntime` to `@work/platform-sdk` with `currentUser` plus a baseUrl-scoped `createHttpClient` factory; `WorkWebModule` now supports optional `setRuntime`.
- Updated `apps/workbench-shell` to call `moduleRegistry.applyRuntime` after successful bootstrap and to create module HTTP clients using `readAccessToken()` plus the shell unauthorized handler.
- Switched `apps/workbench-shell` Vite dev proxy from `/api/platform -> 3001` to `/api -> 3000`, so dev requests go through gateway and cover `/api/presence/*`.
- Implemented `modules/presence/web` runtime singleton, `PresenceApiClient`, `StatusBadge`, real board page, and real register page against M4-2 endpoints.
- Added node-env API client unit coverage and jsdom React component coverage for board/register pages via `vitest.web.config.mts` and React Testing Library; root devDependencies include the packages required by the root web test config transform/setup context.
- Added `docs/module-contract.md §7.2` with Web module runtime injection rules; updated `docs/foundation-progress.md` and `docs/rfc/m4-presence-mvp.md §3` to reflect M4-3 completion.

Verification:

- Assertion A1: `git grep -E "from '@work/platform-api'" modules/presence/web/` produced no matches; `git grep "apps/platform-api" modules/presence/web/` produced no matches.
- Assertion A2: `git grep -E "window\.(localStorage|sessionStorage)|document\.cookie" modules/presence/web/` produced no matches.
- Assertion A3: `git grep "@work/workbench-shell\|apps/workbench-shell" modules/presence/web/` produced no matches.
- Assertion A4: `Select-String -Path packages/nest-common/src/auth/permission.guard.ts -Pattern '@Inject\(Reflector\)'` matched once.
- Assertion A5: `pnpm typecheck` pass.
- Assertion A6: `pnpm lint` pass. Existing warnings remain unchanged for Nx ProjectGraph cache, `apps/im-adapter-api/src/providers/openim-provider.service.ts` unused stub parameters, `apps/platform-api/src/users/employee.controller.ts` non-null assertion, and `apps/workbench-shell/src/module-registry/load-remote-module.ts` unused `_descriptor`.
- Assertion A7: `pnpm test:unit` pass; includes `modules/presence/web/src/api/presence-api-client.spec.ts`.
- Assertion A8: `pnpm test:web` pass; includes `PresenceBoardPage.spec.tsx` and `RegisterStatusPage.spec.tsx`.
- Assertion A9: `pnpm --filter @work/workbench-shell build` pass; `dist/assets` contains built chunks for `PresenceBoardPage` and `RegisterStatusPage`.
- Assertion A10: manual verification pending. Required manual smoke: terminal A `pnpm --filter @work/gateway-api start:dev` (3000), terminal B `pnpm --filter @work/workbench-shell dev` (5173 proxy `/api` to 3000), then browser login, open `/presence/board`, open `/presence/register`, submit a record, confirm it appears in "我的最近记录", cancel it, confirm it becomes "（已取消）", and refresh board.
- Assertion A11: pass. `getPresenceApi()` is only called inside `useCallback` loaders/handlers in `PresenceBoardPage` and `RegisterStatusPage`; module top-level imports do not evaluate the cached runtime.

Follow-up:

- M4-4 should run the broader delivery verification set: `pnpm verify`, database integration, PostgreSQL E2E, Docker build, browser smoke, and CI.
- The runtime hook intentionally does not implement the wider `PlatformSDK.setup` surface; that remains a later platform-web capability.

### M3.5-G Cross-schema Data Access Rules

Change set:

- Added `docs/module-contract.md §7.1` covering terminology, allowed channels (inject platform service, HTTP, event subscription), absolute prohibitions (cross-schema JOIN, schema/internal-service imports), repository/service engineering boundaries, scenario templates, the current platform exports inventory, the future export workflow, M7 compatibility promise, and review notes.
- Appended a pointer in `docs/foundation-blueprint.md §5` to `docs/module-contract.md §7.1` so module authors find the engineering rules from the high-level data boundary section.
- Updated `docs/foundation-progress.md` §1, §6, and §6.1 to reflect M3.5 closure and M4-1 as the next slice.

Verification:

- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass.
- Assertion 1: `docs/module-contract.md` contains a §7.1 heading with subsections 7.1.1 through 7.1.8.
- Assertion 2: §7.1.3 explicitly lists "任何 SQL 同时引用两个 schema 的表" as absolutely prohibited and includes JOIN, UNION, 子查询, and CTE.
- Assertion 3: §7.1.5 typical scenario table includes "按当前用户数据范围过滤自己模块的列表", "需要平台员工 / 部门基础信息", "业务写操作记录审计", and "响应平台状态变化（员工禁用、角色变更）".
- Assertion 4: §7.1.6 marks `PlatformScopeService` as currently available, and lists platform employee / department lookup service plus platform audit service as pending exports that are not in M3.5-G scope.
- Assertion 5: `docs/foundation-blueprint.md` §5 ends with a sentence linking to `docs/module-contract.md §7.1` and containing "具体落地规则".
- Assertion 6: `docs/foundation-progress.md` §6.1 lists M3.5-G as Done with the 2026-05-25 timestamp and references verification-log anchor `M3.5-G Cross-schema Data Access Rules`.
- No source code, configuration, or lockfile was modified by this slice.

Follow-up:

- M4-1: presence contract、schema、repository.
- Optional automation (not in this slice): CI grep against `from ['"]platform\.` / `JOIN platform\.` in module sources; Nx project boundary lint for module imports.

## 2026-05-24

### M3.5-F Shell Router

Change set:

- Added `react-router-dom@^6.28.0` to `apps/workbench-shell` and regenerated `pnpm-lock.yaml` through `pnpm install`.
- Replaced the Shell's hand-rolled `pushState` / `popstate` route state with `BrowserRouter`, `Routes`, `Route`, `NavLink`, `React.lazy`, and one Suspense fallback.
- Added `buildModuleRouteTable(modules)` to flatten module routes in registry order and throw on duplicate normalized paths at startup.
- Removed `resolveShellRoute`, `findRouteMatch`, `findAnyRoute`, `RouteMatch`, and `ShellRouteResolution` from `navigation.ts`.
- Split route rendering into `AppShell`, `RequirePermission`, `UnknownPathView`, and the allowed `RouteErrorBoundary`; `LoginView` remains outside the router.
- Updated `navigation.spec.ts` to keep `buildNavigationItems` coverage and add three `buildModuleRouteTable` cases, including duplicate path throws.

Verification:

- `pnpm install`: pass. Added only `react-router-dom@6.30.3` and its `react-router` / `@remix-run/router` transitive entries to the lockfile; no `jsdom`, `happy-dom`, or `@testing-library/react` dependency was added.
- `pnpm lint`: pass. Existing Nx ProjectGraph warnings remain; existing warnings remain for task-required `request.currentUser!`, `_query`, and `_descriptor`.
- `pnpm typecheck`: pass.
- `pnpm test`: pass. 13 files / 71 tests passed; PostgreSQL repository integration tests skipped in the normal unit run. `apps/workbench-shell/src/app/navigation.spec.ts` has 4 tests, including 3 `buildModuleRouteTable` tests.
- `pnpm test:e2e`: pass. Memory E2E 20 tests passed; PostgreSQL E2E skipped in the normal E2E run.
- `pnpm build`: pass. Vite emitted independent chunks for `PresenceBoardPage`, `RegisterStatusPage`, `OrganizationPage`, `RolesPage`, `EmployeesPage`, and `PlatformAdminPlaceholder`; the main `index-*.js` keeps only module manifest strings and dynamic import chunk references for those pages.
- §6.2 assertion 1: `apps/workbench-shell/package.json` contains `"react-router-dom": "^6.28.0"` and `pnpm-lock.yaml` contains the resolved `react-router-dom@6.30.3`.
- §6.2 assertion 2: `navigation.ts` exports `buildModuleRouteTable` and no longer contains `resolveShellRoute`, `findRouteMatch`, `findAnyRoute`, `RouteMatch`, or `ShellRouteResolution`.
- §6.2 assertion 3: `navigation.spec.ts` passed with `buildModuleRouteTable` cases for flattening/normalization, cross-module duplicate normalized paths, and same-module duplicate paths.
- §6.2 assertion 4: `App.tsx` contains no `pushState` or `popstate`; `BrowserRouter` appears once through the router import.
- §6.2 assertion 5: Chrome headless CDP smoke against `PLATFORM_REPOSITORY_DRIVER=memory` platform-api and Vite Shell passed: 5.a login to `/` shows `WorkbenchHome` and menu order `组织架构 / 员工管理 / 角色权限 / 在位看板 / 状态登记`; 5.b clicking `在位看板` changes URL to `/presence/board`, renders `PresenceBoardPage`, and applies `shell__nav-item--active`; 5.c browser history back/forward switches `/` and `/presence/board`; 5.d direct `/presence/board` load recovers login state and renders the board; 5.e direct `/this/does/not/exist` shows `页面不存在`; 5.f skipped because current memory seed has no authorized menu path without a registered route; 5.g logout returns to LoginView and re-login from `/` returns to `WorkbenchHome`.
- §6.2 assertion 6: automated regression is covered by `pnpm test` for `buildModuleRouteTable` / `buildNavigationItems`; browser behavior is covered by the Chrome headless smoke above.

Follow-up:

- M3.5-G 跨 schema 数据访问规则文档化（module-contract.md 增加章节）。

### M3.5-E Platform Scope Service

Change set:

- Added `PlatformScopeService.resolveScope` that turns `CurrentUserDto.dataScopes` plus `departmentId` / `enterpriseId` into a `PlatformScope { kind, userId, enterpriseId, departmentId?, departmentIds[], degradedFromCustom }`. Multi-role effective scope is `company > department_tree > department > self`; `custom` and empty scope lists degrade to `self`.
- Added `PlatformRepository.listDescendantDepartmentIds(parentId, enterpriseId)` with PostgreSQL `WITH RECURSIVE` implementation and memory store BFS implementation; both only return `status='active'` departments within the same enterprise.
- Reworked `GET /api/platform/employees`: `EmployeeService.listEmployees(currentUser)` now resolves the caller's scope and filters in-memory. Cross-enterprise rows are rejected unconditionally.
- Registered `PlatformScopeService` in `PlatformModule` providers.
- Expanded service unit tests, memory store tests, PostgreSQL repository integration tests, memory E2E, and PostgreSQL E2E with scope-aware employee list assertions.
- Rewrote `docs/platform-core.md` §5 with resolution rules, custom/department degradation rules, and a consumer filter template.

Verification:

- `pnpm install`: pass. Workspace already up to date; pnpm emitted a non-fatal metadata fetch warning through `127.0.0.1:10808`.
- `pnpm lint`: pass. Existing Nx ProjectGraph warnings remain; warnings remain for task-required `request.currentUser!`, existing `_query` in `modules/presence/api/src/status/presence-status.service.ts`, and existing `_descriptor` in `apps/workbench-shell/src/module-registry/load-remote-module.ts`.
- `pnpm typecheck`: pass.
- `pnpm test`: pass. 13 files / 71 tests passed; PostgreSQL repository integration tests skipped in the normal unit run.
- `pnpm test:e2e`: pass. Memory E2E 20 tests passed; PostgreSQL E2E skipped in the normal E2E run.
- `pnpm build`: pass.
- PostgreSQL path: `$env:DATABASE_URL='postgresql://work:work@localhost:5432/work_platform'; pnpm db:setup` failed locally with PostgreSQL password authentication failure for user `work`; therefore `pnpm test:db` and `pnpm test:e2e:postgres` were not run locally and remain CI-covered.
- §6.2 assertion 1: `platform-scope.service.spec.ts` has 10 tests and all passed, including `degrades custom to self` and `expands department_tree with descendants`.
- §6.2 assertion 2: `auth.service.spec.ts` remained at 19 passed tests after adding only the required repository mock method for the new interface.
- §6.2 assertion 3: memory E2E test `lets admin with company scope see employees from the enterprise` verifies admin/company sees enterprise employees.
- §6.2 assertion 4: memory E2E test `limits department scoped employees to their own department` verifies same-department visibility and excludes other departments plus admin.
- §6.2 assertion 5: memory E2E tests `limits self scoped employees to themselves` and `degrades custom scoped employees to self` verify self-only visibility and custom-to-self behavior; service spec covers `degradedFromCustom=true`.
- §6.2 assertion 6: memory E2E test `includes descendant departments for department_tree scoped employees` verifies parent + child department visibility.
- §6.2 assertion 7: PostgreSQL E2E test `filters employees by company, department, self, custom, department_tree, and enterprise` covers cross-enterprise rejection, but local PostgreSQL auth failed before execution; CI remains the authority for this path.

Follow-up:

- M3.5-F Shell 引入 react-router-dom@6，路由拆组件。

## 2026-05-23

### M3.5-D Password Change and Reset

Change set:

- Added `POST /api/platform/auth/change-password` for authenticated users to change their own password after verifying the old password.
- Added `PUT /api/platform/employees/:id/password`, protected by `platform:employee:manage`, for administrators to reset employee passwords.
- Added `PlatformRepository.updatePassword`; PostgreSQL updates `platform.local_identities` and `platform.employees` in one transaction, while the memory store updates both records in sequence.
- Added `CurrentUserDto.mustChangePassword` and `ChangePasswordInput` / `ResetEmployeePasswordInput` contract types.
- Added password-change and reset audit coverage for `auth.password.change` and `platform.employee.password.reset`.
- Expanded `auth.service.spec.ts`, platform write-audit tests, memory store tests, PostgreSQL repository integration tests, memory E2E, and PostgreSQL E2E.
- Updated `docs/platform-core.md` §3.3 and `docs/foundation-progress.md` §6/§6.1.

Verification:

- `pnpm install`: pass. Workspace already up to date.
- `pnpm lint`: pass. Existing Nx ProjectGraph warnings remain; existing unused-parameter warnings remain in `modules/presence/api/src/status/presence-status.service.ts` and `apps/workbench-shell/src/module-registry/load-remote-module.ts`.
- `pnpm typecheck`: pass.
- `pnpm test`: pass. 12 files / 60 tests passed; PostgreSQL integration tests skipped in the normal unit run.
- `pnpm test:e2e`: pass. Memory E2E 15 tests passed; PostgreSQL E2E skipped in the normal E2E run.
- `pnpm build`: pass.
- PostgreSQL path: `$env:DATABASE_URL='postgresql://work:work@localhost:5432/work_platform'; pnpm db:setup` failed locally with PostgreSQL password authentication failure for user `work`; therefore `pnpm test:db` and `pnpm test:e2e:postgres` were not run locally and remain CI-covered.
- `auth.service.spec.ts` 用例数：14 -> 19。
- §6.2 assertion 1: `auth.service.spec.ts` increased from 14 to 19 tests and all passed.
- §6.2 assertion 2: memory E2E test `changes the admin password and lets administrators reset employee passwords` verifies that after admin self-change, old-password login returns 401, new-password login succeeds, and `mustChangePassword=false`.
- §6.2 assertion 3: the same memory E2E test verifies that after administrator reset, the employee logs in with the new password and `mustChangePassword=true`.
- §6.2 assertion 4: PostgreSQL repository integration test `clears lockout state when updating passwords` covers `failed_attempts=0` and `locked_until=NULL` after `updatePassword`.
- §6.2 assertion 5: memory E2E test verifies a normal employee calling `PUT /employees/:id/password` receives 403.
- §6.2 assertion 6: `auth.service.spec.ts` test `rejects changePassword when the old password is wrong without updating password state` verifies 401 "原密码错误", no `updatePassword`, and no login failed-attempt update; memory E2E also observes `failedAttempts=0` after a wrong old-password change attempt.

Follow-up:

- M3.5-E Platform 数据范围 resolver（PlatformScopeService）。

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
