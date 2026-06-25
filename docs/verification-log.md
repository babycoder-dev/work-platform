# Verification Log

## 2026-06-24

### M8-5a People Aggregation Data Backend

Change set:

- Extended `@work/platform-contract` with `ScopeSubject` and
  `PlatformScopePort.matchesScope(subject, scope)`, preserving the existing subject-first
  `PlatformScopeService.matchesScope` call order and predicate semantics.
- Added Forms subject record access for `profile.employee`:
  - `GET /api/forms/records/profile.employee/subjects/:id`
  - `PUT /api/forms/records/profile.employee/subjects/:id`
  Both endpoints derive tenant / actor context from `request.currentUser`, enforce the existing
  `forms:record:view` / `forms:record:submit` permissions inside `FormsService` as 404-hide
  functional gates, and apply `profile` data-scope checks through the platform scope port before
  reading or upserting the singleton record.
- Added Forms repository support for `findRecordBySubject` in memory and PostgreSQL drivers, with
  values assembled through the existing record-value path and no cross-schema join.
- Added Presence current status by employee:
  `GET /api/presence/status-records/by-employee/:employeeId`. The endpoint requires
  `presence:board:view`, loads the subject employee's current department through the platform
  employee lookup port, and authorizes through `PlatformScopePort.matchesScope(subject, scope)`.
  The active presence record lookup no longer uses the record's snapshot `departmentId` as the
  by-employee authorization source.
- Added in-memory gateway e2e coverage proving the cross-module aggregation path:
  HR/admin writes `profile.employee`, the subject employee reads it back, out-of-scope users receive
  404 and cannot overwrite the record, and presence by-employee returns `record:null` outside the
  caller's presence scope.

Validation:

- Targeted TDD / regression checks:
  - `NODE_ENV=test NODE_OPTIONS=--localstorage-file=.ls-test pnpm exec vitest run --config vitest.config.mts modules/forms/api/src/forms/forms.service.spec.ts modules/presence/api/src/status/presence-status.service.spec.ts`:
    pass after review fixes, 2 files / 25 tests.
  - `NODE_ENV=test NODE_OPTIONS=--localstorage-file=.ls-test pnpm exec vitest run --config vitest.e2e.config.mts apps/gateway-api/src/people-aggregation.e2e-spec.ts`:
    pass, 1 file / 2 tests. One fixture issue was caught during development: the out-of-scope
    writer initially lacked `forms:record:submit` and got 403 before the intended scope check; the
    fixture now includes submit permission so the test proves the 404 data-scope denial.
  - Third-round targeted regressions:
    - `NODE_ENV=test NODE_OPTIONS=--localstorage-file=.ls-test pnpm exec vitest run --config vitest.config.mts modules/forms/api/src/forms/forms.service.spec.ts`:
      pass, 1 file / 11 tests.
    - `NODE_ENV=test NODE_OPTIONS=--localstorage-file=.ls-test pnpm exec vitest run --config vitest.e2e.config.mts apps/gateway-api/src/people-aggregation.e2e-spec.ts`:
      pass, 1 file / 2 tests. This also fixed the e2e fixture's fixed presence `endAt`, which had
      expired on 2026-06-25 and made the current-status assertion time-dependent.
- Targeted package typecheck:
  - `pnpm --filter @work/forms-api typecheck`: pass.
  - `pnpm --filter @work/presence-api typecheck`: pass.
  - `pnpm --filter @work/platform-contract typecheck`: pass.
- `NODE_ENV=test NODE_OPTIONS=--localstorage-file=.ls-test pnpm verify`: pass.
  - `lint`: pass across 27 of 28 workspace projects; existing Nx graph-cache warnings only.
  - `typecheck`: pass across 27 of 28 workspace projects.
  - `test`: pass.
    - Unit: 41 files passed / 5 Postgres-gated files skipped; 222 tests passed / 35 skipped.
    - Web: 35 files / 107 tests passed.
  - `test:e2e`: pass, 8 files / 51 tests. Includes the new people aggregation e2e.
  - `build`: pass across 27 of 28 workspace projects; existing workbench-shell Vite large chunk
    warning remains.
- `pnpm db:generate`: pass and detected the existing 15 platform tables. As with prior
  hand-written platform migrations, Drizzle generated a temporary full snapshot migration/meta
  (`0000_cuddly_johnny_storm.sql` + `meta/`) because this repository does not commit generated
  Drizzle meta history; the generated files were deleted and are not part of this PR.
- Postgres-gated verification:
  - Attempted with `DATABASE_URL=postgresql://work:work@localhost:5432/work_platform` and
    `RUN_POSTGRES_INTEGRATION=true`.
  - Local PostgreSQL refused connections on both `::1:5432` and `127.0.0.1:5432`, so
    `pnpm test:db` could not run the gated suites locally. The command loaded the five gated files
    but failed in suite setup before executing tests; the quick-path unit run shows those suites
    skipped as expected. The third-round rerun reproduced the same `ECONNREFUSED` on 2026-06-25,
    so PostgreSQL-gated coverage still needs CI or a local Postgres bring-up.
- Primed-graph boundary lint:
  - `pnpm exec nx graph --file=tmp-graph.json`: generated the project graph; temporary graph file
    removed.
  - `pnpm exec nx run @work/forms-api:lint`, `@work/presence-api:lint`,
    `@work/platform-api:lint`, and `@work/gateway-api:lint`: all completed with 0 errors.
    `@work/platform-api` still reports the pre-existing non-null assertion warnings.
- `security-reviewer` independent review: pass, 0 Blocking / 0 Major / 0 Minor. The reviewer
  confirmed subject-first `matchesScope`, forms tenant / data-scope isolation, no `@Public` or
  custom guard on the new Forms controller, server-derived upsert fields, no values in audit
  metadata, no upsert event publish, and presence by-employee board-scope semantics. PR review
  later tightened the by-employee endpoint to realtime subject-department authorization and
  restored forms `recordCreated` publication on first upsert. The rerun security review first
  found `docs/security-baseline.md` still described the old snapshot-department by-employee
  semantics; after updating §5.3 to distinguish realtime by-employee authorization from snapshot
  board filtering, the reviewer rechecked the delta and reported 0 Blocking / 0 Major / 0 Minor.

Review follow-up fixes:

- F1/F9: `getEmployeeStatus` now injects `PLATFORM_EMPLOYEE_LOOKUP_SERVICE`, resolves the target
  employee's current department, authorizes with `matchesScope(subject, scope)`, and then queries
  the active record without snapshot department filtering. Tests cover company visibility, self
  querying another employee returning `record:null`, subject missing returning `record:null`,
  target moved out of department scope returning `record:null`, and target newly in-scope returning
  the active record even if the presence record snapshot department is old.
- F2/F3: Forms `profile.employee` upsert now distinguishes create vs update. First upsert audits
  `forms.record.create` and publishes `formsEvents.recordCreated`; replacement audits
  `forms.record.update` and does not introduce a new update event type. Audit metadata remains
  minimal and excludes values.
- F7: Forms subject authorization now runs employee lookup and `resolveScope(currentUser,'profile')`
  in parallel with `Promise.all`.
- Third-round A: Forms subject-record HTTP endpoints no longer attach `@RequirePermissions`; missing
  `forms:record:view` / `forms:record:submit`, data-scope denial, missing subjects, and missing
  records now all reach service-layer 404-hide semantics instead of leaking a 403 from
  `PermissionGuard`. Gateway e2e covers GET without `forms:record:view` and PUT without
  `forms:record:submit`.
- Third-round B: Rejected `profile.employee` upserts now write bounded failure audit entries with
  `action=forms.record.upsert`, `result=failure`, `slotKey` / `subjectType` / `subjectId`, and a
  reason code. Failure audit excludes values, bounds route-derived metadata strings to 128
  characters, and swallows audit-write errors so the original 404 / 409 / 400 business result
  remains stable. Unit tests cover permission denial, profile scope denial, revision conflict,
  validation failure, bounded metadata, and audit sink failure.
- Optional cleanups: `forms.controller.ts` and `forms-record.controller.ts` now share a local
  `form-actor.ts` helper; the internal `getRecord(recordId)` method is annotated as port-only and
  unsafe to expose as HTTP without slot-specific data-scope checks. The related follow-up is
  tracked in `docs/foundation-progress.md` §7.5.

Spec pitfall checks:

- B1: `matchesScope(subject, scope)` is exposed subject-first, matching the existing
  `PlatformScopeService.matchesScope` order. Existing `EmployeeService` / `StatusLogService`
  call sites compile without argument reordering.
- B2: Forms service methods receive `CurrentUserDto` from the controller and use actor context only
  for functional permission / audit; data-scope decisions are not derived from `FormActorContext`.
- M2/F1: Presence by-employee now calls platform employee lookup and `matchesScope` against the
  subject's realtime department. `GET /presence/board` still uses record snapshot department
  filtering and is tracked separately for M9.
- M5: The new Forms controller keeps only the global auth guard path and no route-local
  `@UseGuards`; subject-record functional permissions are enforced inside `FormsService` so missing
  permission gets the same 404-hide response as data-scope denial. Constructor injections use
  explicit `@Inject(...)`.
- M6: The in-memory gateway e2e exercises the dotted route segment
  `/api/forms/records/profile.employee/subjects/:id`, proving Nest routing does not truncate the
  slot key.

Follow-up:

- M8-5b should consume these backend endpoints from the people page and keep Forms / Presence as
  independent module calls rather than introducing a backend cross-schema aggregation service.
- Presence by-employee uses the recorded presence snapshot department by design; department
  staleness is tracked in `docs/foundation-progress.md` §7.5.
- Postgres-gated verification remains pending on CI or a local Postgres bring-up.

## 2026-06-22

### M8-4a Status Logs Backend

Change set:

- Added `@work/platform-contract` status-log DTOs:
  `StatusLogDto`, `CreateStatusLogsInput`, `ListStatusLogsQuery`, and `ListStatusLogsResult`.
- Added `platform.status_logs` via hand-written migration `0003_m8_status_logs.sql`, Drizzle schema
  declaration, and memory / PostgreSQL repository methods for batch create and paged subject list.
  The table includes the reserved `deleted_at` soft-delete column and an
  `(enterprise_id, subject_employee_id, created_at desc)` index.
- Moved the employee scope predicate into `PlatformScopeService.matchesScope` and updated
  `EmployeeService` to delegate to the shared predicate, preserving the previous read/write scope
  behavior.
- Added `StatusLogService` and `StatusLogController`:
  `POST /api/platform/status-logs` requires `platform:status-log:create`, dedupes
  `subjectEmployeeIds`, validates every subject with `profile` write scope, and fails the entire
  batch as 404 without writing if any subject is missing, cross-tenant, or out of scope.
- Added `GET /api/platform/employees/:id/status-logs` through `EmployeeController`, requiring
  `platform:employee:view` plus `profile` read-scope visibility on the target employee.
- Added audit for successful and rejected create attempts. Success metadata records only
  `subjectEmployeeIds`, `subjectCount`, and `contentLength`; rejected batches omit concrete subject
  ids. The service does not inject an event bus and does not publish notifications.
- Added `platform:status-log:create` to the platform manifest so seed grants it through the existing
  active-manifest permission pipeline.

Validation:

- TDD red / green:
  - Before implementation, the new status-log service spec failed because
    `PlatformScopeService.matchesScope` did not exist and `StatusLogService` was missing.
  - Before implementation, the platform e2e status-log endpoint returned 404 for
    `/api/platform/status-logs` instead of the expected auth / permission behavior.
  - After implementation, targeted service + scope + employee service tests passed:
    3 files / 27 tests.
  - After adding DTO whitespace validation and auth repository mock parity, targeted tests passed:
    4 files / 48 tests.
- Primed-graph boundary lint:
  - `pnpm exec nx graph --file=tmp-graph.json`: pass; temporary graph file removed.
  - `pnpm exec nx run @work/platform-api:lint`: pass with existing non-null assertion warnings;
    no errors. The only new test warning found during development was removed.
  - `pnpm exec nx run @work/platform-contract:lint`: pass.
- `NODE_ENV=test pnpm verify`: pass.
  - `lint`: pass across 27 of 28 workspace projects, warnings only from existing non-null /
    unused-placeholder patterns.
  - `typecheck`: pass across 27 of 28 workspace projects.
  - `test`: pass.
    - Unit: 41 files passed / 5 Postgres-gated files skipped; 205 tests passed / 35 skipped.
    - Web: 33 files / 91 tests passed.
  - `test:e2e`: pass, 7 files / 49 tests. Includes the new platform e2e assertion for
    create/list status logs, no-token 401, no-permission 403, out-of-scope batch rejection,
    out-of-scope read 404, DTO validation, and all-or-nothing no-write behavior.
  - `build`: pass across 27 of 28 workspace projects. Vite emitted the existing workbench-shell
    large chunk warning.
- `NODE_ENV=test pnpm test:e2e`: pass when re-run independently, 7 files / 49 tests. This was used
  to verify a transient `ERR_IPC_CHANNEL_CLOSED` seen in one earlier full `verify` attempt was a
  Vitest worker IPC transient rather than an assertion failure; the subsequent full `verify` passed.
- `pnpm db:generate`: command completed and detected 15 platform tables including `status_logs`.
  As in earlier hand-written platform migrations, Drizzle generated a full snapshot migration/meta
  because this repository does not commit Drizzle meta history. The generated
  `0000_large_madame_hydra.sql` and `meta/` directory were deleted; only the hand-written
  `0003_m8_status_logs.sql` remains in the PR.
- Postgres-gated verification:
  - Local Docker was unavailable (`dockerDesktopLinuxEngine` pipe missing).
  - Direct `db:setup` against `postgresql://work:work@localhost:5432/work_platform` failed at the
    first platform migration with `ECONNREFUSED` for `::1:5432` and `127.0.0.1:5432`.
  - Therefore `verify:full` / `test:db` / `test:e2e:postgres` could not run locally. Quick-path unit
    output explicitly shows the Postgres-gated files skipped, including
    `apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts`
    (17 skipped). CI or a local Postgres bring-up must cover this gated path before release.

Repository / e2e assertions:

- Memory repository and platform e2e prove the HTTP behavior:
  - admin can batch create a near-activity note for two subjects and read the note from each
    subject timeline.
  - a role without `platform:status-log:create` gets 403 on create.
  - a department-scoped actor cannot create a batch containing an out-of-scope subject; the entire
    request returns 404 and no in-scope partial row is written.
  - a department-scoped actor cannot read an out-of-scope subject's timeline; the target is treated
    as not found.
  - invalid body shapes, too many subject ids, and whitespace-only content are rejected.
- PostgreSQL integration spec was added for the gated path and asserts table / index presence,
  batch insert ordering by `created_at DESC`, and `deleted_at IS NULL` filtering once
  `RUN_POSTGRES_INTEGRATION=true` is available.

Security / §16:

- `docs/security-baseline.md §5.3` already contains the M8 rule that near-activity batch writes
  use `profile` write scope and validate every subject. This slice implements that existing rule;
  it does not change the data-scope model, token/session/auth rules, RBAC semantics, or sensitive
  data classifications. No baseline change or ADR is required.
- Security-sensitive implementation points ready for independent review:
  enterprise and author ids come only from `currentUser`; cross-tenant / out-of-scope / missing
  subjects return 404; failure audit omits concrete subject ids; success audit omits the content
  body; status logs do not emit events or notification triggers.
