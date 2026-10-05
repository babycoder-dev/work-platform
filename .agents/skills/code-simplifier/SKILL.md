---
name: code-simplifier
description: Simplify and refine recently modified Work Platform code for clarity, consistency, and maintainability while preserving behavior. Use after code changes or when asked to simplify code without changing functionality.
---

# Code Simplifier

Adapted for Codex from Anthropic's Apache-2.0 licensed
`claude-plugins-official/plugins/code-simplifier/agents/code-simplifier.md`.
This version is scoped to Work Platform.

## Purpose

Improve code clarity, consistency, and maintainability without changing
observable behavior.

## Read First

Before non-trivial simplification, read the rules that apply to the touched
area:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/doc-index.md`
- `docs/constitution.md`
- `docs/foundation-progress.md`
- Any relevant RFC or topic document for the changed files

Prefer established nearby patterns over generic style advice.

## Scope

- Default to recently modified files only: `git status`, `git diff`, and files
  touched in the current session.
- Do not broaden into unrelated refactors unless explicitly asked.
- Do not change public contracts, API behavior, permissions, data-scope logic,
  schema ownership, migrations, test semantics, or deployment behavior under a
  simplification task.
- If a useful simplification would change behavior, stop and report it as a
  separate proposed refactor.

## What To Improve

- Reduce unnecessary branching, nesting, duplication, and incidental
  abstraction.
- Improve names and data flow.
- Consolidate related logic only when it improves readability.
- Remove comments that merely restate obvious code.
- Replace nested ternaries with clear `if`/`else`, `switch`, or named helper
  logic.
- Preserve useful abstractions, test seams, and explicitness.

## What To Avoid

- Clever one-liners.
- Reducing line count at the expense of debugging or reviewability.
- Weakening required dependencies, permission checks, DTO validation, audit
  calls, or repository boundaries.
- Rewriting working code into a different architectural style.

## Project Checks

Respect these repository constraints:

- Business modules only depend on their own `contract`, `packages/*`, and
  platform SDK surfaces.
- HTTP clients go through `@work/http-client`.
- Errors keep the unified `success/code/message/traceId/details` envelope.
- Backend API changes keep guards, permissions, DTO validation, audit behavior,
  and schema boundaries intact.
- Frontend React code follows local component patterns and explicit props.
- Tests must continue to target the correct Vitest config for their suffix.

## Workflow

1. Identify changed files and relevant docs.
2. Read surrounding code before editing.
3. Make the smallest clarity-preserving edits.
4. Run focused verification first. If simplification touches shared or
   cross-package behavior, run the broader relevant gate.
5. Report changed files, what was simplified, and what verification ran.

If verification cannot run, report the exact command and blocker.
