# packages — local guidance

Root `CLAUDE.md` + `AGENTS.md` apply; this adds the one rule specific to this dir.

These are **leaf shared libraries** consumed across the monorepo via `workspace:*`
aliases (`@work/*`). Dependency flow is **one-way**: a package may depend on other
`packages/*`, but **never** on `apps/*` or `modules/*`. If you find yourself wanting
to import an app/module into a package, the abstraction belongs in the package, or
the caller should pass it in — the import is the bug.

Two packages are load-bearing for cross-cutting rules (authoritative shape in
`AGENTS.md`): `errors` owns the **unified error envelope**, and `http-client`
(`@work/http-client`) is the **only** sanctioned path for outbound HTTP. Don't
hand-roll `fetch`/`axios` or a bespoke error shape elsewhere.