- `security-reviewer`: pass, 0 Blocking / 0 Major / 0 Minor. Reviewer confirmed guard wiring,
  currentUser-derived tenant/scope isolation, all-or-nothing validation before insert, DTO and
  pagination bounds, audit minimization, parameterized repository queries, memory/postgres parity,
  and absence of status-log event/notification triggers.

Review-fix follow-up:

- Fixed PR review findings before merge:
  - Status-log subject id validation now accepts any repository-compatible UUID-shaped employee id,
    not v4-only ids, matching the existing `findEmployeeById` guard and seeded deterministic ids.
  - Batch create authorization now fetches subject employees once via `findEmployeesByIds`, then
    validates enterprise and `profile` scope per subject before any insert. Missing, cross-tenant,
    or out-of-scope subjects still reject the entire batch as 404 and do not reveal which subject
    failed.
  - Status-log listing now orders by `created_at DESC, id DESC` in both memory and PostgreSQL, so
    same-timestamp rows page deterministically without duplicates or gaps.
  - PostgreSQL status-log list now uses one query round-trip for page rows and total count.
  - Rejected-create failure audit is best-effort and no longer masks the business 404 if audit
    storage is unavailable; metadata remains limited to `subjectCount` and `reason`.
- Added regression coverage:
  - e2e creates and reads a status log for a valid non-v4 deterministic employee id.
  - service spec asserts create authorization calls `findEmployeesByIds` exactly once and rejects
    missing / out-of-scope batches without partial writes.
  - memory store and PostgreSQL-gated repository specs assert same-timestamp paging by id
    tiebreaker.
  - service spec asserts audit storage failure does not mask rejected-batch 404.
- Review-fix validation:
  - Targeted unit regression:
    `NODE_ENV=test pnpm exec vitest run apps/platform-api/src/status-log/status-log.service.spec.ts apps/platform-api/src/store/platform-memory.store.spec.ts apps/platform-api/src/auth/auth.service.spec.ts --config vitest.config.mts`
    passed, 3 files / 42 tests.
  - Targeted e2e regression:
    `NODE_ENV=test pnpm exec vitest run apps/platform-api/src/platform-api.e2e-spec.ts --config vitest.e2e.config.mts`
    passed, 1 file / 32 tests.
  - `NODE_ENV=test pnpm lint`: pass across 27 of 28 workspace projects; warnings only from
    existing non-null / unused-placeholder patterns.
  - `NODE_ENV=test pnpm typecheck`: pass across 27 of 28 workspace projects.
  - `NODE_ENV=test pnpm test`: pass.
    - Unit: 41 files passed / 5 Postgres-gated files skipped; 208 tests passed / 35 skipped.
    - Web: 33 files / 91 tests passed.
  - `NODE_ENV=test pnpm test:e2e`: pass, 7 files / 49 tests.
  - `NODE_ENV=test pnpm build`: pass across 27 of 28 workspace projects. Vite emitted the existing
    workbench-shell large chunk warning.
  - `pnpm db:generate`: exited 0, but because this repository does not commit Drizzle meta history
    for hand-written platform migrations, it generated a full snapshot migration
    `0000_previous_tomas.sql` and `meta/`. These generated artifacts were deleted and are not
    committed; this review fix contains no schema change.
  - Local Docker / Postgres remained unavailable (`dockerDesktopLinuxEngine` pipe missing), so
    `verify:full` and the updated PostgreSQL-gated repository assertions did not run locally.
  - `security-reviewer` second pass for diff `df6f6d15..b3d3345`: pass, 0 Blocking / 0 Major /
    0 Minor. Reviewer checked DTO malformed-id rejection, batch-fetch authorization, minimal
    best-effort failure audit, tenant-scoped list query, and stable paging. Reviewer reran targeted
    status-log unit coverage (21 tests), platform e2e (32 tests), and `git diff --check`; Postgres
    gated tests were not run by the reviewer and remain the CI/local-Postgres follow-up above.

Ordering / index follow-up:

- Aligned memory status-log sorting with PostgreSQL bytewise ordering by replacing `localeCompare`
  with plain `<` / `>` comparison for `createdAt DESC, id DESC`.
- Aligned `status_logs_subject_idx` in both Drizzle schema and hand-written migration with the
  query order: `(enterprise_id, subject_employee_id, created_at DESC, id DESC)`.
- Added regressions:
  - memory store same-timestamp rows with locale-sensitive ids sort by bytewise id descending.
  - platform schema spec asserts the hand-written migration keeps the status-log subject index
    aligned with stable paging order.
  - PostgreSQL-gated repository spec now checks the index definition includes
    `created_at DESC, id DESC`.
- TDD red / green:
  - Before implementation, `platform-memory.store.spec.ts` failed the bytewise tiebreaker test.
  - Before implementation, `platform.schema.spec.ts` failed because the migration index lacked
    `id DESC`.
  - After implementation, targeted
    `NODE_ENV=test pnpm exec vitest run apps/platform-api/src/store/platform-memory.store.spec.ts apps/platform-api/src/db/schema/platform.schema.spec.ts --config vitest.config.mts`
    passed, 2 files / 16 tests.
- Full validation for this follow-up:
  - `NODE_ENV=test pnpm lint`: pass across 27 of 28 workspace projects; existing warnings only.
  - `NODE_ENV=test pnpm typecheck`: pass across 27 of 28 workspace projects.
  - `NODE_ENV=test pnpm test`: initially failed in the web phase on local Node 25 with
    `window.localStorage.clear is not a function`; rerun with
    `NODE_OPTIONS=--localstorage-file=<workspace>/.ls-test` passed.
    - Unit: 41 files passed / 5 Postgres-gated files skipped; 210 tests passed / 35 skipped.
    - Web: 33 files / 91 tests passed.
  - `NODE_ENV=test pnpm test:e2e`: pass, 7 files / 49 tests.
  - `NODE_ENV=test pnpm build`: pass across 27 of 28 workspace projects. Vite emitted the existing
    workbench-shell large chunk warning.
  - `pnpm db:generate`: exited 0. Drizzle generated a full snapshot/meta because this repository
    still does not commit Drizzle meta history for hand-written platform migrations. The generated
    snapshot included the updated status-log index as `created_at DESC ... id DESC ...`; generated
    artifacts were deleted and are not committed.

Follow-up:

- M8-4b: person-page frontend timeline UI consuming `GET /api/platform/employees/:id/status-logs`.
- M8-6 / CI: run Postgres-gated `test:db` and `verify:full` with Docker/Postgres available.

## 2026-06-21

### M8-3 profile.updated Event

Change set:

- Added the producer-owned `profile.updated` event contract to `@work/platform-contract`.
  Payload is intentionally limited to `enterpriseId`, `subjectUserId`, `changedBy`, and
  `changedFields`; it contains field names only and no profile field values.
- Wired `EventBusModule` into `PlatformModule` and injected `EVENT_BUS` into
  `EmployeeService`. The single profile write seam now publishes `profile.updated` only when
  `saved.id !== currentUser.id` and `changedFields.length > 0`.
- Added best-effort publish isolation: a publish rejection is logged and does not roll back or
  fail the already-saved profile write and audit record.
- Added notification-side consumption in the existing `NotificationEventSubscriber`. The handler
  directly notifies `subjectUserId`, always sends an `in_app` notification, does not call
  `RecipientResolver`, and does not consult `trigger_config`.
- Removed the duplicate `profileUpdated` string from `@work/notification-contract`; comments now
  point to `@work/platform-contract` as the event owner and document that this is not configurable.

Validation:

- TDD red / green:
  - Before implementation, `apps/platform-api/src/users/employee.service.spec.ts` failed because
    `eventBus.publish` was not called for a third-party profile write.
  - Before implementation, `modules/notification/api/src/events/notification-event.subscriber.spec.ts`
    failed because publishing `profile.updated` produced no notification.
  - After implementation, `employee.service.spec.ts`: 1 file / 8 tests passed.
  - After implementation, `notification-event.subscriber.spec.ts`: 1 file / 5 tests passed.
  - Targeted gateway e2e `notification.e2e-spec.ts`: 1 file / 5 tests passed.
- `NODE_ENV=test pnpm lint`: pass. Plain recursive lint still prints standard Nx ProjectGraph cache
  warnings; `apps/workbench-shell/src/module-registry/load-remote-module.ts` keeps the existing
  `_descriptor` warning. No lint errors.
- Primed-graph boundary lint:
  - `pnpm exec nx graph --file=tmp-graph.json`: pass; temporary graph file removed.
  - `pnpm exec nx run @work/platform-api:lint`: pass with existing non-null assertion warnings.
  - `pnpm exec nx run @work/notification-api:lint`: pass.
  - `pnpm exec nx run @work/platform-contract:lint`: pass.
- `NODE_ENV=test pnpm typecheck`: pass across 27 of 28 workspace projects.
- `NODE_ENV=test pnpm test`: pass.
  - Unit: 45 files collected; 40 passed / 5 Postgres-gated skipped; 197 passed / 34 skipped.
  - Web: 33 files / 91 tests passed.
- `NODE_ENV=test pnpm test:e2e`: first run hit a Vitest worker IPC transient
  (`ERR_IPC_CHANNEL_CLOSED`) after passing visible assertions in the early files. Re-running the
  exact same command passed: 7 files / 48 tests passed.
- `NODE_ENV=test pnpm build`: pass across 27 of 28 workspace projects. Vite emitted the existing
  large chunk warning for the workbench shell bundle.
- `pnpm db:generate`: command completed, but Drizzle generated a full snapshot migration because
  this repository does not commit Drizzle meta history for the hand-written platform migrations.
  M8-3 has no schema changes; generated untracked migration/meta files were deleted and no schema
  diff is included in this PR.
- `verify:full` / Postgres-gated regression: not run locally because Docker Desktop daemon was not
  available (`dockerDesktopLinuxEngine` pipe missing). Unit output confirms Postgres-gated specs
  skipped under the quick path; this slice adds no Postgres-only assertions and relies on CI /
  M8-6 full verification for local Docker coverage.

EventBus singleton / e2e evidence:

- `apps/gateway-api/src/notification.e2e-spec.ts` now asserts the live path:
  admin updates another employee's profile through `/api/platform/employees/:id/profile`, then the
  subject user reads a new `sourceModule='platform'` notification via `/api/notification`.
- The same e2e asserts the negative paths: self-profile update via `/api/platform/employees/me/profile`
  does not add a notification, and an admin no-op profile update with the current value does not add
  a notification.
- Because the e2e goes through `GatewayModule` with memory drivers and no mocks, this proves
  platform's publisher and notification's subscriber share the process-level `EVENT_BUS` instance.

Security / §16:

- `docs/security-baseline.md §16` is not triggered. This slice does not change authentication,
  permission rules, data-scope semantics, token/session behavior, password handling, schema, or
  sensitive-field definitions. The new cross-module event carries only ids plus field names and no
  profile values, so no baseline or ADR update is required.
- `security-reviewer`: pass, 0 Blocking / 0 Major / 0 Minor. Reviewer confirmed payload privacy,
  publish condition, publish failure isolation, direct subject-only notification, handler isolation,
  and no security-baseline update requirement.
- `code-simplifier`: no production-code simplification recommended; one test-only helper was applied
  to remove repeated company-scope fixtures.

Follow-up:

- M8-4 remains the next slice: `platform.status_logs` and near-activity recording. Per the RFC and
  notification contract comments, status/activity notes must not notify the subject unless the
  product decision changes.

## 2026-06-21

### M8-2b First-Login Wizard

Change set:

- Added a first-login gate in the Workbench Shell. When `currentUser.mustChangePassword` is true,
  the shell renders a forced two-step wizard instead of the workbench: change password first, then
  complete the user's own profile. Completion re-runs `bootstrap()` and enters the workbench with
  the existing session.
- Added frontend Platform API client methods for `auth/change-password`, `auth/password-policy`,
  `employees/me`, and `employees/me/profile`.
- The wizard uses the shared `@work/ui` `Modal` without changing the shared Modal component. The
  wizard passes a no-op `onClose`, so Escape and scrim clicks do not close it; an explicit
  "退出登录" action remains available as the escape path.
- Self-profile submission sends only the narrow allowed fields. `name` and `mobile` are always sent
  as strings after client-side validation; `title` and `email` preserve the tri-state semantics
  (`undefined` keep / `null` clear / string set). Management fields such as `departmentId`, `status`,
  and `roleIds` are never sent.

Design fidelity / review follow-up:

- Added the missing `--font-size-16` token to `packages/ui/src/styles/tokens.css` for the modal
  step title, matching the handoff modal title size.
- Aligned `.first-login__step-icon` with the centered modal icon reference: 32px via
  `--control-height-md`, circular via `--r-full`, and retained the 18px SVG size.
- Added explicit `.first-login__step h3 { font-weight: 600; }` to avoid falling back to browser
  default 700.
- Kept shared `@work/ui` Modal styling unchanged. Shared Modal fidelity follow-up remains tracked
  in `docs/foundation-progress.md §7.2` and `docs/design/ui-fidelity-gap-modal.md`.

Test / review hardening:

- Replaced slow first-login test input chains (`userEvent.type` / `userEvent.clear`) with synchronous
  `fireEvent.change` through a small `setFieldValue` helper. This preserves the controlled-input
  assertions while avoiding full-web-suite timeouts.
- Removed the temporary 15s timeouts from the first-login tests; the full web suite now passes with
  default test timeouts.

Validation:

- `NODE_ENV=test pnpm lint`: pass. Plain recursive lint still prints standard Nx ProjectGraph cache
  warnings; `apps/workbench-shell/src/module-registry/load-remote-module.ts` has the existing
  `_descriptor` warning. No lint errors.
- `NODE_ENV=test pnpm typecheck`: pass across 27 of 28 workspace projects.
- `NODE_ENV=test pnpm test`: pass.
  - Unit: 45 files collected; 40 passed / 5 Postgres-gated skipped; 192 passed / 34 skipped.
  - Web: 33 files / 91 tests passed.
- `NODE_ENV=test pnpm test:e2e`: pass; 7 files / 47 tests passed.
- `NODE_ENV=test pnpm build`: pass across 27 of 28 workspace projects. Vite emitted the existing
  large chunk warning for the workbench shell bundle.
- Design gate self-check: non-token source has no hard-coded hex; touched first-login code has no
  emoji placeholders; key first-login copy is asserted in `FirstLoginWizard.spec.tsx`; spacing,
  radius, font size, and icon dimensions use tokens.

Follow-up:

- Shared `@work/ui` Modal fidelity is intentionally deferred to the tracked Modal follow-up.
- M8-3 `profile.updated` event remains the next backend integration point from the M8 profile seam.

## 2026-06-19

### M8-2a Profile Read-Write Backend

Change set:

- Added Platform employee profile read/write endpoints:
  - `GET /api/platform/employees/me` and `PUT /api/platform/employees/me/profile` require only login state.
  - `GET /api/platform/employees/:id` requires `platform:employee:view` and applies `profile` data scope.
  - `PUT /api/platform/employees/:id/profile` requires `platform:employee:manage` and applies `profile` data scope as write authorization.
