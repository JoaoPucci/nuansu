# Quality & Testing Strategy — Nuansu v1

This doc is the source of truth for testing, complexity, coverage, and CI quality gates. It pairs with `architecture.md` (system shape), `back_end_architecture.md §13` (server-side test layers), and `front_end_architecture.md §16` (client-side test layers) — both of which reference this doc for the policy.

## 1. Why this bar

This project is built with heavy AI assistance. AI-generated code is competent but not careful — it tends to skip edge cases, ignore error paths, and produce functions that look correct but quietly degrade as they grow. Mechanical defences are the only ones that scale: tests written first, complexity capped in CI, coverage measured on the metrics that matter, mutation testing later to verify the tests actually test.

The bars in this doc exist so that AI assistance cannot ship code that bypasses them. Every gate is enforced by CI, not by review etiquette. If a gate is wrong for a piece of code, the rule changes — not the gate.

## 2. TDD discipline

Per module, in order:

1. **Red** — write the failing test first. The test names the behaviour you want.
2. **Green** — implement the minimum code to pass the test. No extra abstractions, no future-proofing.
3. **Refactor** — with the passing test as a safety net, restructure for clarity. Run the test after each step.

Apply at the right level for each piece:

| Piece                   | Test level                                                             |
| ----------------------- | ---------------------------------------------------------------------- |
| zod schema              | Unit — valid + invalid edge inputs                                     |
| Pure utility            | Unit — input/output cases + a fast-check property                      |
| Reducer                 | Unit — every transition; invalid transitions throw                     |
| DB layer                | Integration — ephemeral Postgres                                       |
| Hono route handler      | Integration — `app.fetch(new Request(...))`                            |
| React component         | Ladle story + RTL behaviour test                                       |
| Streaming hook / parser | Unit + a fast-check property over chunk fragments                      |
| Prompt builder          | Unit — schema validity + a fast-check property over prefs combinations |
| End-to-end happy path   | Playwright vs. LLM stub                                                |
| Translation quality     | Prompt evals harness; JP-native reviewer scores                        |

If you find yourself writing implementation code without a test, stop and write the test first. The "I'll write the test after" pattern is the most reliable way to ship code that doesn't actually do what you think.

## 3. Test layers

| Layer                | Tool                           | Coverage                                                                                |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| Unit                 | Vitest                         | Pure functions, schemas, parsers, reducers, prompt builder, the SSE chunk handler       |
| Integration          | Vitest + ephemeral Postgres    | DB layer, ownership wrappers, route handlers, Better Auth flows                         |
| Contract             | zod schemas shared FE + BE     | Compile-time guarantee that the wire format matches both sides                          |
| Component visual     | Ladle                          | Every bespoke component has 4 stories minimum: default / loading / error / edge         |
| Component RTL        | Vitest + React Testing Library | Behaviour tests for non-trivial components (composer reducer, suggestion card actions)  |
| E2E                  | Playwright vs. LLM stub        | Happy paths from `requirements.md §7`; a11y sweep via axe-core                          |
| A11y                 | axe-core via Playwright        | Zero serious/critical violations on every authenticated route                           |
| Performance          | Lighthouse CI + Vitest bench   | Prerendered pages (Lighthouse); hot paths like SSE parser and reducer (bench)           |
| Property-based       | fast-check                     | Parsers, reducers, normalisers, regex matchers, prompt builder — see §5                 |
| **Fitness function** | Vitest + AST / schema scans    | Architectural invariants — see §3.1                                                     |
| Prompt evals         | Custom harness                 | Golden-set translations; JP-native reviewer scores; regression blocks prompt-version PR |
| Load                 | k6                             | Read paths + simulated translate flow with stubbed LLM (deferred to post-launch)        |
| Chaos                | Manual                         | LLM 5xx, DB blip, Stripe webhook replay                                                 |

### 3.1 Fitness functions (architectural invariants)

A separate test category — **automated checks that verify architectural constraints continue to hold**, regardless of any specific feature being implemented. The concept is from "Building Evolutionary Architectures" (Ford et al.). Standard tests verify _behaviour_; fitness tests verify _structure and invariants_.

