# Community Roadmap

This roadmap explains where community contributions fit. The authoritative engineering milestones remain `docs/foundation-blueprint.md` and `docs/foundation-progress.md`; this document translates them into contributor-friendly work areas.

## Current Project Stage

Work Platform finished M0–M4 (platform foundations + presence MVP). In 2026-05 the
post-M4 roadmap was re-planned; see `docs/adr/0005-product-replan-roadmap.md` and
`docs/product-requirements.md`.

- M0–M4 are complete: platform core (auth, persistence, permissions, menus, audit,
  data-scope, Web Shell) and the presence MVP.
- The next milestone is **M5 roles & permission management** (functional + per-data-type
  data permissions with an admin UI), the gate for everything after it.
- Subsequent milestones: dynamic-form mini + file storage (M6), in-app notification +
  scheduler (M7), people/org/profile (M8), presence v2 (M9), daily report (M10),
  approval workflow (M11). Multi-dimensional tables, chat/IM, and intranet delivery
  are vNext.

The project is not production ready yet.

## Contribution Lanes

### Lane 1: Documentation And Onboarding

Good for first-time contributors.

- Improve setup docs for Windows, Linux, and Docker.
- Add screenshots or diagrams for architecture and module boundaries.
- Clarify common local PostgreSQL setup errors.
- Keep README links aligned with current milestone docs.

### Lane 2: Test Coverage And Developer Experience

Good for contributors comfortable with TypeScript and Vitest.

- Add focused unit tests for shared packages.
- Improve E2E helper documentation.
- Make failure messages in tests and scripts easier to diagnose.
- Add lightweight fixtures for module web tests.

### Lane 3: Presence MVP Polish

Good after reading `docs/rfc/m4-presence-mvp.md`.

- Improve presence Web empty/error/loading states without changing API contracts.
- Add accessibility checks to presence Web forms.
- Improve date/time display helpers.
- Add browser smoke documentation for M4-4.

### Lane 4: Platform Foundations

Good for experienced contributors.

- Harden audit and data-scope boundaries.
- Add platform lookup service contracts only when a real business slice needs them.
- Improve Docker/offline deployment documentation.
- Prepare M7 event/realtime upgrade notes without implementing M7 early.

## Not Ready For Community Pickup

Avoid these until maintainers open a scoped RFC or issue:

- Replacing the permission model.
- Changing database schema ownership rules.
- Introducing a new frontend state management library.
- Adding OpenIM client SDK code.
- Replacing the desktop client technology decision.
- Reworking gateway/platform service boundaries before M7.

## How To Pick Work

1. Start with issues labeled `good first issue` or `help wanted`.
2. Comment on the issue before starting.
3. Keep the PR small and focused.
4. Include the verification commands you ran.
5. Update docs when behavior, contracts, deployment, security, or workflows change.

## Maintainer Review Priorities

Maintainers will prioritize:

- Module boundary correctness.
- Security, permission, audit, and data-scope behavior.
- Reproducible tests and CI stability.
- Small PRs that are easy to review.
- Documentation that makes future contributors faster.