- Added `UpdateMyProfileInput` / `UpdateEmployeeProfileInput` contracts and DTOs. The self DTO only allows
  `name`, `title`, `mobile`, and `email`; management profile writes additionally allow `departmentId`.
- Removed client-supplied `enterpriseId` from `CreateEmployeeDto`; employee creation now derives tenant from
  `request.currentUser.enterpriseId` and rejects body `enterpriseId`.
- Added single write seam `EmployeeService.updateEmployeeProfile`, value-based tri-state merge
  (`undefined` keep / `null` clear / value set), success/failure audit, and an M8-3 comment seam for
  future `profile.updated` publication. This slice intentionally does not publish `profile.updated`.
- Added `platform.employees.registration_status` reserved column via migration
  `0002_m8_employee_registration_status.sql` and Drizzle schema sync. The column defaults to `active`,
  has check `active | pending`, and remains outside `EmployeeDto`, write DTOs, HTTP responses, and
  repository update SET lists.

Validation-exposed fixes:

1. Existing employee creation DTO still trusted client shape by requiring/accepting `enterpriseId`.
   M8-2a tightened it to the current tenant invariant and updated all affected e2e fixtures to omit the
   field; a new e2e assertion verifies body `enterpriseId` is rejected with 400.

Security / §16:

- This slice triggers `docs/security-baseline.md §16` because `profile` data scope is now used for write
  authorization, not just read filtering. The same change updates `docs/security-baseline.md §5.3` to state
  that data scope governs both read filtering and write authorization.
- ADR assessment: no new ADR. The data type set, scope kind set, and widest-scope algorithm are unchanged;
  this is an application of the existing M5 model to profile writes.
- Security-reviewer: pass, 0 Blocking / 0 Major / 0 Minor. Reviewer confirmed `profile` write scope,
  self DTO narrowing, single write seam, tenant-derived employee creation, `registration_status` non-exposure,
  audit coverage, and §16 baseline update; no ADR required.

Validation:

- `pnpm install`: pass; lockfile unchanged.
- Targeted red / green:
  - Before implementation, `apps/platform-api/src/users/employee.service.spec.ts` failed 5/5 because
    `getEmployeeById`, `getMyProfile`, and `updateEmployeeProfile` did not exist.
  - Before implementation, targeted platform e2e failed because employee creation still required
    `enterpriseId` and `/employees/me` was not registered.
  - After implementation, `employee.service.spec.ts`: 1 file / 5 tests passed.
  - After implementation, targeted platform profile/tenant e2e: 1 file / 2 selected tests passed.
- `NODE_ENV=test pnpm lint`: pass; standard Nx graph-cache warnings observed in plain recursive lint.
- `NODE_ENV=test pnpm typecheck`: pass.
- `NODE_ENV=test pnpm test`: pass.
  - Unit: 44 files collected; 39 passed / 5 Postgres-gated skipped; 191 passed / 34 skipped.
  - Web: 32 files / 81 tests passed.
- `NODE_ENV=test pnpm test:e2e`: pass; 7 files / 47 tests passed.
- `NODE_ENV=test pnpm build`: pass.
- `pnpm db:generate`: pass, but Drizzle generated a full snapshot migration (`0000_legal_whizzer.sql`) plus
  `meta/` because no Drizzle meta history is committed for the hand-written platform migrations. The generated
  snapshot was inspected, treated as an expected generator artifact rather than the authoritative migration, and
  removed. The committed migration remains the hand-written idempotent
  `0002_m8_employee_registration_status.sql`.
- Postgres setup:
  - `NODE_ENV=test DATABASE_URL=postgresql://work:work@localhost:5432/work_platform RUN_POSTGRES_INTEGRATION=true RUN_POSTGRES_E2E=true PLATFORM_REPOSITORY_DRIVER=postgres PLATFORM_BOOTSTRAP_ADMIN_PASSWORD=admin123 pnpm db:setup`: pass.
  - `db:migrate` applied `0002_m8_employee_registration_status.sql`; seed completed with `permissionCount=21`.
- `NODE_ENV=test ... pnpm verify:full`: pass.
  - `verify` reran lint, typecheck, test, test:e2e, and build successfully.
  - `test:db`: 5 files / 34 tests passed; no Postgres-gated skip. `postgres-platform.repository.integration.spec.ts`
    covered `registration_status` default `active`, check rejection for invalid values, no exposure on returned
    `EmployeeDto`, and repository update preserving the reserved column.
  - `test:e2e:postgres`: 3 files / 14 tests passed; no Postgres-gated skip.
- Security-reviewer: pass, 0 Blocking / 0 Major / 0 Minor.

Follow-up:

- M8-2b first-login guide.
- M8-3 `profile.updated` event from the single profile write seam.

### M8-1 Department Management

Change set:

- Added tenant-scoped department management to Platform Core:
  - `GET /api/platform/departments` now lists only the authenticated tenant.
  - `POST /api/platform/departments` derives `enterpriseId` from `request.currentUser.enterpriseId`; the
    request body is no longer trusted for tenant selection.
  - `PUT /api/platform/departments/:id` supports rename, move, manager assignment / clearing, and sort
    order updates.
  - `DELETE /api/platform/departments/:id` soft-deletes only empty departments and returns
    `PLATFORM_DEPARTMENT_NOT_EMPTY` when active employees or active child departments still reference it.
- Added repository parity across PostgreSQL and memory implementations for department update, soft delete,
  active employee counts, active child checks, and cycle-check descendant traversal.
- Preserved the existing active-only data-scope descendant traversal by adding a separate
  `listDescendantDepartmentIdsForCycleCheck` path for move validation.
- Added the Platform Web organization page under the existing `/platform/org` route: real department /
  employee loading, create / edit / delete flows, permission-aware controls, and backend error display.
- Updated Platform Core / architecture docs to state that organization data is owned by Platform Core and
  business modules must not maintain their own organization tree.

Validation-exposed fixes:

1. Security-reviewer first pass found that `CreateDepartmentDto` still required client-supplied
   `enterpriseId`. Fixed by removing `enterpriseId` from the DTO, deriving it in
   `DepartmentController.createDepartment`, and adding e2e coverage for both "no body enterpriseId"
   success and "body enterpriseId is rejected" failure.
2. Security-reviewer first pass found that `UpdateDepartmentDto` accepted `null` for `name` and
   `sortOrder`. Fixed by treating only `undefined` as omitted for those fields; `parentId` and
   `managerUserId` intentionally still accept explicit `null` for clearing. E2E now rejects
   `name: null` and `sortOrder: null` with 400.
3. Removed the temporary Nx graph output artifact generated during boundary lint verification.
4. Post-review Minor: `UpdateDepartmentDto.name` now mirrors create validation and rejects the empty string.
   Added an e2e assertion for `{ name: '' } -> 400`.
5. PR review follow-up: department soft delete now uses a repository-level atomic occupancy guard. The
   PostgreSQL implementation locks department references with a transaction-scoped advisory lock across
   child department creation, employee creation, and soft delete; the soft delete statement also requires
   no active employees and no active child departments. If a race is detected after service prechecks,
   the API returns `PLATFORM_DEPARTMENT_NOT_EMPTY` instead of deleting or misreporting 404. The memory
   repository mirrors the guarded soft-delete result.
6. PR review follow-up: the organization page parent selector now offers only top-level departments, so
   the two-level UI cannot create hidden third-level departments.
7. PR scanner follow-up: GitGuardian flagged fixed test password literals in this PR. They were test
   fixtures, not production secrets, but the new / changed tests now use `TEST_INITIAL_SECRET` constants
   instead of inline credential-like literals to reduce false-positive noise.

Command matrix:

- `pnpm install`: pass; lockfile updated for `modules/platform/web` consuming `@work/ui`.
- Targeted unit and API client tests:
  - `npx vitest run --config vitest.config.mts apps/platform-api/src/org/org.service.spec.ts apps/platform-api/src/store/platform-memory.store.spec.ts modules/platform/web/src/api/platform-roles-api-client.spec.ts`: pass, 3 files / 26 tests.
  - `NODE_ENV=test npx vitest run --config vitest.web.config.mts modules/platform/web/src/pages/OrganizationPage.spec.tsx`: pass, 1 file / 4 tests.
  - `NODE_ENV=test npx vitest run --config vitest.e2e.config.mts apps/platform-api/src/platform-api.e2e-spec.ts`: pass, 29 tests.
- `NODE_ENV=test pnpm verify`: pass.
  - `lint`: pass with existing warnings only (`im-adapter-api` unused args, `platform-api` existing
    role / employee controller non-null assertions, `workbench-shell/load-remote-module.ts`
    `_descriptor`); 0 errors.
  - `typecheck`: pass.
  - `test`: unit 38 passed / 5 skipped files, 186 passed / 33 skipped tests. PostgreSQL-gated tests
    skipped because `RUN_POSTGRES_INTEGRATION` was unset in the fast path.
  - `test:web`: pass, 29 files / 75 tests.
  - `test:e2e`: pass, 7 files / 45 tests.
  - `build`: pass.
- Post-review targeted regression:
  - `NODE_ENV=test npx vitest run --config vitest.e2e.config.mts apps/platform-api/src/platform-api.e2e-spec.ts`:
    pass, 1 file / 29 tests.
- PR review targeted regressions:
  - `NODE_ENV=test npx vitest run --config vitest.config.mts apps/platform-api/src/org/org.service.spec.ts apps/platform-api/src/store/platform-memory.store.spec.ts modules/platform/web/src/api/platform-roles-api-client.spec.ts`:
    pass, 3 files / 27 tests.
  - `NODE_ENV=test npx vitest run --config vitest.web.config.mts modules/platform/web/src/pages/OrganizationPage.spec.tsx`:
    pass, 1 file / 4 tests.
  - `NODE_ENV=test RUN_POSTGRES_INTEGRATION=true DATABASE_URL=postgresql://work:work@localhost:5432/work_platform npx vitest run --config vitest.config.mts apps/platform-api/src/repositories/postgres-platform.repository.integration.spec.ts`:
    pass, 1 file / 15 tests.
- Local Docker PostgreSQL full path:
  - `pnpm db:setup`: pass; seed reported `permissionCount: 21`.
  - `NODE_ENV=test RUN_POSTGRES_INTEGRATION=true RUN_POSTGRES_E2E=true PLATFORM_REPOSITORY_DRIVER=postgres PLATFORM_BOOTSTRAP_ADMIN_PASSWORD=admin123 pnpm verify:full`: pass.
  - `verify` portion under PostgreSQL env: unit 43 files / 218 tests, web 29 files / 75 tests,
    e2e 7 files / 45 tests.
  - `test:db`: pass, 5 files / 33 tests. `postgres-platform.repository.integration.spec.ts` ran
    15 tests, including department update / soft delete / occupancy and cycle traversal coverage.
  - `test:e2e:postgres`: pass, 3 files / 14 tests.
- Primed graph module-boundary lint:
  - `pnpm exec nx graph --file=.tmp-m8-1-graph.json`: pass; temporary graph file removed afterwards.
  - `pnpm exec nx run @work/platform-web:lint`: pass.
  - `pnpm exec nx run @work/workbench-shell:lint`: pass with the existing `_descriptor` warning only.
- Changed-file UI gate scan:
  - `modules/platform/web/src/pages/OrganizationPage.tsx`, its spec, the platform API client files, and
    the M8 organization styles in `apps/workbench-shell/src/styles.css` contain no hardcoded hex colors or
    emoji placeholders.

Security review:

- First independent `security-reviewer` pass: Changes requested. The two Major findings are listed in
  "Validation-exposed fixes" above and were fixed with regression coverage.
- Second independent `security-reviewer` pass: pass; no Blocking, Major, or Minor findings. The review
  confirmed tenant derivation from `request.currentUser.enterpriseId`, repository-level enterprise
  predicates, cross-tenant NotFound behavior, active-only delete occupancy checks, unchanged data-scope
  descendant traversal, and `platform:org:view/manage` guard wiring.

Follow-up:

- M8-2a profile read / write backend.
- Existing employee `updateStatus(:id/status)` and `resetPassword(:id/password)` bare-id tenant follow-up
  remains outside M8-1 and should be handled in the dedicated M8 personnel / organization security work.

### UI Foundation Fidelity Slice (UI-1 → UI-2/UI-3 → UI-4 + fidelity gate)

Implements the design handoff (`docs/design/ui-handoff/design/{企业工作台设计规范,工作台}.html`)
against the task package `docs/tasks/ui-foundation-fidelity.md` and the gap clearance list
`docs/design/ui-fidelity-gap-foundation.md`. Frontend/shell only — no backend, no auth/scope/audit,
no migrations, no design-source edits. Not security-sensitive (security-reviewer not triggered).

Change set:

- **UI-1 component library (`packages/ui`)** — added a token-only line-icon set `Icon`
  (SVG paths lifted verbatim from the handoff; replaces emoji/first-letter placeholders), `Card`
  (`.card`/`.card-head`/`.card-body`), `StatCard` (`.stat` overview metric), and reusable
  `.work-icon-square` / `.work-quick-grid` / `.work-feed` CSS. Upgraded `Checkbox` to the design's
  custom-drawn control (`.checkbox.on` blue fill + white check SVG, native input visually hidden for
  accessibility). Fixed `InputProps` so `prefix` accepts a `ReactNode` (was widened to `string` by the
  HTML global `prefix` attribute), enabling SVG affixes. Added `--font-size-30` token. New web specs:
  `Icon`, `Card`, `StatCard`.
- **UI-2 login (`LoginView`)** — L-1..L-8 cleared: `工` brand mark, subtitle「企业内网账号统一登录入口」,
  line-SVG user/lock prefixes, placeholder「请输入工号或邮箱」/「请输入密码」, default-checked「记住登录」,
  primary button「登 录」, hint「登录即代表同意《内网使用规范》与《安全协议》」, and the `admin` default
  value cleared so the placeholder shows. Real login submit unchanged.
- **UI-3 app shell** — `工` + 「内网工作台」brand; all emoji (`☰`/`⌕`/`🔔`, nav first-letters) replaced
  with line SVGs; topbar help icon added (S-8); sidebar nav unread badge bound to real unread for
  messaging modules (S-3, no fabricated count); sidebar second line shows role then department fallback
  (S-5); search placeholder「搜索应用、文档、成员」(S-7). Breadcrumb / global-search shell / bell real
  unread / manifest-driven groups preserved (regression-kept, S-4/S-6).
- **UI-4 workbench home** — re-skinned with `StatCard` / `Card` / `work-quick-grid` visuals. Real data
  and honest placeholders all preserved: real unread stat + latest-notifications list; 待我审批 (M11) /
  我的待办 (vNext) / 在岗成员 kept as honest "数据待接入" placeholders; 待处理事项 + 系统动态 EmptyState
  kept. No fictional app-list / work-order / demo numbers introduced (L2 boundary). 新建申请 made a
  disabled, honestly-labelled "（M11 待接入）" button rather than a dead clickable one.

Fidelity gate (this slice establishes it; see `docs/development-workflow.md` §7):

- A1 zero hardcoded hex: `grep '#[0-9a-fA-F]{3,6}'` over `apps/workbench-shell/src/**` = 0;
  over `packages/ui/src/**` = 0 outside `tokens.css` (the single source of truth).
- A2 zero emoji-as-icon: grep of the emoji code points used previously = 0 in both trees.
- A3 exact copy: asserted verbatim in `App.spec.tsx` (logo `工`, subtitle, account placeholder, hint,
  default-checked remember, button「登 录」).
