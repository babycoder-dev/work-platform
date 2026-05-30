# platform-api — local guidance

This is the **platform service**: users / org / rbac / auth / scope / audit / system.
It owns the `platform.*` schema and is the security baseline of the whole system.
Root `CLAUDE.md` + `AGENTS.md` still apply; this file only adds what's local here.

## Security-sensitive surface (handle with care)

These subtrees touch the binding security baseline — a change here is not "just code":

- `src/auth` — login, password, guards (`platform-auth.guard.ts`), request-user
- `src/scope` — data-scope service (`self` / `department` / `department_tree` / `company` / `custom`)
- `src/audit` — sensitive-write audit records
- `src/security`, `src/rbac`, `src/repositories` — token/session storage, permission checks

Before changing any of the above:

1. Read the authoritative rules and **quote the clause you're enforcing**, don't
   work from memory: `docs/security-baseline.md` (§3 auth/password, §4 token/session
   incl. §4.4 phantom-token, §5 authz & data-scope, §6 audit, §7 error envelope,
   §8 DB/schema, §16 change gate), `AGENTS.md` (boundaries + unified error envelope),
   `docs/adr/0004-cross-process-auth-phantom-token.md`, `docs/adr/0003-gateway-boundary.md`.
2. If the change alters a **rule itself** (password policy, token storage, permission
   model, data-scope model, new identity source, new sensitive field), §16 requires the
   baseline doc / an ADR be updated **in the same change** — code-only is incomplete.
3. Run the `security-reviewer` subagent as an independent second pass before merging.

## Local gotchas

- **Two migration entrypoints**: this app uses `db:migrate` (`src/db/migrate.ts`);
  presence has its own `db:migrate:presence`. Don't fold them together.
- **Repository driver**: defaults to **postgres**. Set `PLATFORM_REPOSITORY_DRIVER=memory`
  for no-DB unit/smoke runs. The Postgres integration + e2e tests are **env-gated and
  skip silently** — a green run can mean they never executed (see root `CLAUDE.md`).
- **Cross-process auth**: other services validate tokens via introspection
  (`GET /api/platform/auth/me`), never by reading `platform.*` directly. Cache TTL ≤ 60s.
- Business modules never write `platform.*` and never join across schemas (§8).
