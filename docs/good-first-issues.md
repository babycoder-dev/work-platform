# Good First Issues

This file lists starter tasks that are intentionally small, low-risk, and useful. The GitHub issue tracker should be the source of truth once issues are created; this document explains the intended shape of those tasks.

## Starter Tasks

### 1. Improve Local PostgreSQL Setup Notes

Labels: `good first issue`, `documentation`

Why it helps:

- Several integration and E2E checks depend on local PostgreSQL credentials.
- Clear setup notes reduce false debugging of code when the issue is environment-side.

Expected scope:

- Update `docs/development-workflow.md` or `docs/deployment.md`.
- Include Windows PowerShell examples.
- Explain `DATABASE_URL`, `RUN_POSTGRES_INTEGRATION`, and `RUN_POSTGRES_E2E`.
- Do not change code.

Verification:

- Markdown review.
- Optional: run `pnpm test:db` if local PostgreSQL is configured.

### 2. Add README Architecture Diagram

Labels: `good first issue`, `documentation`

Why it helps:

- New contributors need to understand shell, gateway, platform, packages, and business modules quickly.

Expected scope:

- Add a compact Mermaid or text diagram to `README.md`.
- Link to `docs/architecture.md` for deeper detail.
- Keep the diagram consistent with `docs/foundation-blueprint.md`.

Verification:

- Markdown review.

### 3. Add Presence Web Accessibility Notes

Labels: `good first issue`, `documentation`, `enhancement`

Why it helps:

- Presence Web now has real forms and lists.
- Accessibility expectations should be clear before more business pages copy the pattern.

Expected scope:

- Add a short section to `docs/rfc/m4-presence-mvp.md` or a focused doc under `docs/`.
- Cover labels, keyboard operation, loading/error state announcement, and date input expectations.
- Do not introduce new UI libraries.

Verification:

- Markdown review.

### 4. Add More Presence Web Component Tests

Labels: `good first issue`, `enhancement`

Why it helps:

- M4-3 introduced jsdom web tests.
- Small test additions help contributors learn the runtime injection pattern.

Expected scope:

- Add focused tests for optional end time, remark submission, or cancel failure behavior.
- Use existing `vitest.web.config.mts` and React Testing Library.
- Do not introduce Playwright, Cypress, React Query, Redux, or form libraries.

Verification:

```bash
pnpm test:web
pnpm typecheck
```

### 5. Document Manual Browser Smoke For M4-4

Labels: `good first issue`, `documentation`

Why it helps:

- M4-4 needs a repeatable manual browser smoke path for login, presence board, create, cancel, and refresh.

Expected scope:

- Add a runbook under `docs/` or extend `docs/development-workflow.md`.
- Include gateway and workbench-shell dev startup commands.
- Include expected success and failure observations.
- Do not add Playwright or browser automation.

Verification:

- Markdown review.
- Optional manual run.

## Boundaries For Starter Issues

Starter issues should not:

- Modify database migrations.
- Change authentication, permission, audit, or data-scope semantics.
- Add new third-party UI/state libraries.
- Touch OpenIM SDK integration.
- Rework gateway/platform boundaries.