- A4 token-only spacing/radius/shadow/font: all new CSS uses `--sp-*`/`--r-*`/`--shadow-*` (with
  `calc(token …)` to hit off-grid design pixels, matching the existing repo precedent) and `--font-size-*`.
- A5 real wiring / honest placeholders preserved: asserted by the existing App.spec real-data tests
  (real unread = 3, latest notification rendered, fabricated 12/9/5/231 absent, `数据待接入` present).
- B class (visual side-by-side) handed to the independent reviewer.

Command matrix:

- `pnpm install --frozen-lockfile`: pass (lockfile unchanged; no new deps).
- `NODE_ENV=test pnpm verify`: pass (`VERIFY_EXIT=0`).
  - `lint`: pass, 0 errors (pre-existing `workbench-shell/load-remote-module.ts` unused `_descriptor`
    warning only).
  - `typecheck`: pass across all 28 projects.
  - `test`: pass — web jsdom suite incl. the 3 new `@work/ui` specs and the updated `App.spec.tsx`
    (10 shell tests), unit suite green.
  - `test:e2e`: pass.
  - `build`: pass; `workbench-shell` vite production build OK (CSS 29.07 kB / 5.55 kB gzip).
- Local environment note (not a code issue): this box runs **Node v25**, whose now-global
  `localStorage` shadows jsdom's and is a non-functional stub unless a valid `--localstorage-file` is
  given; `App.spec`'s `beforeEach` `localStorage.clear()` then throws. CI runs Node 22 LTS (no such
  global) and is unaffected. Locally the web suite was run with
  `NODE_OPTIONS=--localstorage-file=$(mktemp -u …)` to validate; the workaround is local-only and not
  committed.
- Not run (out of slice scope, frontend/shell only): `verify:full`, `db:setup`, `docker:build`.

### UI Foundation Fidelity — visual (B-class) review pass + structural fixes

After the A-class gate, ran a screenshot-based side-by-side against the design prototype (the B-class
review the gate calls for). Method (kept as a reusable regression harness):

- Render the prototype `docs/design/ui-handoff/design/工作台.html` headlessly (system Chrome) at 1440×900
  as the golden reference; screenshot the running shell (login / workbench / collapsed sidebar) at the
  same viewport via a throwaway puppeteer-core script (token injected into `localStorage`), then diff
  region by region. (Local-only harness under `.tmp/shots`, not committed.)

Deltas found by the visual diff and fixed (all in `apps/workbench-shell`, plus the shared scrollbar in
`packages/ui`):

- **Fixed app frame + inner scroll**: `.app-shell` was `min-height:100vh` (whole page scrolled, sidebar
  scrolled away). Now `height:100vh; overflow:hidden` with `min-height:0` on side/nav/main/content so only
  the content (and nav list if needed) scrolls — matches prototype `.app{height:100vh;overflow:hidden}`.
- **Custom thin scrollbar**: added the prototype's global `::-webkit-scrollbar` (token `--scrollbar-thumb`).
- **Two-level sidebar**: flat module menus now group under real module section titles (平台管理 / 在位管理 /
  通知中心) instead of one English module-code header per item; added the leading 工作台 home entry; brand
  bottom divider; tightened group/item spacing to the prototype's flex layout.
- **Per-menu icons + colours**: distinct line icon and quick-tile colour per menu (was one gear / one tone
  per module).
- **Header**: replaced the spec-demo 刷新/新建申请 buttons with the real `工作台.html` live clock + date
  widget (`13:05 / 6 月 19 日 星期五`); breadcrumb now `工作台 / 概览` (was duplicated); honest real-unread
  subtitle.
- **Content width**: added the prototype's `max-width:1180px` centered wrapper (`--shell-home-max-width`)
  and corrected the two-column ratio to `1.5fr / 1fr`; fixed dead responsive selectors so the grid
  collapses on narrow viewports.

Independent sub-agent visual audit: **PASS, no blocking, no gate violations** (A1 hex / A2 emoji / A4
token-only re-confirmed clean). Re-ran `NODE_ENV=test pnpm verify` → pass (`VERIFY_EXIT=0`); web suite
incl. updated `App.spec.tsx` green. Known intentional deltas vs the prototype remain by agreement (real
data + honest "待接入"/EmptyState placeholders, real module section names, no fictional menus, no 👋).
Folding standalone presence into 组织成员 per the prototype is M9 (在位状态 v2), out of this slice.

### UI Foundation Fidelity — interactive-state review + login error fix

Extended the visual review to interactive states (the prior screenshot pass only covered default/static
states). Drove the running shell through each state via the puppeteer harness and screenshotted:
login error / search popover / notification dropdown / avatar menu / help toast / collapsed sidebar. All
behave and render faithfully (honest placeholders preserved; help uses the shared `@work/ui` Toast,
top-center, matching the prototype `.toast`).

One real bug found and fixed — **login error message widened the card**: a long error grew `.login-card`
from 380px to 744px (measured). Root cause: `--shell-login-card-width` was defined only on `.app-shell`,
but `LoginView` renders outside `.app-shell`, so `width: min(100%, var(--shell-login-card-width))`
resolved to an invalid value and was dropped — the card had no width cap (it only _looked_ ~380px because
the form content happened to be that wide). Fix in `apps/workbench-shell/src/styles.css`: scope
`--shell-login-card-width` to `.login-page`, add `min-width:0` + `grid-template-columns:minmax(0,1fr)` to
`.login-card`, and `overflow-wrap:anywhere` to the error box. Verified: card holds 380px and the error
wraps at any message length. `NODE_ENV=test pnpm verify` → pass (`VERIFY_EXIT=0`).

Lesson folded into the gate: design-fidelity review must cover **interactive states** (error / hover /
open-popover / loading / empty-vs-data), not just default screenshots.

## 2026-06-17

### M7-5 Notification & Scheduler Delivery Verification

Change set:

- Ran the M7 notification + scheduler delivery gate over the completed M7-1 through M7-4b stack.
- Fixed three validation-exposed regressions:
  - `PostgresNotificationRepository` integration tests now reset default trigger/schedule rows before each
    case and again at suite shutdown. `verify:full` runs the same env-gated spec once during `pnpm test`
    and again during `pnpm test:db`; without isolation, the first run's intentional upsert mutations made
    the second run fail against preserved admin-edit semantics.
  - `platform-api`, `im-adapter-api`, and `realtime-gateway` `start:prod` scripts now pass
    `--tsconfig ../../tsconfig.base.json` to `tsx`, matching `gateway-api`. The production compose bring-up
    exposed that these Nest services otherwise failed in-container on decorator transforms. A PR review
    then exposed that `im-adapter-api` still relies on emitted constructor metadata, so
    `emitDecoratorMetadata` is now set in the shared base config used by the production `tsx` path, and the
    IM adapter controllers now use explicit `@Inject(OpenImProviderService)` like the rest of the Nest code.
  - `files-upload.postgres.e2e-spec.ts` now sets `PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD=true` for its
    suite-local `db:setup`. The full Postgres e2e chain runs after the platform Postgres suite, which
    intentionally changes the seeded admin password; resetting the test admin password keeps the later
    upload suite isolated without changing production seed semantics.
- Updated `docs/foundation-progress.md` to mark M7 Done and point the next slice at M8.
- Confirmed `docs/architecture.md`, `docs/deployment.md`, and `docs/security-baseline.md` already describe
  `modules/notification`, `db:migrate:notification`, SSE, scheduler, and the deleted `apps/notification-api`
  deployment shape accurately; no extra edits required.

Command matrix:

- `pnpm install --frozen-lockfile`: pass; workspace scope 28 projects, lockfile already current.
- `NODE_ENV=test pnpm verify`: pass.
  - `lint`: pass with existing warnings only (`im-adapter-api` unused args, `platform-api` non-null assertions,
    `workbench-shell/load-remote-module.ts` unused `_descriptor`); 0 errors.
  - `typecheck`: pass.
  - `test`: unit 42 files / 206 tests total, with fast-path Postgres-gated files skipped because
    `RUN_POSTGRES_INTEGRATION` was unset; web 28 files / 71 tests.
  - `test:e2e`: pass, 7 files / 42 tests, including notification / notification-stream / scheduler
    in-memory gateway suites.
  - `build`: pass.
- Primed graph boundary lint: pass for `@work/notification-api:lint`, `@work/notification-web:lint`, and
  `@work/gateway-api:lint` after `pnpm exec nx graph --file=tmp-m7-5-logs/nx-graph.json`.
- `pnpm db:setup` with local Docker Postgres: pass. Observed order:
  platform -> presence -> files -> forms -> notification -> seed. The notification step printed the
  `db:migrate:notification` script banner and exited 0; seed reported `permissionCount: 21`.
- `NODE_ENV=test RUN_POSTGRES_INTEGRATION=true RUN_POSTGRES_E2E=true pnpm verify:full`: pass after the
  integration-test isolation fixes.
  - `verify` portion under PG env: unit 42 files / 206 tests, web 28 files / 71 tests, e2e 7 files / 42 tests.
  - `test:db`: pass, 5 files / 31 tests. `modules/notification/api/src/db/postgres-notification.repository.integration.spec.ts`
    actually ran, 1 file / 3 tests, not skipped.
  - `test:e2e:postgres`: pass, 3 files / 14 tests. Notification live-link Postgres coverage is intentionally
    not in this suite; the three notification gateway e2e specs force the memory repository by design.
- `pnpm docker:build`: pass after the `start:prod` regression fix. Built images are platform-api,
  gateway-api, workbench-shell, realtime-gateway, and im-adapter-api; no notification-api image is produced.
- `docker compose -f infra/docker-compose.prod.yml config`: pass; no `notification-api` service,
  `depends_on: notification-api`, or `NOTIFICATION_API_URL` reference.
- `docker compose -f infra/docker-compose.prod.yml up -d` / `down`: pass after the `start:prod` fix.
  The bring-up showed `gateway-api`, `platform-api`, `im-adapter-api`, `realtime-gateway`,
  `workbench-shell`, Postgres, and Redis up. `gateway-api` logs mapped `/api/notification/stream`,
  `/api/notification/trigger-config`, and registered `notification.heartbeat` with cron `0 * * * *`.
  A stale local `infra-notification-api:latest` image and orphan container from old runs were removed with
  `docker image rm infra-notification-api:latest` and `docker compose ... down --remove-orphans`; they were
  not produced by this branch.
- PR review follow-up after moving `emitDecoratorMetadata` into `tsconfig.base.json` and adding explicit
  IM adapter controller injection:
  - `NODE_ENV=test pnpm verify`: pass. Unit 37 passed / 5 skipped files, 175 passed / 31 skipped tests;
    web 28 files / 71 tests; e2e 7 files / 42 tests; build pass.
  - `docker compose -f infra/docker-compose.prod.yml up -d`: pass. After ~30s,
    `docker compose ... ps im-adapter-api` reported `infra-im-adapter-api-1` `Up 46 seconds`, and
    `docker compose ... logs im-adapter-api` included `Nest application successfully started` plus mapped
    `/api/im-adapter/notifications/system-message` and `/api/im-adapter/webhooks/openim`.
  - `docker compose -f infra/docker-compose.prod.yml down`: pass.

Smoke results:

1. Baseline and auth: `GET /api/notification/stream` without token returned 401 from the global guard.
2. Live chain: using real HTTP against gateway + local Postgres, admin created a manager employee, a managed
   department, a subject employee, and a minimal presence role. With trigger config enabled, the subject
   posted `POST /api/presence/status-records`; manager SSE received `{ "type": "notification.created" }`
   with `content-type: text/event-stream`, and manager unread count changed 0 -> 1.
3. Receiver UI: manager browser login showed topbar bell badge `1`, workbench "未读消息" card `1`,
   "最新消息" containing the presence notification, and a bell dropdown item with the created notification.
4. Read / navigation: clicking the bell dropdown notification marked it read and navigated to
   `/presence/board`.
5. Ownership isolation: an unrelated user with the same minimal presence role did not see the manager's
   notification in `GET /api/notification`; trigger-config write as a non-admin user returned 403 and the
   non-admin shell navigation did not include "通知设置".
6. Trigger-config UI and negative proof: admin shell navigation included "通知设置"; `/notification/trigger-config`
   loaded `presence.status.changed` as enabled with `部门负责人`. Disabling the trigger by API, then creating
   another presence record, kept manager unread count at 0 and generated no notification for the disabled
   record. `platform.audit_logs` showed successful `notification.trigger-config.update` audit rows.
7. Scheduler: gateway logs during smoke and prod compose bring-up showed `notification.heartbeat` registered
   and both report reminder jobs skipped as disabled placeholders.

Fake-green review:

- Postgres-gated notification coverage was verified by file/test counts: `test:db` ran
  `PostgresNotificationRepository` 1 file / 3 tests under `RUN_POSTGRES_INTEGRATION=true`.
- Web and e2e commands were run with `NODE_ENV=test` to avoid the known local production-mode false failures
  (`React.act is not a function`, `FILE_STORAGE_LOCAL_ROOT is required in production`).
- Live-link pass was based on real source and runtime path: presence publishes `presence.status.changed`,
  the notification subscriber reads `notification.trigger_config`, `RecipientResolver` resolves the department
  manager through the platform port, `NotificationService.create()` persists the row and emits the minimal SSE
  signal, and Workbench Shell refreshes REST data only for `notification.created` while ignoring keepalive /
  unknown frames.
- Docker pass was based on actual build/compose output and image list after removing stale local artifacts:
  no current build produced a notification-api image or compose service.

Exit checklist:

- [x] `modules/notification` contract+api, `notification.*` schema/migrations, dual repository implementations,
      and `db:migrate:notification` in `db:setup`. (§18-1)
- [x] `presence.status.changed` -> department manager notification end-to-end, with in-memory e2e plus
      Postgres/gateway/browser smoke evidence. (§18-2)
- [x] SSE endpoint authenticated by the global guard, sends only the current user's stream, and frontend
      fallback polling / reconnect logic is present and tested. (§18-3)
- [x] Scheduler framework, dynamic schedule config, heartbeat placeholder, and report reminder placeholders
      are in place. (§18-4)
- [x] Platform read port security review was completed in M7-2; this slice did not touch auth/scope/audit/rbac,
      guards, data scope, token/session, or migrations, so no new security-reviewer gate was required. (§18-5)
- [x] `apps/notification-api` is deleted from git and no dev/docker/release/CODEOWNERS/CI deployment reference
      remains. (§18-6)
- [x] Frontend bell, workbench latest-message card, unread stat, SSE consumption, and trigger-config UI consume
      real notification APIs; non-notification placeholders remain intact. (§18-7)
- [x] Trigger-config write API, `notification:trigger-config:manage`, and audit were validated. (§18-8)
- [x] `pnpm verify`, `verify:full`, `docker:build`, compose config, and compose up/down passed locally. (§18-9)

Follow-up:

- M8: people / organization / profile work, including the previously tracked employee bare-id tenant-isolation
  follow-up and forms profile UI integration.

## 2026-06-16

### M7-4b Notification Frontend

Change set:

- Added `@work/http-client.stream()` for SSE over `fetch` + `ReadableStream`, reusing bearer-token
  injection, `onUnauthorized`, trace id, abort cleanup, SSE frame parsing, and keeping tokens out of URLs.
