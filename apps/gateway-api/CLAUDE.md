# gateway-api — local guidance

Root `CLAUDE.md` + `AGENTS.md` apply; this only adds what's local here.

This is the **dev and deployment entry** (port 3000). Today it is an **API
composition host**: it embeds `PlatformModule` + business modules (`PresenceModule`,
…) directly (`gateway.module.ts`). Per `docs/adr/0003-gateway-boundary.md` it stays a
composition host through **M4–M6**, then degrades to a pure edge gateway
(reverse proxy / auth pass-through / rate limit) from **M7**. Don't add edge-only
concerns early, and don't let business logic leak into the gateway.

## The global-guard gotcha (read before adding routes)

`gateway.module.ts` registers **two global `APP_GUARD`s** — `PlatformAuthGuard`
then `PermissionGuard` — so they apply to **every** embedded route, including
routes whose own service didn't mount them. Consequences:

- Any endpoint that must be reachable **without** a token (login, password policy,
  health) has to be marked `@Public`, or the gateway returns 401 before the
  handler runs. This already broke login once (commit 2e25093) — verify auth
  flows **through the gateway**, not just against `platform-api` in isolation.
- A route reachable through the gateway is permission-checked here even if it
  wasn't in the standalone service. Confirm `@RequirePermissions(...)` is present
  and correct.
