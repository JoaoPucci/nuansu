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

| Invariant                                                                                                                                                          | Where                                                                                                                                          | How verified                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every user-scoped table has a `user_id` FK (or transitively via `chat_id`)                                                                                         | `apps/web/server/db/schema.ts` introspection                                                                                                   | Vitest scan over Drizzle metadata; whitelist for auth/system tables                                                                                                                                    |
| All DB access goes through `db.forUser` — no direct `db.<table>` outside the wrapper                                                                               | `apps/web/server/**`                                                                                                                           | AST scan via ts-morph; CI-fail on any direct table reference                                                                                                                                           |
| Logger never emits any field in the banned-PII list (`source_text`, `target_text`, `gloss`, `notes`, `draft_source_text`, `email`, `name`, `evidence_excerpt`)     | Logger redactor (`server/lib/logger.ts`)                                                                                                       | Round-trip test: feed every banned key into the logger; assert output JSON contains none                                                                                                               |
| Every `bytea` column receiving user content actually contains ciphertext at rest, never plaintext                                                                  | `messages.final_target_text`, `final_source_text`, `gloss`; `pref_suggestions.evidence_excerpt`; `message_versions.source_text`, `target_text` | Integration test: write via the encryption wrapper; read raw bytes; assert magic bytes + length distribution match XChaCha20-Poly1305 ciphertext shape                                                 |
| AAD-mismatch decryption always rejects                                                                                                                             | `server/crypto/envelope.ts`                                                                                                                    | Property test: `decrypt(encrypt(p, aad1), aad2)` rejects for any `aad1 !== aad2`                                                                                                                       |
| Server code never imports from client code, and vice versa                                                                                                         | `apps/web/server/**` ↔ `apps/web/src/**`                                                                                                       | `eslint-plugin-import` `no-restricted-paths` (already in baseline ESLint config)                                                                                                                       |
| `process.env` access only in `lib/env.ts`                                                                                                                          | All `apps/web/**`                                                                                                                              | Custom ESLint rule (already in baseline)                                                                                                                                                               |
| Every authenticated Hono route has the session middleware applied                                                                                                  | `apps/web/server/app.ts`                                                                                                                       | Vitest scan over the registered route table; whitelist for explicitly-anonymous routes                                                                                                                 |
| Every translate / inbound call writes a `usage_events` row                                                                                                         | `server/translation/orchestrator.ts`                                                                                                           | Integration test: invoke the orchestrator against a test DB; assert one row written per call                                                                                                           |
| Every prompt version is registered in `packages/prompts/index.ts`                                                                                                  | `packages/prompts/**`                                                                                                                          | Vitest scan: every file matching `v*.ts` in prompts must be exported from the index                                                                                                                    |
| Bundle composition: no server-only deps reach the client bundle (e.g., `pino`, `@anthropic-ai/sdk`, `drizzle-orm`)                                                 | Vite bundle output                                                                                                                             | `size-limit` config with explicit per-bundle deny lists                                                                                                                                                |
| Every i18n key used in the codebase exists in both `en` and `ja` namespaces                                                                                        | `packages/i18n/**`                                                                                                                             | Vitest scan: extract all `t('...')` keys via AST; assert they exist in every locale file                                                                                                               |
| Every `user_id` column has type `text` (matches `users.id`)                                                                                                        | `apps/web/server/db/schema.ts`                                                                                                                 | Postgres `pg_attribute` introspection in an integration test; type mismatch silently breaks FK enforcement and RLS                                                                                     |
| Every encrypted (`bytea`) user-content column has a paired `*_nonce bytea` sibling                                                                                 | `apps/web/server/db/schema.ts`                                                                                                                 | Schema introspection: for every `bytea` column matching the encrypted-fields catalogue (back_end §3.1), assert a same-prefix `*_nonce bytea` exists                                                    |
| Every assignment to a known-encrypted column originates from a call to `encryptForUser(...)` (taint-style)                                                         | `apps/web/server/**`                                                                                                                           | ts-morph scan: trace the RHS of every `db.insert/update` setting an encrypted column; CI-fail if it doesn't trace back to the encryption wrapper                                                       |
| Every authenticated POST/PUT/PATCH/DELETE Hono route has zod body validation                                                                                       | `apps/web/server/**`                                                                                                                           | Vitest scan over the registered route table; for every state-changing handler, assert chain includes `zValidator('json', SomeSchema)`                                                                  |
| RLS is enabled on every user-scoped application table AND every `auth_*` table                                                                                     | `apps/web/server/db/schema.ts` + Postgres                                                                                                      | `pg_class.relrowsecurity` introspection; whitelist for explicitly system tables                                                                                                                        |
| Raw `SET LOCAL nuansu.user_id` is banned outside the `db.forUser` wrapper                                                                                          | `apps/web/server/**`                                                                                                                           | grep / AST scan; only the wrapper may set the session var, and only via the SECURITY DEFINER `nuansu.set_user_id` setter                                                                               |
| `nuansu_app` role cannot SELECT from `auth_users` (or any `auth_*` table)                                                                                          | DB roles + grants                                                                                                                              | Integration test: connect as `nuansu_app`; `SELECT FROM auth_users` raises `permission denied`                                                                                                         |
| CSP has no scheme-level wildcards (`*`, `https:`, `https://*`); subdomain wildcards (`https://*.host`) only when listed in `security.md §13.1` justification table | CSP middleware config + `security.md §13.1`                                                                                                    | Unit test parsing the configured CSP string: (a) no token is bare `*` / `https:` / `https://*` in any directive; (b) every `https://*.host` token is present in the §13.1 wildcard-justification table |
| Every coachmark ID used in code is a member of the `CoachmarkId` schema enum                                                                                       | `apps/web/src/**` + `packages/schemas`                                                                                                         | ts-morph scan: extract every `useCoachmark('...')` arg + dismiss-coachmark body validators; assert each is in the `CoachmarkId` const-tuple                                                            |
| Every bespoke component has ≥ 4 Ladle stories (default / loading / error / edge)                                                                                   | `apps/web/src/components/**`, `apps/web/src/features/*/components/**`                                                                          | ts-morph scan: for each `*.tsx` (excl. `.stories.tsx` / `index.ts`), assert sibling `.stories.tsx` exists and exports ≥ 4 named stories                                                                |
| Cached prompt prefix is byte-identical across all input variation (no per-user content interpolation)                                                              | `packages/prompts/src/v*/cached-prefix.ts`                                                                                                     | Property test: build prompt with N random user inputs; assert layer with `label='universal_v1'` is byte-stable                                                                                         |