- Wired Workbench Shell notification data: topbar bell unread badge, dropdown notification list, single
  mark-read + source navigation, mark-all-read, workbench unread statistic, and latest-message card now read
  from the notification REST API.
- Added `useNotifications` for initial REST refresh, `notification.created` SSE signal debounce refresh,
  ignored keepalive / unknown events, 60s polling fallback, 5/15/30s reconnect backoff, and cleanup on unmount.
- Added `modules/notification/web` with runtime, trigger-config API client, and `TriggerConfigPage`
  for enabled toggle plus department-manager / role recipients. Registered the module in shell and added the
  notification trigger-config menu to the server-side platform manifest.
- Preserved non-notification M7/M11 placeholders: global search shell, pending items, approval / todo /
  presence placeholder stats, profile menu placeholders, system dynamics, and sidebar badge slot.

Command matrix:

- `pnpm install`: pass; workspace now includes 28 projects and `pnpm-lock.yaml` is updated for
  `@work/notification-web` / shell dependencies.
- Focused `@work/http-client.stream` unit spec: pass, 1 file / 5 tests. Covers two parsed frames,
  Authorization header, token absent from URL, close/abort without `onError`, 401 `onUnauthorized`, and
  stream read error `onError`, including cleanup of caller-provided `AbortSignal` listeners.
- Focused web specs under `NODE_ENV=test`: pass, 3 files / 16 tests
  (`use-notifications`, `App`, `TriggerConfigPage`).
- `pnpm lint`: pass. The normal recursive lint still prints the known "No cached ProjectGraph" warning where
  Nx boundary checks are skipped.
- Primed graph boundary lint: pass for `@work/http-client:lint`, `@work/notification-web:lint`, and
  `@work/workbench-shell:lint`. `@work/workbench-shell` has one existing warning in
  `load-remote-module.ts` (`_descriptor` unused), with 0 errors.
- `pnpm typecheck`: pass; includes `modules/notification/web` and `apps/workbench-shell`.
- `NODE_ENV=test pnpm test`: pass. Unit: 37 files / 175 tests, 5 Postgres-gated files skipped because
  `RUN_POSTGRES_INTEGRATION` is unset. Web: 28 files / 66 tests.
- `NODE_ENV=test pnpm test:e2e`: pass, 7 files / 42 tests.
- `pnpm build`: pass; includes the production Vite build for `apps/workbench-shell` and the lazy
  `TriggerConfigPage` chunk.
- `pnpm verify:full`: not run locally; this slice is pure frontend / http-client and does not touch DB or
  Docker deployment shape. Postgres-gated integration remains CI / Docker-host responsibility.
- `pnpm docker:build`: not required by the task package and not run; no Dockerfile / compose service shape changed.

Review follow-up on 2026-06-17:

- Stabilized `App` login callbacks with `useCallback` so `AppShell` no longer rebuilds the notification API and
  reconnects SSE during bootstrap / unrelated shell rerenders.
- Added regression coverage for one-login-one-stream behavior, notification click navigation to `/presence/board`,
  dropdown close after navigation, hidden bell badge when unread count is zero, 15s second-stage reconnect backoff,
  and optimistic rollback for failed `markRead` / `markAllRead`.
- Kept the optional `readSseBody(done:true) -> onClose` change out of this patch. It would alter the shared
  http-client / hook close semantics beyond the required review fixes; current behavior remains intentional fallback
  to polling + retry when a server / proxy closes the stream.
- Review follow-up focused command:
  `NODE_ENV=test npx vitest run --config vitest.web.config.mts apps/workbench-shell/src/app/App.spec.tsx apps/workbench-shell/src/app/use-notifications.spec.tsx`:
  pass, 2 files / 16 tests. The new stream-stability test was first observed failing against the pre-fix code
  (`stream` called twice), then passed after stabilizing callbacks.
- `NODE_ENV=test npx vitest run --config vitest.config.mts packages/http-client/src/create-http-client.spec.ts`:
  pass, 1 file / 5 tests.
- `NODE_ENV=test npx vitest run --config vitest.web.config.mts`: pass, 28 files / 71 tests. The only stderr is the
  existing React Router v7 future-flag warning.
- `pnpm lint && pnpm typecheck`: pass. Existing lint warnings remain in `apps/im-adapter-api`, `apps/platform-api`,
  and `apps/workbench-shell/src/module-registry/load-remote-module.ts`; no new lint errors.

Fake-green / environment notes:

- Web and e2e commands were run with `NODE_ENV=test` to avoid this Windows shell's `NODE_ENV=production`
  false failures (`React.act is not a function`, `FILE_STORAGE_LOCAL_ROOT` production gate).
- SSE is consumed only through `@work/http-client.stream()`; no native `EventSource`, no shell-local fetch,
  and no token-in-query path was added.

Security / scope notes:

- Non security-reviewer gate by task-package decision: this slice is frontend + shared http-client method only;
  it does not touch auth/scope/audit/rbac, backend endpoints, migrations, or permission semantics.
- Source review check: notification bell / card consume true notification APIs through
  `apps/workbench-shell/src/platform/notification-api.ts`; hard-coded prototype counts or fake notification lists
  were not introduced.
- Independent review and code-simplifier pass completed before final verification. The review found three Major
  issues and two Minor issues: fallback did not immediately REST refresh, caller `AbortSignal` listeners were not
  removed, the bell badge did not expose the visible count, background refresh promises lacked `.catch()`, and the
  related tests were too thin. All were fixed and covered by the focused specs above. Code-simplifier had no required
  changes.

Follow-up:

- M7-5 delivery verification gate for notification + scheduler. Search backend remains M7 follow-up;
  schedule-config UI remains M10.

## 2026-06-15

### M7-3 Scheduler Infrastructure

Change set:

- Added `@nestjs/schedule` and explicit `cron` dependency to `@work/notification-api`.
- Added `notification.schedule_config` migration with idempotent seed for enabled
  `notification.heartbeat` and disabled M10 placeholders `report.reminder.due` /
  `report.reminder.completed`.
- Added schedule config repository contract plus memory / Postgres implementations and
  Postgres-gated integration coverage.
- Added `SchedulerBootstrapService` using `SchedulerRegistry` + dynamic `CronJob`, reading
  cron/enabled from `schedule_config`, best-effort wrapping job handlers, and stopping/deleting
  registered jobs on module destroy.
- Added `HeartbeatJob` with in-process status for assertions and reserved no-op report reminder jobs
  with M10 comments. No HTTP endpoint, permission point, or write audit was added.

Command matrix:

- `pnpm install`: pass; workspace already up to date after scheduler dependencies were declared.
- Focused scheduler unit specs: pass, 3 files / 7 tests (`schedule_config` memory repo,
  bootstrap dynamic registration / cleanup / swallow-error behavior, heartbeat + reserved no-op jobs).
- Focused scheduler e2e: pass, 1 file / 1 test. Gateway composition registers heartbeat from the
  seeded cron `0 * * * *`, skips disabled report placeholders, and `app.close()` exits cleanly.
- Primed Nx graph boundary lint: pass for `@work/notification-api:lint` and `@work/gateway-api:lint`.
- `pnpm verify`: pass. Unit: 35 files / 163 tests, with 5 env-gated Postgres integration files skipped
  when `RUN_POSTGRES_INTEGRATION` is unset. Web: 26 files / 55 tests. E2E: 6 files / 39 tests,
  including `apps/gateway-api/src/scheduler.e2e-spec.ts`. Build passed.
- Postgres-gated `schedule_config` integration is present in
  `modules/notification/api/src/db/postgres-notification.repository.integration.spec.ts`. Local
  `verify:full` was not run because `docker ps` failed with a missing Docker Desktop Linux engine pipe,
  `Test-NetConnection localhost:5432` returned `TcpTestSucceeded: False`, and `psql` is unavailable.
  This is recorded as an environment block; the Postgres path must be covered by CI or a machine with
  PostgreSQL and `RUN_POSTGRES_INTEGRATION=true`.

Security / scope notes:

- Non security-reviewer gate by task-package decision: this slice does not touch auth/scope/audit/rbac,
  does not add HTTP endpoints, permission points, platform read ports, or sensitive fields, and only adds
  notification-owned schema plus in-process scheduling. `docs/security-baseline.md` was therefore not changed.
- `pnpm docker:build` was not run: the task package marks Docker build as non-required unless Dockerfile /
  compose deployment shape changes, and this slice changed neither.
- Post-implementation independent review found one Major: scheduler registration-time failures were logged
  and swallowed, which could let the service start without the heartbeat job. Fixed by making registration /
  config failures fail module initialization while preserving best-effort swallow behavior for job handler
  execution failures; unit coverage now asserts both paths.
- No deployment shape change: no Dockerfile / compose service changes. Deployment docs now call out
  `notification.schedule_config` migration and the single-instance scheduling boundary.

Follow-up:

- M7-4: SSE endpoint + frontend bell / workbench card. M10 owns actual report reminder business logic and
  any future schedule-config write API / audit path.

### M7-4a Notification SSE Backend

> Implemented in a prior session; this entry's command matrix was re-verified end-to-end in a follow-up session
> (evidence-based) before delivery. All conclusions below reflect actual command output in the
> `codex/m7-4a-notification-sse-backend` worktree.

Change set:

- Added `GET /api/notification/stream` on `NotificationController` with Nest `@Sse()`. The route is not
  `@Public`, has no `@RequirePermissions`, and derives the connection user only from `request.currentUser.id`.
- Added `NotificationStreamRegistry`, an in-process user connection table supporting multiple browser tabs,
  per-connection keepalive, `finalize` cleanup, and process-local fan-out. Multi-replica pub/sub remains reserved.
- Wired `NotificationService.create()` as the single generation fan-out point: after persistence, each
  recipient receives only `{ type: 'notification.created' }`; notification title/content/unread count stay REST-only.
- Added explicit `rxjs` dependency to `@work/notification-api` and registered the new stream e2e in the root
  `pnpm test:e2e` script.
- Updated architecture, deployment, security baseline, and progress docs for the SSE endpoint and M7-4a / M7-4b split.

Command matrix (re-verified in the `codex/m7-4a-notification-sse-backend` worktree; conclusions are evidence-based
from actual command output, not assumed):

- `pnpm install`: pass after declaring `rxjs`; `pnpm-lock.yaml` updated. `rxjs@7.8.x` present in
  `node_modules/.pnpm` (both 7.8.1 + 7.8.2 hoists), so the strict-hoist direct `import 'rxjs'` resolves.
- TDD red checks (prior session): new stream unit specs initially failed because stream files did not exist; new
  SSE e2e initially returned 404 for `/api/notification/stream`, then passed after implementation. The e2e binds
  `127.0.0.1` because `::1` fetch failed on this Windows host with `EACCES`.
- `pnpm lint`: **pass, 0 errors.** Only pre-existing warnings remain (im-adapter unused placeholder params,
  platform-api non-null assertions, workbench-shell `_descriptor`) — none introduced by this slice;
  `@work/notification-api` and `@work/gateway-api` lint clean.
- `pnpm typecheck`: **pass** — all 26 workspace projects compile, incl. `modules/notification/api`.
- `pnpm test:unit`: **pass — 36 files / 170 tests**, 5 env-gated Postgres integration files skipped
  (`RUN_POSTGRES_INTEGRATION` unset). Includes the 2 new stream files / 6 tests
  (`NotificationStreamRegistry` registry/keepalive/destroy + `NotificationService.create` minimal-signal fan-out,
  asserting no notification content leaks into the SSE payload).
- `pnpm test:web`: **pass — 26 files / 55 tests** (under `NODE_ENV=test`). An earlier run misreported this as a
  pre-existing `React.act is not a function` toolchain failure; the real root cause is the host shell's
  `NODE_ENV=production` (production React strips `React.act`, so any `@testing-library/react` run fails) — the same
  root cause as the `FILE_STORAGE_LOCAL_ROOT` e2e gate noted below. Re-run under `NODE_ENV=test`, the full web suite
  is green. (Any earlier `Failed to resolve import "@testing-library/react"` was a per-worktree `pnpm install`/hoist
  artifact, not a toolchain defect — the dependency resolves and the suite passes in this worktree.) This slice
  touches no frontend source, so web status is identical to main.
- `pnpm test:e2e`: **pass — 7 files / 42 tests** (incl. `apps/gateway-api/src/notification-stream.e2e-spec.ts`,
  3 tests). Covers no-token 401, `Content-Type: text/event-stream`, receiving `notification.created`,
  only-current-user delivery, and registry connection count returning to zero after HTTP disconnect.
  **Process exits cleanly in ~16s — no vitest "did not exit" hang**, confirming the per-connection keepalive timer
  is destroyed on unsubscribe (`merge(subject$, keepalive$).pipe(takeUntil(destroyed$), finalize(...))`), not a
  module-level shared timer.
- PR gate follow-up: GitGuardian flagged the e2e's literal employee test password as `Generic Password`.
  Replaced the literal with a generated test value and re-ran
  `pnpm exec vitest run --config vitest.e2e.config.mts apps/gateway-api/src/notification-stream.e2e-spec.ts`:
  pass, 1 file / 3 tests.
- `pnpm build`: **pass** — all 26 projects build, incl. `modules/notification/api`, `apps/platform-api`,
  `apps/gateway-api`, and the full `apps/workbench-shell` production vite build.
- Environment note for re-runs: this host's shell has `NODE_ENV=production`, which trips the pre-existing
  `FILE_STORAGE_LOCAL_ROOT is required in production` gate in `readFilesStorageConfig` and blocks any
  `GatewayModule`-loading e2e suite from mounting. That gate is unrelated to this slice (identical on `main`);
  e2e was re-run with `NODE_ENV=test` to exercise the real test path. CI / Docker hosts set `NODE_ENV` + storage
  root correctly.
- `pnpm docker:build`: not required by the task package (no Dockerfile / compose deployment-shape change).
- `pnpm verify:full` / Postgres-gated paths: not run locally (no Docker Desktop Linux engine / local PG); remain
  CI / Docker-host responsibility.

Security / scope notes:

- Security baseline §8.3 now records the SSE guard and minimum-payload baseline. The slice still does not change
  auth/scope/audit/rbac, does not add permissions, and does not modify migrations.
- SSE frames are intentionally signals only; clients must refetch notification list / unread count through REST.
- Completion review (this session, verifying the prior-session WIP): the slice is non-mandatory under
  security-baseline §16 (reuses existing `PlatformAuthGuard`, no new permission points, no auth/scope/audit/rbac
  or migration changes). Spot-checked against the task-package 命门: `/stream` is **not** `@Public`, has **no**
  `@RequirePermissions`, user id comes only from `request.currentUser.id` via the existing `currentUserId(request)`
  helper, and the handler never reads a client-supplied `recipientUserId` — only-own-user delivery is enforced
  both in the registry (`emitToUser` keyed on the server-derived userId) and verified by the SSE e2e.
- Independent general review (current session): Blocking 0 / Major 0 / Minor 0. Reviewer confirmed auth guard use,
  minimum SSE payload, only-current-user delivery, disconnect cleanup coverage, `rxjs` dependency, and docs.
- Voluntary security-reviewer pass (current session): Blocking 0 / Major 0 / Minor 0. Reviewer confirmed `/stream`
  is not public, does not read client recipient ids, sends no title/content/unread payload, and cleans up
  connections on disconnect.