These run alongside the rest of the suite (Vitest), but they're not testing user-facing behaviour — they're testing that the codebase still satisfies the architectural rules that make it trustworthy. They catch the AI-assistance failure mode of "I added a quick query bypassing the wrapper because the wrapper looked annoying."

**Fitness functions required in v1:**

| Invariant                                                                                                                                                      | Where                                                                                                                                          | How verified                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every user-scoped table has a `user_id` FK (or transitively via `chat_id`)                                                                                     | `apps/web/server/db/schema.ts` introspection                                                                                                   | Vitest scan over Drizzle metadata; whitelist for auth/system tables                                                                                    |
| All DB access goes through `db.forUser` — no direct `db.<table>` outside the wrapper                                                                           | `apps/web/server/**`                                                                                                                           | AST scan via ts-morph; CI-fail on any direct table reference                                                                                           |
| Logger never emits any field in the banned-PII list (`source_text`, `target_text`, `gloss`, `notes`, `draft_source_text`, `email`, `name`, `evidence_excerpt`) | Logger redactor (`server/lib/logger.ts`)                                                                                                       | Round-trip test: feed every banned key into the logger; assert output JSON contains none                                                               |
| Every `bytea` column receiving user content actually contains ciphertext at rest, never plaintext                                                              | `messages.final_target_text`, `final_source_text`, `gloss`; `pref_suggestions.evidence_excerpt`; `message_versions.source_text`, `target_text` | Integration test: write via the encryption wrapper; read raw bytes; assert magic bytes + length distribution match XChaCha20-Poly1305 ciphertext shape |
| AAD-mismatch decryption always rejects                                                                                                                         | `server/crypto/envelope.ts`                                                                                                                    | Property test: `decrypt(encrypt(p, aad1), aad2)` rejects for any `aad1 !== aad2`                                                                       |
| Server code never imports from client code, and vice versa                                                                                                     | `apps/web/server/**` ↔ `apps/web/src/**`                                                                                                       | `eslint-plugin-import` `no-restricted-paths` (already in baseline ESLint config)                                                                       |
| `process.env` access only in `lib/env.ts`                                                                                                                      | All `apps/web/**`                                                                                                                              | Custom ESLint rule (already in baseline)                                                                                                               |
| Every authenticated Hono route has the session middleware applied                                                                                              | `apps/web/server/app.ts`                                                                                                                       | Vitest scan over the registered route table; whitelist for explicitly-anonymous routes                                                                 |
| Every translate / inbound call writes a `usage_events` row                                                                                                     | `server/translation/orchestrator.ts`                                                                                                           | Integration test: invoke the orchestrator against a test DB; assert one row written per call                                                           |
| Every prompt version is registered in `packages/prompts/index.ts`                                                                                              | `packages/prompts/**`                                                                                                                          | Vitest scan: every file matching `v*.ts` in prompts must be exported from the index                                                                    |
| Bundle composition: no server-only deps reach the client bundle (e.g., `pino`, `@anthropic-ai/sdk`, `drizzle-orm`)                                             | Vite bundle output                                                                                                                             | `size-limit` config with explicit per-bundle deny lists                                                                                                |
| Every i18n key used in the codebase exists in both `en` and `ja` namespaces                                                                                    | `packages/i18n/**`                                                                                                                             | Vitest scan: extract all `t('...')` keys via AST; assert they exist in every locale file                                                               |

**When to add a new fitness function.** Whenever a documented architectural rule could be silently violated and you wouldn't notice. The rule is: if losing this invariant would degrade the system in a way that's invisible to feature tests, write a fitness function. Example triggers: a new "must-go-through-wrapper" rule, a new column that must always be encrypted, a new banned import.

**Where they live.** `apps/web/server/__fitness__/` and `apps/web/src/__fitness__/` — directory naming makes them grep-able and they run in their own Vitest project so they can be isolated when iterating.

## 4. Quality gates (CI-failing)

