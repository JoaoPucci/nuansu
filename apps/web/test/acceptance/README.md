# Acceptance tests

These tests are **the spec**. They define the behaviour the product must exhibit.

## Read-only to AI

AI tools (Claude Code, Cursor, Copilot, etc.) **may not modify any file in this directory**. See `AGENTS.md §3.2` and `docs/quality.md §11.1`.

If a test fails:

1. **Fix the code in `apps/web/src/**`or`apps/web/server/**`** to make it pass.
2. Do not change the assertion. Do not soften the expectation. Do not skip the test. Do not add `.only`.
3. If the test itself appears wrong, **stop and ask the human author**. Only humans modify these tests, in human-authored commits, called out explicitly in the PR description.

## Naming convention

Test descriptions are behavioural sentences — subject, observable outcome, condition.

> Pattern: `<subject> <does/produces> <observable> when <condition>`

```ts
test("copy icon places natural target in clipboard when view toggle is on source", ...)
test("sample chat is removed from chat list when user taps Use real chats", ...)
test("audit point card disappears optimistically when user taps Apply", ...)
```

Banned in test names: implementation jargon (`mock`, `spy`, `stub`, `intercept`, `internal-…`, `helper-…`, `private-…`). The test name should read as something a product-minded reader can understand without the codebase open.

## What goes here

- Behavioural specs that map directly to a `requirements.md` requirement (R1, R2, …) or DoD line.
- Tests written from the user's point of view, not the code's.
- Tests that survive refactoring of the implementation underneath.

## What does NOT go here

- Unit tests of pure functions → `apps/web/src/**` co-located with the module.
- Integration tests of internal modules → `apps/web/server/**/__tests__/`.
- Component visual tests → Ladle stories in the component folder.
- E2E full-flow tests against the running app → `apps/web/test/e2e/`.