- Code-simplifier pass (current session): no required changes. One readability suggestion in the SSE e2e was applied
  so the created frame is awaited once before payload and non-leak assertions.

Follow-up:

- M7-4b: frontend bell / workbench notification card, SSE consumption, and REST polling fallback.

## 2026-06-14

### M7-2 Event Subscription + Recipient Resolver + Platform Org Port

Change set:

- Added a global `EventBusModule` in `@work/nest-common` so gateway-mounted presence / files / forms /
  notification share one process-local `EVENT_BUS`.
- Extended `presence.status.changed` with `recordId`, `enterpriseId`, and `changeKind`; presence create /
  cancel now publish enough context for notification generation.
- Added `PLATFORM_ORG_PORT` to `@work/platform-contract` and implemented it in platform-api as a
  process-internal read-only org / role lookup returning only user ids.
- Added notification trigger config contract, `notification.trigger_config` migration with default
  `presence.status.changed` seed, memory / Postgres repositories, GET / PUT APIs, permission manifest entry,
  and update audit.
- Added `RecipientResolver` and a best-effort notification event subscriber; `presence.status.changed`
  resolves department manager recipients, excludes the actor, and creates in-app notifications without
  blocking presence on handler failure.
- Switched presence e2e memory runs to `InMemoryPresenceRepository` when `PLATFORM_REPOSITORY_DRIVER=memory`,
  matching notification live-link e2e requirements.

Command matrix:

- `pnpm install`: pass; lockfile updated after new workspace dependencies.
- Focused unit specs: pass, 8 files / 32 tests (`PlatformOrgLookupService`, presence publish payload,
  `RecipientResolver`, notification subscriber, trigger-config service / repository, seed permissions).
- `pnpm --filter @work/notification-api typecheck`: pass.
- `pnpm --filter @work/platform-api typecheck`: pass.
- `pnpm --filter @work/presence-api typecheck`: pass.
- `pnpm typecheck`: pass.
- After security-reviewer Major fix, `pnpm exec vitest run --config vitest.config.mts apps/platform-api/src/org/platform-org-lookup.service.spec.ts`: pass, 1 file / 4 tests.
- After security-reviewer Major fix, `pnpm --filter @work/platform-api typecheck`: pass.
- After security-reviewer Major fix, `pnpm exec vitest run --config vitest.e2e.config.mts apps/gateway-api/src/notification.e2e-spec.ts`: pass, 1 file / 4 tests.
- Primed Nx graph module-boundary lint:
  `pnpm exec nx graph --file=tmp-graph.json`, then `@work/notification-api:lint`,
  `@work/presence-api:lint`, and `@work/gateway-api:lint`: pass. The first primed run caught a real
  boundary error from notification importing `@work/presence-contract`; fixed by using a local minimal event
  payload type and keeping the live e2e as the contract proof.
- `pnpm exec vitest run --config vitest.e2e.config.mts apps/gateway-api/src/notification.e2e-spec.ts`: pass,
  1 file / 4 tests. This covers authenticated notification APIs, no public notification POST, presence
  create / cancel → manager notification through shared event bus, trigger-config permission 403, and
  `enabled=false` suppressing generated notifications.
- `pnpm verify`: pass. Unit: 32 files / 156 tests, with 5 env-gated Postgres integration files skipped when
  `RUN_POSTGRES_INTEGRATION` is unset. Web: 26 files / 55 tests. E2E: 5 files / 38 tests. Build passed.
- Postgres notification repository integration was invoked without `RUN_POSTGRES_INTEGRATION=true` and
  correctly skipped. `docker ps` failed because Docker Desktop Linux engine pipe was unavailable, and
  `Test-NetConnection localhost:5432` returned `TcpTestSucceeded: False`; local `verify:full` is therefore
  blocked by missing local Postgres/Docker and must be covered by CI or a machine with PostgreSQL.

Security notes:

- `PLATFORM_ORG_PORT` only returns user ids, every method takes `enterpriseId`, no public HTTP endpoint was
  added, and notification recipient resolution does not read platform schema.
- `docs/security-baseline.md` §8.2 now documents the process-internal read-only platform port baseline.
- First `security-reviewer` pass found one Major: `resolveDepartmentManager` returned
  `department.managerUserId` without re-checking that manager employee exists, belongs to the same enterprise,
  and is active. Fixed by validating the manager employee before returning the id, with unit coverage for
  missing / disabled / cross-enterprise manager.
- Final `security-reviewer` pass: LGTM, Blocking 0 / Major 0 / Minor 0. The reviewer confirmed the platform
  read port returns only ids, has no HTTP route, filters role recipients by enterprise and active status, and
  keeps notification event handling best-effort.

Follow-up:

- M7-3: scheduler foundation (`@nestjs/schedule`, schedule config, placeholder job). SSE and frontend
  notification UI remain M7-4.

## 2026-06-07

### M7-1 Notification Module Skeleton

Change set:

- Removed the legacy standalone `apps/notification-api` app and `packages/notification-center` package after
  migrating the notification DTOs into `modules/notification/contract`.
- Added `@work/notification-contract` with server-side manifests, empty active platform permissions,
  `notification:trigger-config:manage` as a constant only, notification DTOs/channels, events, and the
  `NOTIFICATION_SERVICE` port.
- Added `@work/notification-api` with `notification.*` migration runner, `notification.notification`
  schema, Postgres + memory repositories, `NotificationService.create()` as an internal provider method,
  and authenticated read-state APIs under `/api/notification`.
- Mounted `NotificationModule` in `gateway-api`; no `RouterModule` entry was added and controllers carry
  their own `notification/...` prefixes.
- Registered the notification platform manifest before seed while keeping `permissions: []`; seed still
  reports `permissionCount=20`, proving the reserved trigger-config permission is not granted to admin in
  this slice.
- Removed notification-api deployment-unit references from production compose, release bundle scripts,
  CODEOWNERS, README, CLAUDE, architecture, deployment, security baseline, and the presence smoke runbook.

HTTP / API coverage:

- `GET /api/notification`: login required; returns only the current user's notifications with pagination
  and unread filtering support.
- `GET /api/notification/unread-count`: login required; returns current user's unread count.
- `PUT /api/notification/:id/read`: login required; marks only current user's notification; other
  recipient's notification returns 404.
- `PUT /api/notification/read-all`: login required; marks current user's unread notifications.
- `POST /api/notification`: intentionally not exposed; e2e asserts authenticated POST returns 404.

Command matrix:

- `pnpm install`: pass twice. First run after deleting the old app/package refreshed workspace state to 25
  projects; second run after adding `modules/notification` registered 27 workspace projects. A final install
  after explicit workspace dependency fixes passed and kept the lockfile consistent.
- Focused notification checks: `@work/notification-contract` typecheck pass; `@work/notification-api`
  typecheck pass; notification unit specs pass (2 files / 2 tests); notification gateway e2e pass (1 file /
  2 tests).
- `pnpm typecheck`: pass.
- `pnpm test`: pass. Unit: 27 files / 144 tests, with 5 env-gated Postgres integration files skipped when
  `RUN_POSTGRES_INTEGRATION` is unset. Web: 26 files / 55 tests.
- `pnpm verify`: pass. E2E includes `apps/gateway-api/src/notification.e2e-spec.ts`; total e2e count 5
  files / 36 tests.
- Primed Nx module-boundary lint: `pnpm exec nx graph --file=tmp-graph.json`, then
  `@work/notification-api:lint` and `@work/gateway-api:lint` both pass; temp graph removed.
- `docker compose -f infra/docker-compose.prod.yml config`: pass. Output has no `notification-api` service,
  no `NOTIFICATION_API_URL`, and `gateway-api` no longer depends on a notification service container.
- `pnpm docker:build`: pass after the final package/lockfile state. Built local service images:
  `infra-platform-api`, `infra-gateway-api`, `infra-im-adapter-api`, `infra-realtime-gateway`, and
  `infra-workbench-shell`.

Postgres / migration verification:

- Local Docker Postgres was available (`work-platform-postgres`, port 5432).
- `pnpm db:setup`: pass with order `platform -> presence -> files -> forms -> notification -> seed`.
  Seed result: `permissionCount=20`.
- `pnpm db:migrate:notification` repeated twice after `db:setup`: pass; no duplicate object output.
- First attempted `db:setup` exposed a real wiring bug: `seed-data.ts` imported
  `@work/notification-contract`, but `apps/platform-api/package.json` did not declare it. Fixed by adding
  explicit workspace dependencies for platform seed and gateway runtime, then reran successfully.
- `pnpm verify:full`: pass with env
  `DATABASE_URL=postgresql://work:work@localhost:5432/work_platform`,
  `RUN_POSTGRES_INTEGRATION=true`, `RUN_POSTGRES_E2E=true`, `PLATFORM_REPOSITORY_DRIVER=postgres`,
  `PLATFORM_BOOTSTRAP_ADMIN_PASSWORD=admin123`.
  - `test:db`: 5 files / 29 tests, including `postgres-notification.repository.integration.spec.ts`.
  - `test:e2e:postgres`: 3 files / 14 tests.

Cleanup assertions:

- `rg @work/notification-center`: no code references remain.
- `rg notification:trigger-config:manage`: appears only in task/RFC text and
  `modules/notification/contract/src/permissions.ts`; it is not in the platform manifest permissions array.
- `rg notification-api`: remaining matches are the new package alias/import, task/RFC text, historical ADR /
  foundation-blueprint references, and older verification-log history. Current deployment/runtime docs no
  longer list a standalone notification-api service.

Follow-up:

- M7-2: event subscription, `RecipientResolver`, and platform read ports; keep trigger-config write API and
  UI out until their planned slice.
- M7-3: scheduling with `@nestjs/schedule`.
- M7-4: SSE / frontend notification UI and trigger-point configuration UI.

## 2026-06-06

### M6-W Frontend Foundation & Workbench Home

Change set:

- Ported `docs/design/ui-handoff/design/tokens.css` into `@work/ui` as the shared token/style entry
  `@work/ui/styles/tokens.css`, with component CSS split into `styles/components.css` and loaded through
  the token entry. `packages/ui/package.json` exports preserve both `"."` and the style subpath.
- Added the first `@work/ui` presentational component layer: Button, Input, Textarea, Select, Tag,
  Avatar, Badge / Dot, EmptyState, Table, Dropdown / Menu, Drawer, Modal / ConfirmDialog, Tabs,
  Segmented, Pager, Checkbox, Switch, and auto-dismissing Toast. Components depend only on React and
  stay outside apps/modules.
- Expanded `vitest.web.config.mts` from modules-only collection to
  `modules/**/web/**/*.spec.tsx`, `packages/**/*.spec.tsx`, and `apps/**/*.spec.tsx`.
- Reworked `workbench-shell` to consume `@work/ui`, import the token CSS once in `src/main.tsx`, render
  the new collapsible app shell, grouped manifest navigation, topbar search / notification / avatar
  shells, restyled login page, and menu-driven workbench home.
- Added `buildNavigationGroups(menus)` while preserving the existing `buildNavigationItems(menus)`
  output contract.
- Kept all prototype-only business data empty/placeholder: approval, todo, message, feed, system
  dynamics, and presence summary cards show "数据待接入" instead of hardcoded demo counts.

Command matrix:

- `pnpm install`: pass; lockfile updated by workspace dependency/devDependency declarations only.
- `pnpm test:web` before include change: pass, 4 files / 19 tests.
- `pnpm test:web` after include + initial specs: pass, 6 files / 28 tests. This confirmed
  `packages/ui` and `apps/workbench-shell` `.spec.tsx` files are collected.
- `pnpm test:web` after independent review fixes: pass, 27 files / 60 tests. Added component-level
  coverage for the `@work/ui` primitives plus topbar outside-click / mutual-exclusion coverage.
- `pnpm test:web` after pre-merge review cleanup: pass, 26 files / 55 tests. The decrease is expected:
  the duplicate aggregate `packages/ui/src/components.spec.tsx` was removed after each primitive moved to
  `packages/ui/src/components/<Name>/<Name>.tsx` with its co-located `<Name>.spec.tsx`.
- `pnpm test`: pass, unit 25 files / 142 tests plus 4 env-gated Postgres integration files skipped
  without `RUN_POSTGRES_INTEGRATION`; web 27 files / 60 tests.
- `pnpm typecheck`: pass; rerun after pre-merge review cleanup also passed.
- `pnpm verify`: pass (`lint && typecheck && test && test:e2e && build`). E2E passed 4 files / 34 tests;
  workbench-shell Vite production build passed.
- `pnpm --filter @work/workbench-shell build`: pass after pre-merge review cleanup.
- Primed Nx boundary lint:
  - `pnpm exec nx graph --file=tmp-graph.json`: pass; temp graph removed.
  - `pnpm exec nx run @work/forms-api:lint`: pass.
  - `pnpm exec nx run @work/files-api:lint`: pass.
  - `pnpm exec nx run @work/gateway-api:lint`: pass.
  - `pnpm exec nx run @work/workbench-shell:lint`: pass with one pre-existing unused `_descriptor`
    warning in `load-remote-module.ts`.
  - `pnpm exec nx run @work/ui:lint`: pass.

Acceptance notes:

- [x] `packages/ui` exports token style entry and the requested base primitives; no `apps/*` or
      `modules/*` imports were introduced. Pre-merge review cleanup aligned the library structure with
      `packages/ui/src/components/<Name>/<Name>.tsx` plus co-located specs and removed duplicate aggregate
      component tests.
- [x] `workbench-shell` renders the new shell using `@work/ui`; sidebar collapse persists in localStorage.
- [x] Topbar search / notifications / avatar menus are interactive shells; data-backed search and
      notifications remain M7 follow-up.
- [x] Login page visual was rebuilt on shared components without changing auth behavior.
- [x] Workbench home uses real `currentUser` and manifest menus for greeting and quick entries.
- [x] Unavailable prototype data is empty/placeholder. Demo numbers (approval 12 / todo 9 / unread 5 /
      presence 231) are not hardcoded into the home component.
- [x] Menu grouping consumes `MenuDto.parentId`; icon mapping is frontend-only by `moduleName`; badge slot
      exists but has no live count source.
- [x] Existing module mount seam remains manifest/router driven; presence web specs still pass under the
      new web test matrix.

Independent review closure:

- Sub-agent review #1 found a blocking topbar regression: search closed only on Esc and could remain open
  while notification/avatar popovers opened. Fixed by using a single topbar popover state, adding search
  outside-click close, and covering outside-click / mutual exclusion in `App.spec.tsx`.
- Sub-agent review #2 found insufficient `@work/ui` style/test rigor: component CSS lived in the token file,
  specs were too aggregated, and Toast did not own auto-dismiss behavior. Fixed by splitting
  `styles/components.css`, moving component sizes/focus/shadow values to CSS variables, adding component-level
  specs, and making `Toast` auto-dismiss when `onClose` is provided.
- Pre-merge review cleanup moved component source from the aggregate `components.tsx` into per-component
  directories, deleted the duplicate aggregate spec, and tokenized common shell font/control sizing while
  keeping layout-specific dimensions as shell-local CSS variables.
- Independent pre-merge cleanup review returned `PASS_WITH_NOTES`; the noted self-referential shell CSS
  variables were corrected, and existing named form prop types were exported from `@work/ui`.

