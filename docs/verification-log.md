# Verification Log

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
