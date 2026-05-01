# Client fitness functions

**Architectural-invariant tests** for the client side. Run alongside the rest of the suite (Vitest); they verify _structure and invariants_, not user-facing behaviour.

The full concept and the v1 fitness-function inventory live in `docs/quality.md §3.1`.

## Client-side invariants tested here

| Invariant                                                                                                          | First lands in |
| ------------------------------------------------------------------------------------------------------------------ | -------------- |
| Server code never imports from client code, and vice versa                                                         | Phase 2        |
| `process.env` access only in `lib/env.ts` (already enforced via custom ESLint rule; the fitness test backs it up)  | Phase 2        |
| Bundle composition: no server-only deps reach the client bundle (e.g., `pino`, `@anthropic-ai/sdk`, `drizzle-orm`) | Phase 8        |
| Every i18n key used in the codebase exists in both `en` and `ja` namespaces                                        | Phase 3        |

## Conventions

- Files named `*.fitness.test.ts` so they're discoverable by glob without colliding with feature tests.
- Each fitness test is self-contained: it loads what it needs from the codebase via filesystem / AST / Vite manifest. No mocking — fitness tests verify the real codebase.
- A failing fitness test is not a feature bug — it's an architecture violation. Fix the architecture, not the test.
- Fitness tests are AI-editable, but the rule of "tests verify the architecture" is non-negotiable. Adding an exception requires a `docs/quality.md §12` justification.

This directory is empty until Phase 2 lands the first fitness tests.