This slice intentionally did not:

- Implement forms config/fill UI. That moved to M8, where `profile.employee` becomes the real consumer.
- Add a backend menu `icon` or badge contract. Icons remain frontend mapping and badge counts are reserved.
- Add search or notification backends. Those remain M7 follow-up.
- Change backend APIs, contracts, migrations, schema, permissions, or deployment.

Follow-up:

- M7: search / notification backend sources for topbar and home message blocks.
- M8: forms UI for `profile.employee` configuration/fill controls and organization/personnel flows.
- Reserved: backend menu icon / badge-count contract if product needs server-driven icons or live badges.

### M6-4 Forms & Files Backend Delivery Verification

Scope:

- Closed the M6 backend delivery gate for `docs/rfc/m6-dynamic-forms-file-storage.md`.
- No new feature API was added. Record submit/read remains a `FORMS_SERVICE` port surface by design; M6
  still does not expose a generic Forms record HTTP route.

Change set:

- Validation-exposed fix: `vitest.e2e.config.mts` now sets `hookTimeout: 30000` to match the existing
  `testTimeout`. The first full-chain Postgres run exposed 10s `beforeAll` hook timeouts in gateway
  Postgres e2e suites after the long verify chain; the same suites passed on focused rerun, and the final
  `verify:full` passed after aligning hook timeout.
- Low #1 closed: Forms `date` values now require strict ISO-8601 date / date-time shape and valid calendar
  date before `Date.parse` validation. Added service spec assertions that `2026/06/06` and `2026-02-30`
  are rejected.
- Low #2 closed: `FormsPort.getRecord` documents that missing record permission returns 404 intentionally
  to prevent record-id enumeration.
- Reviewed Docker/deployment docs for Files local storage: production compose has `files-data` mounted at
  `/var/lib/work-platform/files`, storage env vars are present, and deployment docs cover coordinated
  PostgreSQL + Files volume backup/restore.

Command matrix:

- `pnpm install`: pass; lockfile unchanged.
- Targeted Low test:
  - `pnpm vitest run --config vitest.config.mts modules/forms/api/src/forms/forms.service.spec.ts`: pass,
    1 file / 6 tests.
- Fast path:
  - `pnpm verify`: pass.
  - Unit/node without Postgres env: 25 files passed / 140 tests passed, 4 env-gated integration files
    skipped.
  - Web/jsdom: 4 files / 19 tests.
  - Memory e2e: 4 files / 34 tests.
  - Build: pass.
  - Existing warning-only lint output remains in `im-adapter-api`, Platform controllers, and
    `workbench-shell`; no errors.
- Primed-graph module-boundary lint:
  - `pnpm exec nx graph --file=tmp-graph.json`: pass; temporary graph output removed.
  - `pnpm exec nx run @work/forms-api:lint`: pass.
  - `pnpm exec nx run @work/files-api:lint`: pass.
  - `pnpm exec nx run @work/gateway-api:lint`: pass.
- Local PostgreSQL:
  - `docker compose -f infra/docker-compose.yml up -d postgres`: pass; compose reported existing orphan
    containers, left untouched.
  - Env set: `DATABASE_URL`, `RUN_POSTGRES_INTEGRATION=true`, `RUN_POSTGRES_E2E=true`,
    `PLATFORM_REPOSITORY_DRIVER=postgres`, `FILES_REPOSITORY_DRIVER=postgres`,
    `FORMS_REPOSITORY_DRIVER=postgres`, `PLATFORM_BOOTSTRAP_ADMIN_PASSWORD=admin123`,
    `PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD=true`, and local Files storage low-threshold env.
  - `pnpm db:setup`: pass; order was platform -> presence -> files -> forms -> seed; seed reported
    `permissionCount=20`.
  - Migration idempotency re-run: `pnpm db:migrate:files` and `pnpm db:migrate:forms` both passed with no
    duplicate object errors and no extra migration output.
  - First `pnpm verify:full` attempt: failed only in `test:e2e:postgres` because two gateway suites exceeded
    Vitest's default 10s hook timeout; focused `pnpm test:e2e:postgres` immediately passed, confirming a
    verification stability issue rather than a failed business assertion. Fixed by setting e2e
    `hookTimeout=30000`.
  - Final `pnpm verify:full`: pass.
    - Unit/node with Postgres env: 29 files / 168 tests.
    - Web/jsdom: 4 files / 19 tests.
    - Memory e2e: 4 files / 34 tests.
    - `test:db`: 4 files / 28 tests.
    - `test:e2e:postgres`: 3 files / 14 tests.
- Docker:
  - First `pnpm docker:build` attempt reached image export, then Docker Desktop failed with
    `parent snapshot ... does not exist`, a local builder cache/snapshot failure.
  - `docker builder prune -f` removed stale build cache.
  - Final `pnpm docker:build`: pass; production images built for `platform-api`, `gateway-api`,
    `notification-api`, `im-adapter-api`, `realtime-gateway`, and `workbench-shell`.

API smoke:

- Ran a temporary e2e smoke against real PostgreSQL + `GatewayModule`; the temporary spec was removed after
  execution.
- HTTP steps:
  - `POST /api/platform/auth/login`: 201, admin token returned.
  - `GET /api/platform/employees`: 200, selected seeded admin employee id.
  - `GET /api/forms/definitions/profile.employee`: 200, current revision read.
  - `PUT /api/forms/definitions/profile.employee`: 200, ownerModule stayed server-derived as `profile`;
    fields configured: `nickname`, `joinedAt`, `owner`, `attachment`.
  - `POST /api/files`: 201, returned staged `text/plain` file metadata with opaque file id.
  - `GET /api/forms/definitions/profile.employee` without token: 401.
  - Same GET as an authenticated user without slot permission: 403.
  - `GET /api/forms/definitions/report.weekly` and `missing.slot`: 404 before permission.
- Record path:
  - Production has no generic record HTTP route by RFC §5.5. The smoke used `FORMS_SERVICE.createRecord` and
    `FORMS_SERVICE.getRecord` in the same gateway process after the HTTP definition/upload steps.
  - Created and read a `profile.employee` singleton record containing `file` and `employee` values.
  - Readback preserved `fieldLabelSnapshot` / `fieldTypeSnapshot`; employee field had display snapshot; file
    field stored only opaque file id.
  - Binding another user's staged file id returned 404; binding an unknown file id returned 404.

Exit checklist:

- [x] Authorized API caller can configure registered slot fields; no arbitrary form creation route exists.
- [x] Records can be stored/read through the Forms port; historical label/type/display snapshots are stored.
- [x] File and employee fields enforce same-tenant validation; file values store only opaque file ids.
- [x] Local disk provider persists files; Docker volume and backup/restore documentation are present.
- [x] Staged TTL cleanup, references, tenant/user quota, upload rate limits, low-disk rejection, and warning
      observability were implemented in M6-2 and re-covered by tests / verification.
- [x] No generic content download route exists for bare file ids.
- [x] Forms/files schema, contract, repository, migrations, manifest, audit, events, and tests are present.
- [x] Security baseline is synchronized; M6-2 and M6-3 security-reviewer passes have no unresolved High /
      Medium blockers.
- [x] `pnpm verify`, Postgres `verify:full`, Docker build, primed-graph boundary lint, migration idempotency,
      and API/port smoke all passed after the validation-exposed hook-timeout fix.

Follow-up:

- M6-W: forms/files configuration page + fill-in controls, product prototype available, separate task package.
- M7 remains next backend infrastructure milestone after M6-W.

## 2026-06-05

### M6-3 Forms Definition And Record API

Scope:

- Implemented the M6-3 backend slice from `docs/rfc/m6-dynamic-forms-file-storage.md`.
- Added fixed-slot Forms definition HTTP API, Forms record service / port, snapshot record values,
  file-field attachment through the Files port, employee-field validation through a Platform lookup port,
  audit/events, and memory/PostgreSQL repository support.
- Did not add Web configuration / fill-in UI and did not expose generic Forms record HTTP list/read routes.
  Records remain available through `FORMS_SERVICE` for authorized domain services.

Change set:

- Contract / slots:
  - Added the fixed Forms slot registry with active `profile.employee` and `report.daily` slots plus
    reserved `report.weekly` and `presence.status.<code>` handling.
  - Slot metadata declares owner module, cardinality (`profile.employee` singleton, `report.daily` append),
    and dynamic definition permissions.
  - Exported slot helpers from `@work/forms-contract` and kept `ownerModule` server-derived.
- Definition API:
  - Added `GET /api/forms/definitions/:slotKey` and `PUT /api/forms/definitions/:slotKey` under the gateway
    `/api/forms` prefix.
  - Added `FormsDefinitionPermissionGuard`: unknown/reserved slots return 404 before permission checks;
    active profile/report slots require their own `forms:*:definition:{view,manage}` permissions.
  - Definition updates use optimistic revision checks. First persisted update from the virtual revision `0`
    creates revision `1`; stale updates return 409.
- Record service / port:
  - Implemented `FORMS_SERVICE` with `createRecord` / `getRecord`, required `forms:record:{submit,view}`
    permissions, snapshot field labels/types/sort orders, definition revision checks, singleton replacement,
    append semantics, and `forms.record.created` events.
  - File/image values are validated as file-id arrays and attached through `FILE_STORAGE_SERVICE.attachFiles`
    inside the caller's opaque `UnitOfWork`; stored record values contain only file IDs.
  - Employee values are validated via `PLATFORM_EMPLOYEE_LOOKUP_SERVICE`, only same-tenant active employees are
    accepted, and minimal display snapshots are stored with record values.
- Platform lookup and boundaries:
  - Added `PLATFORM_EMPLOYEE_LOOKUP_SERVICE` / `PlatformEmployeeLookupPort` in `@work/platform-contract` and
    implemented it in Platform API with same-tenant active employee filtering and minimal department snapshots.
  - Updated `docs/module-contract.md §7.1.6` to mark employee lookup as an available Platform outlet and kept
    department-tree lookup as a future outlet.
  - Extended Nx module-boundary constraints so Forms can depend on the Files and Platform contract/provider
    surfaces needed for M6-3 while still preserving schema ownership and no cross-schema SQL.
- Repository:
  - Added memory and PostgreSQL `replaceDefinitionFields`, `findDefinitionWithFields`,
    `saveRecordWithValues`, and `findRecordWithValues`.
  - PostgreSQL reuses the Files opaque UnitOfWork context without exposing `files.*` table definitions; Forms
    repository only writes `forms.*`.
  - Validation exposed a PostgreSQL-only revision mismatch bug in the first PUT path; fixed by creating the
    initial persisted definition at revision `1` instead of attempting to insert revision `0`.
- Tests:
  - Added Forms service unit coverage for definition revision conflicts, file attach invocation, employee
    display snapshots, immutable historical snapshots, singleton records, singleton file-reference binding to
    the actual record id, invalid required values, and missing employee IDs.
  - Added Platform employee lookup unit coverage for tenant/status filtering and empty lookups.
  - Added gateway Forms definition e2e coverage for 401, 403, unknown/reserved 404-before-permission,
    dynamic report/profile permissions, ownerModule derivation, stale revision 409, and invalid payload 400.
  - Extended PostgreSQL Forms repository integration to cover idempotent migration, tenant isolation,
    composite FK rejection, unit-of-work definition replacement, singleton save, revision conflict, and
    concurrent first submissions for the same singleton subject.

Validation:

- `pnpm install`: pass; lockfile updated by pnpm for new Forms API dependencies.
- Warmed Nx graph:
  - `pnpm nx graph --file=tmp-nx-graph.json`: pass.
  - `pnpm nx run @work/forms-api:lint`: pass.
  - `pnpm nx run @work/gateway-api:lint`: pass.
- Targeted checks:
  - `pnpm --filter @work/forms-api typecheck`: pass.
  - `pnpm --filter @work/platform-api typecheck`: pass.
  - `pnpm vitest run --config vitest.config.mts apps/platform-api/src/users/employee-lookup.service.spec.ts modules/forms/api/src/forms/forms.service.spec.ts`: pass, 2 files / 7 tests.
  - `pnpm vitest run --config vitest.e2e.config.mts apps/gateway-api/src/forms-definition.e2e-spec.ts`: pass, 1 file / 4 tests.
  - Post-review hard-limit coverage:
    - `pnpm install`: pass after removing an unused `@work/errors` dependency from `@work/forms-api`.
    - `pnpm vitest run --config vitest.config.mts modules/forms/api/src/forms/forms.service.spec.ts`: pass,
      1 file / 6 tests. Added assertions for definition field count, option count, record values JSON size,
      text / textarea length, multi-select, file, image, and employee array hard limits from RFC §11.1.
    - `pnpm --filter @work/forms-api typecheck`: pass.
    - `pnpm nx run @work/forms-api:lint`: pass with warmed Nx graph.
- Fast path:
  - `pnpm lint`: pass with existing warning-only output in `im-adapter-api`, `platform-api` controllers, and
    `workbench-shell`.
  - `pnpm typecheck`: pass.
  - `pnpm test:unit`: pass without Postgres env, 25 files / 139 tests, 4 env-gated integration files skipped.
  - `pnpm test:web`: pass, 4 files / 19 tests.
  - `pnpm test:e2e`: pass, 4 files / 34 tests.
  - `pnpm build`: pass.
- Local PostgreSQL full path:
  - Started Docker PostgreSQL through `docker compose -f infra/docker-compose.yml up -d postgres`.
  - Set `DATABASE_URL`, `RUN_POSTGRES_INTEGRATION=true`, `RUN_POSTGRES_E2E=true`,
    `PLATFORM_REPOSITORY_DRIVER=postgres`, `FILES_REPOSITORY_DRIVER=postgres`,
    `FORMS_REPOSITORY_DRIVER=postgres`, `PLATFORM_BOOTSTRAP_ADMIN_PASSWORD=admin123`,
    `PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD=true`, and local Files storage env vars.
  - `pnpm db:setup`: pass; seed reported `permissionCount=20`.
  - Re-ran `pnpm db:setup` after adding `0001_singleton_record_unique.sql`: pass; migrations were
    idempotent and seed still reported `permissionCount=20`.
  - First `pnpm verify:full` attempt failed in `postgres-forms.repository.integration.spec.ts`: initial
    `replaceDefinitionFields` tried to insert `revision=0`, violating `forms.form_definitions` check
    constraint. Fixed in this slice and reran.
  - `pnpm vitest run --config vitest.config.mts modules/forms/api/src/db/postgres-forms.repository.integration.spec.ts`: pass, 1 file / 4 tests.
  - Final `pnpm verify:full`: pass.
    - Unit/node with Postgres env: 29 files / 167 tests.
    - Web/jsdom: 4 files / 19 tests.
    - Memory e2e: 4 files / 34 tests.
    - `test:db`: 4 files / 28 tests.
    - `test:e2e:postgres`: 3 files / 14 tests.
- `pnpm docker:build`:
  - Earlier M6-3 run before the security-review fixes passed; registry fetch emitted transient `ECONNRESET`
    retries, then production images built successfully.
  - Re-run after the final security-review fixes reached image export, then Docker Desktop failed preparing
    extraction snapshots with `parent snapshot ... does not exist`. This is a local Docker builder/cache
    failure after package install and app build stages, not a TypeScript or application build failure.
  - After `docker builder prune -f`, a retry hit transient registry/network failures. Final retry with
    `NPM_REGISTRY=https://registry.npmmirror.com` passed and built all production images.