Every PR runs these. A red gate blocks merge.

| Gate                  | Threshold                     | Tool                        | Lands in phase |
| --------------------- | ----------------------------- | --------------------------- | -------------- |
| TypeScript strict     | must pass                     | `tsc --noEmit`              | 1              |
| ESLint clean          | zero warnings                 | eslint flat config          | 1              |
| Cognitive complexity  | ≤ 15 per function             | `eslint-plugin-sonarjs`     | 1              |
| Cyclomatic complexity | ≤ 12 per function             | `eslint-plugin-sonarjs`     | 1              |
| Coverage (non-UI)     | ≥ 80% line, ≥ 75% branch      | Vitest with c8              | 8              |
| **CRAP score**        | **≤ 30 per function**         | custom CI script (see §4.1) | 8              |
| Lighthouse mobile     | ≥ 90 on PA/Acc/BP/SEO         | `@lhci/cli`                 | 8              |
| Bundle size           | ≤ 180 KB gz initial JS        | `size-limit`                | 8              |
| Axe a11y              | 0 serious/critical violations | axe-core via Playwright     | 3, 5, 8        |
| Vitest bench drift    | ≤ 25% from baseline           | `vitest --bench`            | 2, 6, 8        |
| Format check          | Prettier-clean                | `prettier --check`          | 1              |

