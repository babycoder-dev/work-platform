# Contributing to Work Platform

Thanks for your interest in contributing. Work Platform is an early-stage modular internal collaboration platform. Contributions are welcome, but changes should preserve the platform-first architecture and module boundaries documented in this repository.

## Before You Start

Read these documents first:

1. `docs/doc-index.md`
2. `docs/constitution.md`
3. `docs/foundation-blueprint.md`
4. `docs/foundation-progress.md`
5. `docs/module-contract.md`
6. `docs/security-baseline.md`
7. `docs/development-workflow.md`

For presence work, also read `docs/rfc/m4-presence-mvp.md`.

## Development Setup

Requirements:

- Node.js 22
- pnpm 10
- PostgreSQL 17 for database integration and gated E2E tests
- Docker for production image build checks

Install dependencies:

```bash
corepack enable
pnpm install
```

Common verification commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The combined local gate is:

```bash
pnpm verify
```

Database-backed checks require `DATABASE_URL` and the relevant integration environment flags. See `docs/development-workflow.md` and `docs/deployment.md`.

## Architecture Rules

- Keep platform foundation concerns in `packages/*` or `apps/platform-api`.
- Business modules must not import another business module's internals.
- Business modules must not import `apps/platform-api/...` deep paths.
- Web modules must use injected runtime/http-client patterns instead of reading token storage directly.
- Backend write operations that affect business state must consider audit logging.
- Database changes must use committed migrations.
- Public API and DTO changes must update contracts and docs.

## Pull Requests

Use small, reviewable PRs. Each PR should include:

- A clear summary of what changed and why.
- Tests or a clear explanation for why tests are not applicable.
- Documentation updates when contracts, workflows, security, deployment, or architecture change.
- The exact verification commands you ran.

The default expected verification set is:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

If a command is blocked by local environment setup, document the command and blocker in the PR.

## Commit Messages

Use Conventional Commits:

```text
feat: add presence board filters
fix: reject overlapping presence records
docs: document platform runtime injection
test: cover presence register form
```

## License

By contributing to this project, you agree that your contributions are submitted under the Apache License 2.0, unless you explicitly state otherwise in writing.