Security review:

- First `security-reviewer` pass found 2 Medium issues:
  - Singleton `profile.employee` replacement could attach files to a newly generated record id while the
    repository reused an existing singleton record id. Fixed by splitting repository record persistence into
    `reserveRecord` and `replaceRecordValues`; Forms service now reserves the final record id in the opaque
    UnitOfWork, attaches files to `forms/form_record/<reserved.id>`, then writes values. Added a unit test for
    second singleton file submission binding to the actual record id.
  - Forms write audits lacked complete actor/request context. Fixed by adding `account` to `FormActorContext`,
    optional `FormAuditContext` to `FormsPort.createRecord`, and writing `actorAccount`, `traceId`, `ip`, and
    `userAgent` for definition and record writes.
- Follow-up security pass found 1 Medium:
  - PostgreSQL singleton first submissions were still race-prone because the schema had only a non-unique
    subject index. Fixed with `0001_singleton_record_unique.sql`, a partial unique index for
    `profile.employee`, and a savepoint-backed concurrent conflict path in `reserveRecord`. Added a Postgres
    integration test with 8 concurrent first submissions asserting one record id and one DB row.
- Final `security-reviewer` pass after the singleton concurrency fix: PASS / 可合入. The reviewer found no
  blocking High or Medium issues, confirmed unknown / reserved Forms slots return 404 before permission checks,
  dynamic slot permissions are enforced, `createRecord` is tenant-scoped and uses same-tenant active employee
  lookup, file/image attachments bind to the actual singleton record id inside the Files UnitOfWork, the
  PostgreSQL singleton race is closed by the partial unique index plus savepoint conflict path, write audits
  include actor/request context, and no generic content-download route was added. Non-blocking observation:
  `UNIT_OF_WORK_CONTEXT` is exported from the Files contract, but repository-side `WeakMap` validation prevents
  callers from forging a usable UnitOfWork.
- Independent human review after the security pass accepted the slice for merge and identified one Medium test
  gap: RFC §11.1 hard input limits were implemented but not individually asserted. Fixed in this branch with
  focused `FormsService` unit coverage for those limits. Follow-up notes from the review remain non-blocking:
  document the port-level record permission 404 semantics when exposing future HTTP record routes, consider
  strict ISO date validation, and keep the RFC port examples aligned with `Symbol.for(...)`.

Follow-up:

- M6-4: backend delivery verification and API smoke.
- M6-W: Frontend foundation (design tokens + @work/ui + app shell + workbench home); forms config/fill UI moved to M8. (Redefined 2026-06-06)
- M10 follow-up: `report.daily` append records still need business-day subject-key semantics when Daily Report
  is implemented.

### M6-2 Local Disk Files Provider Upload API Lifecycle Abuse Controls

Scope:

- Implemented the M6-2 backend slice from `docs/rfc/m6-dynamic-forms-file-storage.md`.
- Added real local-disk file storage, upload metadata APIs, staged lifecycle handling, abuse controls,
  deployment volume changes, and operator cleanup command.
- Did not implement Forms definition / record APIs, Forms file-field integration, or a generic file-content
  download route. Content remains private and is exposed only through `FILE_STORAGE_SERVICE.openFile` for
  later authorization-aware domain services.

Change set:

- Contract / port:
  - Added upload input and file-storage constants for max bytes, original-name bounds, staged TTL, tenant /
    user quotas, rate limits, disk thresholds, and cleanup interval.
  - Kept the allowlist conservative: jpeg, png, webp, pdf, plain text, and csv. OOXML is intentionally not
    allowed in M6-2 because ZIP container validation is not strong enough for this security surface.
  - Extended `FILE_STORAGE_SERVICE` with `withUnitOfWork(...)` so callers can wrap file attachment in their
    own transaction boundary.
- Local provider:
  - Added `LocalFileStorageProvider` with `FILE_STORAGE_LOCAL_ROOT`, production startup validation,
    server-generated storage keys `<enterpriseId>/<yyyy>/<mm>/<uuid>`, temp-write then atomic rename, root
    containment checks for open/delete, original-name sanitization, max-size enforcement, allowlist checks,
    and magic-byte detection.
  - Added injectable clock and disk-space probe for deterministic TTL and low-disk tests.
- Repository and lifecycle:
  - Added memory and PostgreSQL repository support for staged object creation with quota enforcement,
    owner-bound metadata lookup, unit-of-work-backed attachment, expired staged claims, deletion marking, and
    stored-byte accounting.
  - PostgreSQL serializes tenant/user quota checks with transaction-scoped advisory locks before inserting
    staged objects, so concurrent uploads cannot overshoot quota. Memory mirrors the same behavior with an
    in-process quota lock and rollback snapshot.
  - `attachFiles` now performs `staged -> attached` inside the caller-provided unit of work and writes
    `files.file_references` atomically. Exact same-reference retries are idempotent; different references,
    other-uploaded staged files, deleting, deleted, or cross-tenant objects are rejected as missing.
  - Staged cleanup claims expired objects to `deleting`, removes disk content, then marks `deleted`; disk
    deletion failure leaves `deleting` for retry and writes bounded failure audit metadata.
- HTTP API and gateway:
  - Added `POST /api/files` multipart single-file upload protected by `files:object:upload`.
  - Added `GET /api/files/:id` owner-only metadata lookup protected by `files:object:view-own`.
  - Added a dynamic Multer interceptor so the multipart limit follows `FILE_STORAGE_MAX_BYTES`.
  - Cross-tenant, unknown, malformed, deleted, and non-owner metadata reads return 404.
  - No generic content-download endpoint was added.
- Abuse controls:
  - Added per-process upload rate limiting: count per minute and bytes per hour return 429 on exceed.
  - Added tenant quota, user quota, staged TTL, low-disk rejection, and periodic `FilesCleanupService`.
  - Added `pnpm files:cleanup-staged` for one-shot operations.
- Deployment and security docs:
  - Added `files-data` persistent Docker volume and gateway file-storage environment variables.
  - Updated deployment/backup docs to treat the files volume as a sensitive backup object alongside
    PostgreSQL, including ACL, retention/deletion, coordinated backup, restore, and metadata-volume
    integrity checks.
  - Updated `docs/security-baseline.md` with the private file-upload and local-storage baseline.

Validation:

- `pnpm install`: pass; lockfile updated by pnpm for the new Files API dependency.
- `pnpm nx graph --file=tmp-nx-graph.json` + `pnpm nx run @work/files-api:lint` + `pnpm nx run
@work/gateway-api:lint`: pass with warmed Nx graph; temporary graph output removed.
- `pnpm verify`: pass.
  - Unit/node: 23 files passed, 132 tests passed. Without Postgres env, 4 env-gated integration specs are
    skipped.
  - Web/jsdom: 4 files passed, 19 tests passed.
  - Memory e2e: 3 files passed, 30 tests passed.
  - Build: pass.
  - Existing warning-only lint output remains: unused placeholder args in `im-adapter-api`, non-null
    assertions in existing platform controllers, and one workbench-shell unused placeholder.
- Local PostgreSQL full path:
  - Started Docker PostgreSQL `postgres:15` on port 55433.
  - Set `DATABASE_URL`, `RUN_POSTGRES_INTEGRATION=true`, `RUN_POSTGRES_E2E=true`,
    `PLATFORM_REPOSITORY_DRIVER=postgres`, `PLATFORM_BOOTSTRAP_ADMIN_PASSWORD=admin123`,
    `PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD=true`, and Files storage env vars for a temp local root.
  - `pnpm db:setup`: pass. Applied platform, presence, files, and forms migrations; seed reported
    `permissionCount=20`.
  - One long-chain `pnpm verify:full` attempt after the upload-audit fix exposed transient Vitest worker
    `ERR_IPC_CHANNEL_CLOSED` during `test:e2e:postgres` after two postgres e2e suites had already passed.
    Re-running `pnpm test:e2e:postgres` passed, and the final full-chain retry passed.
  - Final `pnpm verify:full`: pass.
    - Unit/node: 27 files passed, 158 tests passed with Postgres integration enabled.
    - Web/jsdom: 4 files passed, 19 tests passed.
    - Memory e2e: 3 files passed, 30 tests passed.
    - `test:db`: 4 files passed, 26 tests passed.
    - `test:e2e:postgres`: 3 files passed, 14 tests passed.
- `pnpm docker:build`: pass. Registry fetch emitted transient `ECONNRESET` retries, then all production
  images built successfully.

Security review:

- `security-reviewer` first pass found blocking issues during implementation: `attachFiles` ignored caller
  unit-of-work, OOXML ZIP validation was insufficient, upload failure audit included raw error messages, the
  Multer interceptor used a static default max size, and disk threshold checks used pre-write free space.
- Fixes applied before final verification: attachment now requires `withUnitOfWork`, OOXML is not in the M6-2
  allowlist, failure audits use bounded reason codes, Multer file size is config-driven, and disk threshold
  checks use projected post-write free space under a write lock.
- Independent final pass found one remaining Medium: `FILE_STORAGE_SERVICE.openFile(actor, fileId)` still
  accepted a same-tenant bare `fileId`, so later business proxies could accidentally expose another user's
  attached content or staged/deleting content if they did not duplicate reference checks.
- Fixed the Medium by changing the port to `openFile(actor, OpenFileInput)` where `OpenFileInput` includes
  `fileId`, `ownerModule`, `referenceType`, and `referenceId`. Both memory and PostgreSQL repositories now
  resolve content only through a matching `files.file_references` row and require the object to be
  `status='attached'`; no-reference, wrong-reference, staged, deleting, deleted, cross-tenant, or unknown
  objects return 404 through the service.
- Added service coverage for staged-denied, matching-reference success, wrong-reference 404, and cross-tenant 404. Synchronized `docs/security-baseline.md` and the M6 RFC port example to make the reference-bound
  `openFile` contract explicit.
- Security-reviewer follow-up pass on this Medium: LGTM / 可合入. The reviewer confirmed no new High or
  Medium findings, no public content-download route, no legacy `openFile(actor, fileId)` call sites, and
  reference-bound `openFile` behavior matching `docs/security-baseline.md` §8.1. The reviewer only skipped
  Postgres integration locally due env gate; this branch's own Docker-backed `pnpm verify:full` above executed
  the Postgres integration and e2e gates with env enabled.
- Post-review security audit fixes:
  - A later security review found the upload failure audit path was still incomplete: rate-limit 429 was
    outside the service `try`, and controller-level missing-file / extra-field 400s could return before
    `files.object.upload` failure audit. The service now audits 429 from inside the upload `catch`, and the
    controller records bounded failure audit before rejecting missing files or unexpected body fields.
  - The real HTTP multipart path also needed interceptor-level coverage because Multer rejects extra fields
    and oversized files before controller execution. `FilesUploadInterceptor` now catches Multer/Nest upload
    rejection errors, records bounded `files.object.upload` failure audit, and then returns normalized 400/413.
    Non-env-gated interceptor tests cover `.field(...)` and oversized-file requests through a real Nest
    interceptor.
  - The rate limiter was split into per-minute attempts and hourly successful bytes. Rejected MIME/quota/storage
    failures no longer consume the hourly byte budget; successful bytes are recorded only after staged metadata
    is persisted.
  - Added non-env-gated service/controller/interceptor/provider tests for 429 failure audit, missing-file and
    extra-field 400 failure audit, real Multer 400/413 failure audit, rejected-byte accounting, and low-disk 503
    upload failure audit. The low-disk test exercises `FilesService.uploadFile`, asserts
    `ServiceUnavailableException`, and asserts bounded failure metadata without path or file content.
  - Final `security-reviewer` pass after these fixes: PASS. The reviewer confirmed no remaining High/Medium
    findings for the upload failure audit blocker and checked the changes against RFC §8.2/§9 and
    `docs/security-baseline.md` §6/§8.1.

Follow-up:

- M6-3: implement Forms definition / record APIs, snapshot record values, file fields, and people fields
  against the M6-1/M6-2 ports and security invariants.
- Future hardening: if office documents become required, add a dedicated OOXML parser/validator instead of
  relying on ZIP filename heuristics.
- Future hardening: move per-process upload rate limiting and cleanup scheduling to shared coordination before
  horizontally scaling gateway instances; remove `storageKey` from public metadata DTOs; force attachment and
  `nosniff` on any future content proxy for text/csv; keep memory repository idempotency parity and injected
  clock refinements on the M6 hardening list.

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

Independent review follow-up:

- `security-reviewer` found no blocking issue in the M6-1 forms/files scaffold itself.
- The review did surface a pre-existing platform employee tenant-isolation gap in
  `PUT /api/platform/employees/:id/status` and `PUT /api/platform/employees/:id/password`: both paths accepted a
  raw target employee id and did not verify it belonged to `request.currentUser.enterpriseId`.
- Fixed in this branch because it is backend security baseline work: employee status update and password reset now
  receive the authenticated tenant from the controller, reject cross-tenant targets as 404, write bounded failure
  audit records, and use repository write-side tenant guards to prevent TOCTOU-style cross-tenant mutation.
- Added memory and PostgreSQL e2e coverage proving cross-tenant status/password mutations return 404 and do not
  change the foreign employee.
- Second security-reviewer pass confirmed the High finding is closed with no blocking findings. A low-severity
  regression-test suggestion was also covered: memory and PostgreSQL e2e now assert the foreign employee password
  hash still matches the original password and not the rejected reset password.
- Independent quality/boundary review found one merge blocker: with a warmed Nx project graph,
  `nx run @work/gateway-api:lint` failed because `eslint.config.mjs` did not include `scope:forms` /
  `scope:files` in the composition allowlist and did not define dep constraints for the new module scopes.
- Fixed the boundary gate by adding forms/files dep constraints, allowing composition to depend on them, and
  documenting the already-existing shared-backend exception for `presence-api -> platform-api` and
  `platform-api` seed manifest reads in the same lint config. Moved gateway-level e2e specs under
  `apps/gateway-api/src` so feature modules no longer create test-only reverse dependencies on gateway.
- Ran targeted Prettier formatting on the M6-1 change set after the review finding.
- A follow-up independent review noted the `scope:platform` allowlist was wider than the seed manifest use case.
  Tightened it to `scope:platform`, `scope:shared`, and `type:contract`, so platform can read module contracts
  for manifests without allowing future dependencies on business API or web packages.

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
  - Re-ran after the independent security-reviewer follow-up fix; final `pnpm verify` and Docker-backed
    `pnpm db:setup && pnpm verify:full` remained pass.
  - Re-ran after the lint-boundary fix and Prettier pass:
    - `pnpm nx run @work/gateway-api:lint`: pass with warmed Nx graph.
    - `pnpm lint`: pass.
    - `pnpm verify`: pass.
    - Docker-backed `pnpm db:setup && pnpm verify:full`: pass.
  - Re-ran after tightening `scope:platform` to contract-only access:
    - `pnpm nx run @work/gateway-api:lint`: pass.
    - `pnpm --filter @work/platform-api lint`: pass, warning-only.
    - `pnpm lint`: pass.
    - `pnpm verify`: pass.
    - Docker-backed `pnpm db:setup && pnpm verify:full`: pass.
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
