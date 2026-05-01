# Server fitness functions

**Architectural-invariant tests** for the server side. Run alongside the rest of the suite (Vitest); they verify _structure and invariants_, not user-facing behaviour.

The full concept and the v1 fitness-function inventory live in `docs/quality.md §3.1`.

## Server-side invariants tested here

| Invariant                                                                                            | First lands in |
| ---------------------------------------------------------------------------------------------------- | -------------- |
| Every user-scoped table has a `user_id` FK (or transitively via `chat_id`)                           | Phase 2        |
| All DB access goes through `db.forUser` — no direct `db.<table>` outside the wrapper                 | Phase 2        |
| Logger never emits any field in the banned-PII list (see `back_end_architecture.md` logger redactor) | Phase 2        |
| Every `bytea` column receiving user content actually contains ciphertext at rest, never plaintext    | Phase 2        |
| AAD-mismatch decryption always rejects                                                               | Phase 2        |
| Every authenticated Hono route has the session middleware applied                                    | Phase 4        |
| Every translate / inbound call writes a `usage_events` row                                           | Phase 6        |
| Every prompt version is registered in `packages/prompts/index.ts`                                    | Phase 2        |

## Conventions

- Files named `*.fitness.test.ts` so they're discoverable by glob without colliding with feature tests.
- Each fitness test is self-contained: it loads what it needs from the codebase via filesystem / AST / Drizzle metadata. No mocking — fitness tests verify the real codebase.
- A failing fitness test is not a feature bug — it's an architecture violation. Fix the architecture, not the test.
- Fitness tests are AI-editable, but the rule of "tests verify the architecture" is non-negotiable. Adding an exception requires a `docs/quality.md §12` justification.

This directory is empty until Phase 2 lands the first fitness tests.