**When to add a new fitness function.** Whenever a documented architectural rule could be silently violated and you wouldn't notice. The rule is: if losing this invariant would degrade the system in a way that's invisible to feature tests, write a fitness function. Example triggers: a new "must-go-through-wrapper" rule, a new column that must always be encrypted, a new banned import.

**Where they live.** `apps/web/server/__fitness__/` and `apps/web/src/__fitness__/` — directory naming makes them grep-able and they run in their own Vitest project so they can be isolated when iterating.

## 4. Quality gates (CI-failing)

Every PR runs these. A red gate blocks merge.

| Gate                          | Threshold                                        | Tool                                                                | Lands in phase |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- | -------------- |
| TypeScript strict             | must pass                                        | `tsc --noEmit`                                                      | 1              |
| ESLint clean                  | zero warnings                                    | eslint flat config                                                  | 1              |
| Cognitive complexity          | ≤ 15 per function                                | `eslint-plugin-sonarjs`                                             | 1              |
| Cyclomatic complexity         | ≤ 12 per function                                | `eslint-plugin-sonarjs`                                             | 1              |
| Coverage (non-UI)             | ≥ 80% line, ≥ 75% branch                         | Vitest with c8                                                      | 8              |
| **CRAP score**                | **≤ 30 per function**                            | custom CI script (see §4.1)                                         | 8              |
| Lighthouse mobile             | ≥ 90 on PA/Acc/BP/SEO                            | `@lhci/cli`                                                         | 8              |
| **Per-route LCP**             | ≤ documented per-route budget (see §4.2)         | `@lhci/cli` `assert.assertions` per URL                             | 8              |
| **Per-route TBT**             | ≤ documented per-route budget (see §4.2)         | `@lhci/cli` `assert.assertions` per URL                             | 8              |
| **Streaming first-token p50** | ≤ 1.2 s against stub provider                    | Playwright perf-trace test                                          | 8              |
| Bundle size                   | ≤ 180 KB gz initial JS                           | `size-limit`                                                        | 8              |
| Axe a11y                      | 0 serious/critical violations                    | axe-core via Playwright                                             | 3, 5, 8        |
| Vitest bench drift            | ≤ 25% from baseline                              | `vitest --bench`                                                    | 2, 6, 8        |
| Format check                  | Prettier-clean                                   | `prettier --check`                                                  | 1              |
| **CI wall-clock**             | PR CI ≤ 12 min p95 (week-over-week growth ≤ 25%) | per-job duration capture in CI; fitness-test on the rolling average | 8              |

