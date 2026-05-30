# workbench-shell — local guidance

Root `CLAUDE.md` + `AGENTS.md` apply; this adds what's local here.

React 19 + Vite **host** that mounts business-module `web` packages. A `web`
module depends only on `platform-sdk` + its own `contract`; the shell knows
modules through the registry, not their internals.

## How modules mount

- `src/module-registry/module-registry.ts` registers each module's `WorkWebModule`
  via a **static `import`** today (`platformWebModule`, `presenceWebModule`, …).
  Add a new module by importing + `moduleRegistry.register(...)` here.
- The loader is deliberately structured (`load-remote-module.ts`) so a module can
  later become a **remote micro-frontend with no contract change** — keep that
  seam intact; don't reach into a module past its `WorkWebModule` manifest/runtime.
- Menus/routes/permissions come from the module **manifest**, not hand-wired here.

## Tests

Web specs are `*.spec.tsx` and run under **`vitest.web.config.mts`** (jsdom) — the
other two configs won't collect them (see root `CLAUDE.md` test matrix).
