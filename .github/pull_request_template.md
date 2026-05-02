<!--
Project working agreements: see AGENTS.md.
Quality gates and testing policy: see docs/quality.md.
-->

## Summary

<!-- 1–3 sentences. What changed and why. The diff shows what; this section explains why. -->

## Type

<!-- Pick one. -->

- [ ] feat — new user-facing behaviour
- [ ] fix — bug fix
- [ ] refactor — internal restructuring; no behaviour change
- [ ] perf — performance improvement
- [ ] docs — documentation only
- [ ] chore — tooling, deps, CI, scaffolding
- [ ] test — adding/improving tests only

## Test plan

<!-- How you verified this works. Be specific.
     For UI changes: include screenshots and which breakpoints you tested at.
     For server changes: list the integration tests run + any manual curl/repro steps.
     "All tests pass" is not a test plan. -->

## Documentation discipline

<!-- AGENTS.md §3.4: code changes that alter documented behaviour must update /docs/ in the same PR. -->

- [ ] No documented behaviour changed.
- [ ] Documented behaviour changed; the relevant `/docs/` sections were updated in this PR (list them).

If you updated docs, list which sections:

<!-- e.g. requirements.md §5.7 R24a; back_end_architecture.md §3.1 (new column); design_system.md §7.1 -->

## Tests changed?

<!-- AGENTS.md §3.2 + docs/quality.md §11.1: AI tools may not modify acceptance tests.
     Acceptance tests live in apps/web/test/acceptance/** and apps/web/test/e2e/**. -->

- [ ] No tests changed.
- [ ] Unit/integration/component tests changed — assertions preserved or strengthened.
- [ ] **Acceptance or e2e test changed** — explain who authored the change and why:

<!-- If yes, paste the human-author commit hash and explain what behavioural spec is being updated.
     A weakened or removed acceptance test will be reverted unless the rationale here is sound. -->

## UI changed?

<!-- AGENTS.md §4: design enforcement applies. -->

- [ ] No UI changed.
- [ ] UI changed — checklist below is complete.

If UI changed:

- [ ] I read the relevant `docs/design_system.md` section before writing JSX.
- [ ] I verified the change in a browser at mobile + desktop breakpoints (`pnpm dev`).
- [ ] I compared the result against the closest reference app (Linear / Granola / Cron / Raycast / Telegram per `design_system.md §2`) and it holds up.
- [ ] Every bespoke component has 4 Ladle stories minimum (default / loading / error / edge).
- [ ] No banned patterns (stock illustrations, neon colour outside audit palette, emoji, exclamation marks, hover-only affordances, generic shadcn defaults). See `AGENTS.md §4.3`.
- [ ] Screenshot(s) attached below.

<!-- Drag-drop screenshots here for mobile + desktop. -->

## New dependencies?

- [ ] No new deps.
- [ ] Added dep(s); justified in the description (size, license, maintenance, why not the existing toolkit).

List:

<!-- npm package(s) and one-line justification per package -->

## Quality gates

<!-- Auto-checked by CI. List any that need follow-up. -->

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (sonarjs cognitive ≤ 15, cyclomatic ≤ 12)
- [ ] `pnpm test` passes (unit + integration)
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] Pre-commit hooks ran clean (no `--no-verify`)

## Reviewer agents

<!--
Project reviewer subagents live in .claude/agents/. Each is invoked at the end
of a relevant change and returns a severity-tagged findings report. Tick which
agents ran and confirm their findings were addressed (or explicitly acknowledged
in the PR body).

If a change doesn't trigger any reviewer (e.g., docs-only, README, comments),
tick "N/A".

Full reviewer index in AGENTS.md §3.8.
-->

- [ ] N/A — change doesn't trigger any reviewer
- [ ] `design-review` ran (UI changes in `apps/web/src/{components,features,routes,styles}/**`, Tailwind, theme tokens, Ladle stories)
- [ ] `security-review` ran (auth / crypto / data-handling / route work, env loader, new deps)
- [ ] `compliance-review` ran (data flows, retention, sub-processors, tracking, consent, legal pages)
- [ ] `prompt-eval-reviewer` ran (`packages/prompts/**` or LLM fixtures)
- [ ] `schema-migration-review` ran (`apps/web/server/db/schema.ts` or `drizzle/**`)

If any reviewer surfaced findings that are NOT addressed in this PR, list them with rationale:

<!-- e.g. "design-review flagged inconsistent icon size on chat row — deferred to a follow-up; tracked at private/CHECKPOINT.md" -->

## AI-assisted?

<!-- Honest answer; helps reviewer calibrate scrutiny on test-as-spec rule, design discipline, and "looks correct but degrades" failure modes. -->

- [ ] Mostly human-authored
- [ ] Mostly AI-authored with human review
- [ ] Mixed