UI components are exempt from the line-coverage threshold because they're covered by Ladle stories + Playwright e2e instead. The exemption is enforced by the c8 config (`coveragePathIgnorePatterns: ['apps/web/src/components', 'apps/web/src/features/*/components']`), not by goodwill.

### 4.2 Per-route performance budgets

A global Lighthouse ≥ 90 averages out hot spots — a slow chat view hides behind a fast marketing page. Every prerendered or app route declares its own LCP / TBT budget in the Lighthouse CI config; regressions on a specific route fail the gate even if the global average is fine. AI-heavy work means a per-component change can degrade one route without anyone noticing — the per-route budget catches it.

| Route                | LCP (mobile, p75) | TBT (mobile, p75) | Notes                                                                           |
| -------------------- | ----------------- | ----------------- | ------------------------------------------------------------------------------- |
| `/` (landing)        | ≤ 1.8 s           | ≤ 200 ms          | Prerendered; mostly text + one image. Below this, marketing conversion suffers. |
| `/pricing`           | ≤ 2.0 s           | ≤ 200 ms          | Prerendered; pricing card + FAQ.                                                |
| `/privacy`, `/terms` | ≤ 1.5 s           | ≤ 100 ms          | Prerendered; pure text.                                                         |
| `/auth/sign-in`      | ≤ 1.5 s           | ≤ 150 ms          | Cold-cache TLS handshake dominated; minimal JS.                                 |
| `/app/chats`         | ≤ 2.5 s           | ≤ 300 ms          | First authenticated render; chat-list virtualised; budget covers prefs preload. |
| `/app/chats/:id`     | ≤ 2.8 s           | ≤ 350 ms          | Composer + audit panel + virtualised messages — the heaviest authed route.      |
| `/app/settings/*`    | ≤ 2.0 s           | ≤ 250 ms          | Form-heavy; should be light.                                                    |

The streaming first-token target (≤ 1.2 s p50 from request to first SSE chunk) is enforced by a Playwright perf-trace test against a stub LLM provider configured for known fixed latency — measures the orchestrator + parser + render path, not Anthropic's response time.

### 4.3 CI wall-clock budget

AI-assisted iteration produces high PR/CI volume. Without a ceiling, slow CI erodes the TDD loop ("just push and grab a coffee" becomes the norm). Targets:

- **PR CI total ≤ 12 minutes p95.** Captured per-PR; rolling average published in the CI summary.
- **Week-over-week growth ≤ 25%.** A fitness test on the rolling average fails if total CI time grows faster than that without an explicit config opt-in (e.g., a deliberately-added e2e suite).
- **Per-job ceilings:** typecheck/lint/format ≤ 90 s; unit ≤ 3 min; e2e ≤ 6 min; bench ≤ 4 min; lighthouse ≤ 4 min; bundle-size ≤ 1 min.
- **Sharding triggers:** if any single job exceeds its ceiling for two consecutive weeks, shard it (test parallelism, route-split for e2e, etc.) before the ceiling is raised.

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

| Module                                   | Invariant                                                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE chunk parser                         | Any byte sequence either parses to a valid chunk or returns a typed error — never throws                                                                                                            |
| `TranslationStreamChunk` zod schema      | `schema.parse(schema.parse(x))` is idempotent for any valid `x`                                                                                                                                     |
| Name-lock matcher (compose-time hint)    | Matches are case-insensitive, word-boundary-respecting, never overlap                                                                                                                               |
| Audit point reducer                      | Any action sequence on any state yields a valid state                                                                                                                                               |
| Prompt builder                           | Output never contains banned PII fields from §6 logger redactor list                                                                                                                                |
| Recent-thread window selector            | Output respects count cap (≤ 10) AND token cap (≤ 2000) for any input                                                                                                                               |
| Quota Lua script                         | Concurrent translate requests never exceed the daily cap                                                                                                                                            |
| Envelope encryption (XChaCha20-Poly1305) | `decrypt(encrypt(plaintext, aad), aad) === plaintext` for any plaintext + aad                                                                                                                       |
| AAD-mismatch decryption                  | `decrypt(encrypt(p, aad1), aad2)` always rejects when `aad1 !== aad2`                                                                                                                               |
| Audit-point assembly                     | For any permutation of a fixed chunk multiset, the merged `TranslationObject` is structurally equal — assembly is order-independent so live-stream and replay/restoration produce identical objects |
| SSE parser transport pathologies         | Splitting any known-good byte stream at every byte index yields the same final state as the un-split stream (catches mid-multibyte UTF-8 boundary bugs, mid-event truncation)                       |
| Cached-prompt-prefix invariance          | `buildPromptV1(input).layers.find(label='universal_v1').text` is byte-stable across any input variation (no per-user content interpolation)                                                         |

**Property tests are not enough for concurrency.** fast-check is single-threaded; properties tagged "concurrent" in name actually need a real-Redis or real-Postgres harness with `Promise.all(N)`. Documented as integration tests, not properties:

| Module                       | Concurrency invariant                                                                                                                                                 | Harness                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Quota Lua script             | `N=200` concurrent translate requests against a near-cap user produce exactly `min(N, cap)` admissions                                                                | dockerised Redis + `Promise.all`; chaos variant with 50ms sleep between read/write to maximise race window |
| Last-write-wins preferences  | Two PUTs in quick succession: second wins; response carries the version field client banner uses                                                                      | dockerised Postgres + `Promise.all` + assertion on the response version                                    |
| Idempotency-key replay       | Same key + same body → cached replay; same key + different body → 409; key during in-flight stream → 202 sentinel                                                     | dockerised Redis + matrix of the 4 cases                                                                   |
| AAD row-mover bug simulation | A row migrated between users by a buggy migration produces an `internal` error on read (not `unauthorised`/`not_found`); error payload contains zero ciphertext bytes | hand-craft row with AAD bound to user A; attempt read as user B via the wrapper                            |

**Anti-patterns to avoid:**

- Using fast-check as a substitute for a hand-written test. Both, not either.
- Generating arbitraries that don't actually exercise the function (e.g., always-empty strings).
- Properties that just restate the implementation. Properties name the _invariant_, not the algorithm.

## 6. LLM evaluation strategy

Fixture replay (canned chunk sequences from `apps/web/server/llm/fixtures/`) covers the orchestrator's deterministic behaviour but not the LLM's. The LLM is the product moat AND the most expensive thing to regress silently — a model-side schema change, a tightened safety filter, or a prompt edit can drop quality without any test going red. Four complementary harnesses:

### 6.1 Live-provider conformance (output-schema drift)

A nightly **non-blocking** GitHub Actions job runs ~10 representative prompts against the real Anthropic Sonnet/Haiku endpoints, parses the SSE through the production parser, and validates every chunk against the production zod schema (`TranslationStreamChunkSchema` etc.). Failures alert (not block PRs) and **block prompt-version promotion** (a `vN+1` can't be promoted to default until conformance is green for the new prompt against the live model).

Lives in `apps/web/server/llm/__live_eval__/conformance.test.ts` (separate Vitest project; gated by env var so it doesn't run on developer machines or PR CI).

### 6.2 Drift-detection precision/recall regression

Drift detection is the most fragile LLM behaviour: false positives nag the user; false negatives accumulate silently. Without a labelled corpus, a prompt edit can halve recall and the only signal is dogfood weeks later.

**Corpus shape**: ~50 `recent_thread` slices per category (`name_reveal`, `nickname_offer`, `register_shift`, `context_update`), each with `expected_suggestion: PrefsSuggestion | null`. Hand-labelled by the founder; lives at `private/llm-eval/drift-corpus/` (gitignored — contains representative-but-realistic conversation examples).

**Harness**: per-category precision and recall reported on every prompt-version PR. CI gate per category: **recall ≥ 0.7, precision ≥ 0.8**. A prompt change that drops below either threshold blocks merge.

### 6.3 Prompt-injection / safety regression

~20 adversarial inputs covering the documented attack vectors (delimiter-escape attempts, role-impersonation, "ignore prior instructions," cross-language injection). For each, assert the model:

- Still emits literal + natural for the actual draft.
- Never honours the injected instruction (e.g., never returns only `{}`).
- Never emits a `prefs_suggestion` whose `evidence_excerpt` contains an injection marker (server-side regex screen catches this; the test asserts the screen fires).

Runs as part of the prompt eval harness; lives at `apps/web/server/llm/__live_eval__/injection.test.ts`. Failures block the prompt-version promotion.

### 6.4 Cost + cache-hit regression

A prompt edit that bloats the cached prefix or breaks the cache-key prefix tanks the cache-hit rate AND drives up token bills. Per prompt-version PR:

- **Cost regression**: report token counts (input + output + cached) for the corpus run; CI gate fails if total token count grows >25% vs the prior `vN`.
- **Cache-hit regression**: report `(cached_tokens / input_tokens)` ratio for the corpus run; CI gate fails if the ratio drops by >10 percentage points vs the prior `vN`.

**Test data factories.** Across all four harnesses, fixture inputs are built via shared zod-derived mock factories in `test/factories/` (e.g., `@anatine/zod-mock` against `TranslateRequestSchema`). AI tools left to ad-hoc fixtures regenerate them per test, drift them subtly, and miss schema changes — factories prevent that.

## 7. Mutation testing — deferred to v2

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

## 8. TDD anti-patterns to avoid

Mechanical tests are mechanical tests — they can pass without verifying anything useful. Watch for:

- **Test the implementation, not the behaviour.** Tests that mirror code structure (one test per function, one assertion per branch) break on every refactor without catching real bugs. Test what the code _does_, not how it's organised.
- **Snapshot-as-test.** Snapshots are useful for component output structure but not as a substitute for behaviour tests. A snapshot only tells you "the output didn't change" — it doesn't tell you the output is correct.
- **Assertion-light tests.** A test that only checks "no throw" is barely a test. Every test should make at least one specific claim about behaviour.
- **Mocked-into-meaninglessness.** If every dependency is mocked, the test verifies nothing about real integration. Use real dependencies wherever practical (ephemeral Postgres, real zod schemas, real reducers).
- **Coverage as goal, not signal.** 100% coverage from low-quality tests is worse than 70% coverage from high-quality ones. The CRAP gate (§4.1) catches the trap of "covered but untested."
- **Tests that mock the thing being tested.** If you're mocking `db.forUser` while testing `db.forUser`, you're testing your mock.

## 9. Pre-commit hooks (lefthook)

Sub-30-second feedback before a commit lands. Configured in `lefthook.yml` at the repo root:

```yaml
pre-commit:
  parallel: true
  commands:
    typecheck:
      glob: "*.{ts,tsx}"
      run: pnpm typecheck
    lint:
      glob: "*.{ts,tsx,js,jsx}"
      run: pnpm exec eslint {staged_files}
    format:
      glob: "*.{ts,tsx,js,jsx,json,md,css,html,yml,yaml}"
      run: pnpm exec prettier --check {staged_files}
    unit:
      glob: "*.{ts,tsx}"
      run: pnpm exec vitest --changed --run

pre-push:
  commands:
    test:
      run: pnpm test
```

`pnpm typecheck` runs the workspace-aware `pnpm -r typecheck`. `pnpm exec <bin>` is used over `pnpm <bin>` for tools that aren't exposed as workspace scripts.

Pre-push runs the full unit + integration suite; e2e and Lighthouse only run in CI. Skipping hooks via `--no-verify` is forbidden by project policy except for explicit emergency hotfixes signed off in the PR description.

## 10. Required dependencies

- `vitest` + `@vitest/coverage-v8` (c8) — unit + integration + coverage
- `fast-check` — property-based testing
- `@playwright/test` + `@axe-core/playwright` — e2e + a11y
- `eslint-plugin-sonarjs` — complexity gates
- `@lhci/cli` — Lighthouse CI (with per-route `assert.assertions` per §4.2)
- `size-limit` + `@size-limit/preset-app` — bundle-size gate
- `lefthook` — pre-commit hooks
- `prettier` — format check
- `ts-morph` — AST-walking fitness tests (taint-style write-path enforcement, route-table introspection, coachmark-ID enum check, story-coverage scan; see §3.1)
- `@anatine/zod-mock` (or equivalent) — zod-derived test data factories (§6.4)
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
