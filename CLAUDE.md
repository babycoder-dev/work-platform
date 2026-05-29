# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

This repo is doc-driven. Two entry files carry binding rules that are **not repeated here**:

- `AGENTS.md` — module-boundary rules, required reading order, unified error format, commit conventions, desktop/IM constraints. Treat it as authoritative.
- `docs/doc-index.md` — document priority order and which doc to update when. When docs conflict, ADR > constitution > foundation-blueprint > foundation-progress > RFC > architecture > topic docs > task packages.

Before non-trivial work, check `docs/foundation-progress.md` for the current milestone/blockers, and the relevant `docs/rfc/*.md` for the active milestone.

## Commands

Package manager is **pnpm 10** (via corepack); build orchestration is **Nx 20**. Run all commands from the repo root.

```bash
corepack enable && pnpm install      # local setup
pnpm install --frozen-lockfile       # CI / delivery / docker (lockfile must stay committed)
```

Delivery gate — run before claiming work complete (see `docs/development-workflow.md`):

```bash
pnpm verify        # lint && typecheck && test && test:e2e && build  (fast, no DB/docker)
pnpm verify:full   # verify + test:db + test:e2e:postgres            (requires a running Postgres)
pnpm docker:build  # additionally run if the change affects deployment
```

### Test matrix

There are **three Vitest configs**, split by file suffix and environment. Use the matching config or tests silently won't be collected:

- `vitest.config.mts` — unit, `*.spec.ts`, node env (excludes `*.e2e-spec.ts` and `*.spec.tsx`)
- `vitest.web.config.mts` — web/React, `*.spec.tsx`, jsdom env
- `vitest.e2e.config.mts` — `*.e2e-spec.ts`

```bash
pnpm test            # unit + web
pnpm test:e2e        # in-memory e2e (no DB)
# run a single file / test name (pass the config that includes its suffix):
pnpm vitest run --config vitest.config.mts path/to/file.spec.ts
pnpm vitest run --config vitest.config.mts -t "test name substring"
pnpm vitest --config vitest.config.mts   # watch mode
```

### Postgres-backed tests are env-gated (gotcha)

`test:db` and `test:e2e:postgres` **skip silently** unless their env gate is set — passing tests can mean they never ran. They need a live Postgres and:

- `pnpm test:db` → `DATABASE_URL` + `RUN_POSTGRES_INTEGRATION=true`
- `pnpm test:e2e:postgres` → `DATABASE_URL` + `RUN_POSTGRES_E2E=true` + `PLATFORM_REPOSITORY_DRIVER=postgres` + `PLATFORM_BOOTSTRAP_ADMIN_PASSWORD`

`pnpm verify:full` wires these for a local docker-free full run. See `docs/runbooks/presence-mvp-smoke.md` for bring-up (incl. a `28P01` auth troubleshooting tree).

### Database

```bash
pnpm db:setup    # db:migrate + db:migrate:presence + db:seed (needs DATABASE_URL)
pnpm db:generate # drizzle-kit generate (after schema changes)
```

Dev seed admin defaults to `admin/admin123`; production must inject `PLATFORM_BOOTSTRAP_ADMIN_PASSWORD`. `platform-api` defaults to the **Postgres** repository; set `PLATFORM_REPOSITORY_DRIVER=memory` for no-DB API smoke or unit fixtures.

### Per-package & dev servers

```bash
pnpm --filter @work/platform-api <script>   # scope any script to one workspace package
pnpm dev:shell      # workbench-shell (Vite)
pnpm dev:platform   # platform-api (nest start --watch)
# also: dev:gateway, dev:im-adapter, dev:notification, dev:realtime
```

`pnpm lint` / `pnpm typecheck` run recursively across all packages (`pnpm -r --if-present`).

## Architecture (big picture)

Single pnpm/Nx monorepo, **backend NestJS 11 + frontend React 19 + PostgreSQL 17 (Drizzle ORM)**, designed for enterprise intranet (no public CDN / external IdP). Full design in `docs/architecture.md`.

### Layout

- `apps/` — the shell and platform services: `workbench-shell` (React/Vite host), `platform-api` (users/org/roles/permissions/auth/audit), `gateway-api`, `im-adapter-api`, `notification-api`, `realtime-gateway` (socket.io).
- `modules/<module>/` — business modules, each split into `contract` / `web` / `api` (`presence`, `approval`, `report`). Currently only `presence` is implemented end-to-end.
- `packages/` — shared libs consumed via `workspace:*` aliases (`platform-contract`, `http-client`, `event-bus`, `errors`, `logger`, `ui`, `im-provider`, `notification-center`, plus `platform-sdk`).
- `clients/desktop-qt` — Qt 6.8 C++ client (talks to gateway-api only; never the DB).

### Module model (the core pattern)

A business module is self-contained and may **only** depend on its own `contract`, `packages/*`, and `platform-sdk` — never another module's internals (enforced via Nx `scope:`/`type:` tags in each `package.json`). Each module declares a **manifest** (`name`, `basePath`, `apiPrefix`, `menus`, `permissions`, `routes`, `events`). `web` modules mount into `workbench-shell` today via a static `import` but the loader is structured so a module can later become a remote micro-frontend with no contract change.

### Backend boundaries

- `gateway-api` is an **API composition host** embedding business modules through M4–M6, then degrades to a pure edge gateway (reverse proxy / auth pass-through / rate limit) from M7. See `docs/adr/0003-gateway-boundary.md`.
- Cross-process auth uses a **phantom-token** pattern — `docs/adr/0004-cross-process-auth-phantom-token.md`. Auth/scope/audit logic lives in `apps/platform-api/src/auth` and the platform scope service; changes here touch the security baseline.
- HTTP calls go through `@work/http-client`; errors use the unified envelope defined in `AGENTS.md`.

### Data & events

One Postgres instance, **schema-per-module isolation** (`platform.*`, `presence.*`, `approval.*`, `report.*`, `notification.*`). A module reads/writes **only its own schema**; it obtains org/people/permission data via `platform-api` or a read-only snapshot — never by reaching into another schema. Note `platform-api` and `presence/api` have **separate migration entrypoints** (`db:migrate` vs `db:migrate:presence`). Cross-module communication is limited to URL navigation, public APIs, and domain events (`@work/event-bus`, e.g. `presence.status.changed`).

## Conventions worth knowing

- **Conventional Commits** are enforced by commitlint. Branches: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Prettier: single quotes, semicolons, `printWidth: 100`, `trailingComma: all`. ESLint 9 flat config (`eslint.config.mjs`).
- Work is delivered as self-contained **task packages** under `docs/tasks/m*-*.md` with explicit assertions, and outcomes are appended to `docs/verification-log.md`. Architecture/permission/data-scope/schema/deployment changes require a documentation review (criteria in `docs/doc-index.md` §5).
- Never commit `node_modules`, `.env`, build artifacts, or unvetted third-party source.
