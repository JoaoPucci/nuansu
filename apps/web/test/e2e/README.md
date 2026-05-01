# End-to-end tests

Playwright tests against the running app, against an LLM stub. These exercise the full stack — UI, network, server, DB (ephemeral) — in real browsers (Chromium + Webkit per `front_end_architecture.md`).

## Read-only to AI

Same rule as `apps/web/test/acceptance/`: AI tools **may not modify any file in this directory**. See `AGENTS.md §3.2` and `docs/quality.md §11.1`.

If a test fails:

1. **Fix the code** to make it pass.
2. Do not change the assertion. Do not soften. Do not skip. Do not `.only`.
3. If the test itself appears wrong, **stop and ask the human author**.

## Naming convention

Same as `apps/web/test/acceptance/`. Behavioural sentences. No implementation jargon.

```ts
test("user reaches first translation in sample chat within 90 seconds of signup", ...)
test("translating outbound preserves contact name in target text", ...)
test("logging out and back in retains all chat preferences", ...)
```

## What goes here

- The four happy paths in `requirements.md §7`.
- The first-run experience flow (R4a — sample chat → first translation → coachmark dismissal → archive).
- The copy affordance flow (R24a — tap copy, menu copy, keyboard copy across mobile + desktop).
- The drift-detection flow (suggestion → apply / keep_both / dismiss).
- Cross-cutting smoke tests tagged `@smoke` for fast feedback loops.

## Stack

- Playwright 1.x against Chromium + Webkit.
- LLM provider stubbed (`LLM_PROVIDER=stub`) — replays canned `TranslationStreamChunk` sequences from `apps/web/server/llm/fixtures/`.
- Stripe stubbed; KMS stubbed; email writes to `mailcrab` or local `.eml` files.
- Ephemeral seeded Postgres per test run.

## A11y sweep

Every authenticated route gets an `axe-core` check via `@axe-core/playwright`. Zero serious/critical violations is a CI-blocking gate (`docs/quality.md §4`).
