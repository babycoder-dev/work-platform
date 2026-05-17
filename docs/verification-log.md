# Verification Log

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
