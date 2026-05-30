# presence module — local guidance

Root `CLAUDE.md` + `AGENTS.md` apply; this adds the operational detail for
working inside a business module. `presence` is the **only** module implemented
end-to-end, so it's the reference for the pattern — `approval` / `report` are
manifest-only and ship **disabled** until they have a backend.

## Three-package split & isolation

A module is `contract` / `web` / `api` and is **self-contained**. It may depend
**only** on its own `contract`, `packages/*`, and `platform-sdk` — never another
module's internals, and never another module's schema. The Nx `scope:` / `type:`
tags in each `package.json` enforce this; if a lint/tag error appears, the import
is the bug, not the rule.

- **contract** (`contract/src`) — the **single source of truth** for the module
  manifest, `permissions.ts`, `events.ts`, DTOs. Platform seed reads these; don't
  re-inline permissions/menus elsewhere (that drift is what M3.5-A fixed).
- **api** — owns the `presence.*` schema only. It has its **own migration
  entrypoint** `pnpm db:migrate:presence` (separate from platform `db:migrate`).
- **web** — mounts into `workbench-shell` (see that dir's `CLAUDE.md`).

## Cross-module / cross-process rules

- Talk to other modules only via **URL navigation, public APIs, or domain
  events** (`@work/event-bus`, e.g. `presence.status.changed`) — never a direct
  import or cross-schema join.
- Get org/people/permission data from `platform-api` (or a read-only snapshot),
  never by reading `platform.*`.

## Gotcha

Nest controllers here need **explicit** `@Inject(SomeService)` on constructor
params. The vitest/tsx esbuild transpile does **not** emit `emitDecoratorMetadata`,
so type-reflection injection silently yields `undefined` and every request 500s
(commit 2e25093). Don't rely on bare-type constructor injection in this repo.