UI components are exempt from the line-coverage threshold because they're covered by Ladle stories + Playwright e2e instead. The exemption is enforced by the c8 config (`coveragePathIgnorePatterns: ['apps/web/src/components', 'apps/web/src/features/*/components']`), not by goodwill.

### 4.1 CRAP score

The killer metric. Pure-complexity gates miss the actual risk pattern: complex code with low coverage. CRAP combines them:

```
CRAP(f) = complexity(f)² × (1 − coverage(f))² + complexity(f)
```

A function with cyclomatic complexity 10 and 100% coverage has CRAP = 10. The same function with 50% coverage has CRAP = 35. The same function at complexity 15 with 50% coverage has CRAP = 71. Cap at 30: forces either lower complexity or higher coverage on every function in the codebase.

**Implementation.** No first-class JS tool exists. We compute CRAP via a ~100-line script (`scripts/crap.mjs`) that:

1. Reads the c8 coverage report (`coverage/coverage-final.json`) — per-function line coverage.
2. Reads the eslint sonarjs cyclomatic-complexity report (`reports/complexity.json`, generated via `eslint --rule 'sonarjs/cyclomatic-complexity: ["error", 12]' --format json`).
3. Joins by `(file, function-name)`.
4. Computes CRAP per function.
5. Fails CI if any CRAP > 30, with a sorted list of the worst offenders.

Phase 8 ships this script + the CI step. Until then, the per-gate complexity + coverage thresholds give us 90% of the protection.

## 5. Property-based testing playbook

Use `fast-check` for any pure module with multiple input shapes. Pattern: **one hand-written test for the obvious case + one fast-check property for the invariant.** The hand-written test names the intent; the property catches the cases you didn't think of.

**Default config:** 100 iterations per property in CI. 10,000 iterations available locally via `pnpm test --bench-iterations 10000` for pre-merge stress runs on parser changes.

**Modules that get a property test in v1:**

| Module                                   | Invariant                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| SSE chunk parser                         | Any byte sequence either parses to a valid chunk or returns a typed error — never throws |
| `TranslationStreamChunk` zod schema      | `schema.parse(schema.parse(x))` is idempotent for any valid `x`                          |
| Name-lock matcher (compose-time hint)    | Matches are case-insensitive, word-boundary-respecting, never overlap                    |
| Audit point reducer                      | Any action sequence on any state yields a valid state                                    |
| Prompt builder                           | Output never contains banned PII fields from §6 logger redactor list                     |
| Recent-thread window selector            | Output respects count cap (≤ 10) AND token cap (≤ 2000) for any input                    |
| Quota Lua script                         | Concurrent translate requests never exceed the daily cap                                 |
| Envelope encryption (XChaCha20-Poly1305) | `decrypt(encrypt(plaintext, aad), aad) === plaintext` for any plaintext + aad            |
| AAD-mismatch decryption                  | `decrypt(encrypt(p, aad1), aad2)` always rejects when `aad1 !== aad2`                    |

**Anti-patterns to avoid:**

- Using fast-check as a substitute for a hand-written test. Both, not either.
- Generating arbitraries that don't actually exercise the function (e.g., always-empty strings).
- Properties that just restate the implementation. Properties name the _invariant_, not the algorithm.

## 6. Mutation testing — deferred to v2

Mutation testing (Stryker JS) verifies that tests actually _test_: it mutates the production code and checks whether tests fail. Tests that pass against mutated code are useless tests.

**Why deferred to v2.** Stryker runs slow (re-runs the whole suite per mutation). It's most valuable once tests stabilise — running it during TDD churn produces noise. v1 ships with the gates above; mutation testing comes when we have stable tests to verify.

**Unblock criteria for v2 introduction:**

1. v1 is shipped and stable (no daily test-suite churn).
2. All v1 quality gates green for ≥ 4 consecutive weeks on `main`.
3. A baseline mutation score has been measured against pure modules.

**v2 scope:**

- Run against pure modules first: schemas, parsers, reducers, prompt builder, name-lock matcher, envelope encryption.
- Aim for ≥ 70% mutation score on those modules.
- Wire as a non-blocking nightly job in CI; surface the score as a Slack/email digest.
- Promote to a blocking gate only if the team agrees the score is stable.

## 7. TDD anti-patterns to avoid

Mechanical tests are mechanical tests — they can pass without verifying anything useful. Watch for:

- **Test the implementation, not the behaviour.** Tests that mirror code structure (one test per function, one assertion per branch) break on every refactor without catching real bugs. Test what the code _does_, not how it's organised.
- **Snapshot-as-test.** Snapshots are useful for component output structure but not as a substitute for behaviour tests. A snapshot only tells you "the output didn't change" — it doesn't tell you the output is correct.
- **Assertion-light tests.** A test that only checks "no throw" is barely a test. Every test should make at least one specific claim about behaviour.
- **Mocked-into-meaninglessness.** If every dependency is mocked, the test verifies nothing about real integration. Use real dependencies wherever practical (ephemeral Postgres, real zod schemas, real reducers).
- **Coverage as goal, not signal.** 100% coverage from low-quality tests is worse than 70% coverage from high-quality ones. The CRAP gate (§4.1) catches the trap of "covered but untested."
- **Tests that mock the thing being tested.** If you're mocking `db.forUser` while testing `db.forUser`, you're testing your mock.

## 8. Pre-commit hooks (lefthook)

Sub-30-second feedback before a commit lands. Configured in `lefthook.yml`:

```yaml
pre-commit:
  parallel: true
  commands:
    typecheck:
      glob: "*.{ts,tsx}"
      run: pnpm tsc --noEmit
    lint:
      glob: "*.{ts,tsx,js,mjs,cjs}"
      run: pnpm eslint {staged_files}
    format:
      glob: "*.{ts,tsx,js,mjs,cjs,json,md,yml,yaml}"
      run: pnpm prettier --check {staged_files}
    unit:
      glob: "*.{ts,tsx}"
      run: pnpm vitest --changed --run
```

Pre-push hook adds a fuller suite (full unit + integration; e2e and Lighthouse only run in CI). Skipping hooks via `--no-verify` is forbidden by project policy except for explicit emergency hotfixes signed off in the PR description.

## 9. Required dependencies

- `vitest` + `@vitest/coverage-v8` (c8) — unit + integration + coverage
- `fast-check` — property-based testing
- `@playwright/test` + `@axe-core/playwright` — e2e + a11y
- `eslint-plugin-sonarjs` — complexity gates
- `@lhci/cli` — Lighthouse CI
- `size-limit` + `@size-limit/preset-app` — bundle-size gate
- `lefthook` — pre-commit hooks
- `prettier` — format check
- `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` — deferred to v2

## 11. AI-assisted development guardrails

This project is built with heavy AI assistance. The bar set in §1–§10 is mechanical (gates, complexity caps, coverage); the rules below are behavioural (what AI tools may and may not do). Both are necessary.

### 11.1 Tests-as-spec — acceptance tests are read-only to AI

Tests under `apps/web/test/acceptance/**` and `apps/web/test/e2e/**` are **the spec**. AI tools may not modify them.

- If a test fails, **fix the code**, not the test. Soften no assertion. Skip no test. Change no expected value.
- If the test itself appears wrong, **stop and ask the human author**. Only humans modify acceptance tests, and the change must be in a human-authored commit recorded in the PR description.
- Other test categories (unit, integration, component) may be edited by AI, but each edit must preserve or strengthen what the test asserts. Weakening an assertion to make a failing test pass is the same anti-pattern at a smaller scale.

Enforcement in order of strictness:

1. **`AGENTS.md` + `CLAUDE.md` instruction** at the repo root tells AI tools the rule. This is the load-bearing mechanism.
2. **PR template question:** "Did any acceptance test change? If yes, who authored the change and why?"
3. **Reviewer enforcement:** any acceptance-test diff must come from a human-authored commit; otherwise the PR is rejected.

### 11.2 Test-naming convention

Acceptance and e2e test descriptions are behavioural sentences — subject, observable outcome, condition. Pattern:

> `<subject> <does/produces> <observable> when <condition>`

Examples:

```ts
test("copy icon places natural target in clipboard when view toggle is on source", ...)
test("sample chat is removed from chat list when user taps Use real chats", ...)
test("audit point card disappears optimistically when user taps Apply", ...)
```

What's banned in those test names: implementation jargon (`mock`, `spy`, `stub`, `intercept`, `internal-…`, `helper-…`, `private-…`). The test name should read as something a product-minded reader can understand without the codebase open.

### 11.3 Cucumber / Gherkin: deferred

Full Gherkin tooling (`@cucumber/cucumber`, `playwright-bdd`) is overkill for v1 with a solo founder. The spirit — executable specs that read like prose — is captured by §11.1 + §11.2 (no-AI-edit acceptance tests with prose names). Revisit Gherkin in v2 only if non-coding collaborators (QA, JP-native product reviewers) join the team.

### 11.4 Documentation discipline

When a code change alters documented behaviour, update the relevant `/docs/` section in the same commit. This includes:

- New API endpoints → `back_end_architecture.md §2.1`
- New schema columns/tables → `back_end_architecture.md §3`
- New requirements/DoD → `requirements.md`
- New components → `design_system.md §7`
- New testing rule → `quality.md`

The doc-drift rule: if you can change behaviour without changing a doc, the doc was incomplete. Fix both. The repo at HEAD must always be a coherent statement of the system.

### 11.5 Design discipline

UI work is governed by `design_system.md` and is held to a higher bar than functional correctness. See `AGENTS.md` "Frontend design enforcement" for the specific rules. Summary: the calm, considered Aizome aesthetic is non-negotiable; AI tools default to bright, rounded, cheerful — that's the wrong product, and a PR that ships AI-default UI will be reverted.

## 12. When to relax a gate

If a gate is wrong for a piece of code (rare, but happens), the answer is to change the rule, not bypass the gate. Examples:

- **A fixture file** with deliberately-complex content for a test — exempt the file via the eslint config's `ignorePatterns` for `**/*.fixture.ts`. Document the exemption in the eslint config comment.
- **Generated code** (e.g., TanStack Router's `routeTree.gen.ts`) — exempt with `// @ts-nocheck` and `/* eslint-disable */` at the top. The gate doesn't apply to non-handwritten code.
- **A function that legitimately needs higher complexity** (e.g., a finite state machine with many transitions) — refactor first. If genuinely irreducible, document the exemption inline with `// eslint-disable-next-line sonarjs/cognitive-complexity -- state machine, simpler split would obscure the transitions` and a justification in code review.

Inline `eslint-disable` comments without justification fail review.
