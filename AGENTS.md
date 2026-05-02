# AGENTS.md

This file is the entry point for any AI tool (Claude Code, Cursor, Copilot, etc.) and any new human contributor working on this codebase. It captures the **working agreements** for how to operate effectively here — the _how_, not the _what_. The _what_ lives in `/docs/`.

This document is **not written in stone**. Anything here can be discussed, challenged, and evolved. The rule is: change the agreement explicitly, in a PR that updates this file. Don't quietly drift away from it.

If you are an AI tool, treat the rules in this file as instructions, not suggestions.

---

## 1. What this project is

Nuansu is a **cross-language chat copilot** for personal communication — it translates messages between languages while preserving names, register, and meaning. The primary use case is JP↔EN messaging on platforms the user uses every day (LINE, Tinder, etc.). It's a SaaS product the founder is building publicly, dogfooded daily.

The thesis: **anti-drift is the prime directive.** Every translation is two passes (literal + natural), every change is auditable, and the user is always in control. The product loses if it silently rewrites what someone meant.

For the full system shape, read `docs/architecture.md`. For why the decisions were made, read `docs/questions.md`.

## 2. How to read this codebase

The source of truth lives in `/docs/`. There is no other source of truth. Read these in order on a fresh session:

| If you want to know…                          | Read…                                |
| --------------------------------------------- | ------------------------------------ |
| What the system looks like at 30,000 ft       | `docs/architecture.md`               |
| What we're building (functional requirements) | `docs/requirements.md`               |
| The visual language and component anatomy     | `docs/design_system.md`              |
| Backend specifics (API, DB schema, LLM, jobs) | `docs/back_end_architecture.md`      |
| Frontend specifics (state, routes, composer)  | `docs/front_end_architecture.md`     |
| Security model + threat model                 | `docs/security.md`                   |
| GDPR / APPI compliance and the DPIA           | `docs/compliance.md`, `docs/dpia.md` |
| Production deployment shape                   | `docs/deployment.md`                 |
| Quality bar, testing, CI gates, AI guardrails | `docs/quality.md`                    |
| What's been resolved vs. deferred             | `docs/questions.md`                  |

When code and docs disagree, **the docs are right and the code is wrong** — fix the code, or update the docs in the same commit if the doc is what's outdated. See "Documentation discipline" below.

### 2.1 Briefing — read this every fresh session

Before starting work in a new session, **read `private/BRIEFING.md`** (gitignored). It is the founder's hand-curated layer of operational context: scripts the AI keeps forgetting exist, conventions to re-load, anti-patterns to avoid, current focus.

The reading order on a fresh session is:

1. The auto-loaded `MEMORY.md` (cross-session memory).
2. `AGENTS.md` (this file — working agreements).
3. `private/BRIEFING.md` (focused human-curated context).
4. `private/CHECKPOINT.md` (latest implementation handoff, when present).
5. The relevant `/docs/` sections for the task at hand.

`BRIEFING.md` exists because `/docs/` is comprehensive but large and `MEMORY.md` is broad — neither captures "the specific things the AI keeps tripping on right now in this project." Concrete example: the founder noticed AI sessions repeatedly run individual commands that an existing project script already wraps (e.g., re-running env-sync steps individually instead of using `pnpm sync-env`). A BRIEFING entry suppresses that failure mode for the next session.

**Workflow for adding to BRIEFING.md:**

1. The user notices a pattern worth pinning, OR the AI proposes one based on a mistake just made.
2. The AI proposes the bullet point in conversation, in the BRIEFING.md format (one-line `**TLDR**` + short explanation, slotted under the right category).
3. The user confirms the wording or edits it.
4. **Only then** does the AI append it to `private/BRIEFING.md`. Never silently.

**Workflow for editing or removing entries:** the AI never silently modifies or removes a BRIEFING entry. If an entry seems stale or wrong, the AI asks the user before changing anything. The file is the user's lever; the AI is the editor under user direction.

Categories already in the file: Operational shortcuts, Conventions worth re-loading, Active anti-patterns to avoid, Current focus, Notes from the user. New categories may be added with user agreement.

## 3. Working agreements

### 3.1 Strict TDD

Every behavioural module is built **red → green → refactor**. Write the failing test first; implement minimum code to pass; refactor with the test as a safety net. Full discipline + per-piece test-level guidance in `docs/quality.md §2`.

If you find yourself writing implementation code without a test, **stop and write the test first**.

### 3.2 Acceptance tests are read-only to AI

Tests under `apps/web/test/acceptance/**` and `apps/web/test/e2e/**` are **the spec**. AI tools may not modify them.

- If a test fails, fix the code in `apps/web/src/**` or `apps/web/server/**` to make it pass.
- Do not change the assertion. Do not soften the expectation. Do not skip or `.only` the test. Do not modify the test name to make it pass.
- If the test itself appears wrong, **stop and ask the human author**. Only humans modify acceptance tests.
- Other test categories (unit, integration, component) may be edited, but each edit must preserve or strengthen the assertion. Weakening a passing test to bypass a failure is the same anti-pattern at a smaller scale.

Full rule: `docs/quality.md §11.1`.

### 3.3 Quality gates are CI-enforced, not negotiated

Every PR runs the full gate suite: typecheck, lint, sonarjs cognitive ≤ 15, sonarjs cyclomatic ≤ 12, coverage ≥ 80% non-UI, CRAP score ≤ 30 per function, Lighthouse ≥ 90, bundle ≤ 180 KB gz, axe a11y, vitest bench drift ≤ 25%. A red gate blocks merge.

If a gate is wrong for a piece of code, **change the rule, don't bypass the gate**. Inline `eslint-disable` without a justification comment fails review. Skipping hooks via `--no-verify` is forbidden except for explicit emergency hotfixes signed off in the PR description.

Full table: `docs/quality.md §4`.

### 3.4 Documentation discipline

When a code change alters documented behaviour, **update the relevant `/docs/` section in the same commit**. The repo at HEAD must always be a coherent statement of the system.

The mapping is in `docs/quality.md §11.4`. Examples:

- New API endpoint → `back_end_architecture.md §2.1` table
- New schema column → `back_end_architecture.md §3`
- New requirement → `requirements.md`
- New component → `design_system.md §7`
- New testing rule → `quality.md`

If you can change behaviour without changing a doc, the doc was incomplete. Fix both.

### 3.5 Commits and scope

- One commit per logical change. Conventional-commit prefixes: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`.
- A commit message body explains _why_, not _what_ (the diff shows what). Reference the relevant doc section that motivated the change.
- Phase commits (Phase 1 → 8 in the implementation plan) are larger and follow the per-phase deliverable list.
- **Stage files explicitly. Never `git add .`, `git add -A`, `git add -u`, or `git add ./*`.** Always pass the specific paths you intend to commit (`git add path/to/file1 path/to/file2`). Reason: blanket staging silently picks up unrelated work-in-progress, orphan test artifacts left behind by QA runs (e.g., `__test_*.ts` files), local IDE state that escaped `.gitignore`, accidental `.env`-shaped files, and AI-generated debug fixtures. Every one of these has happened in real projects and has shipped credentials or broken builds. Explicit paths force the discipline of `git status` → confirm the intended set → stage that set. If you find yourself reaching for `.` because the list is long, that's a signal the commit is doing too much — split it. **Exception:** Dependabot opens its own PRs — no human/AI stages those.
- **Branch naming: `<who>/<what>`.** Light-touch convention: a short identifier for who owns the branch, a slash, and a kebab-case description of what it does. Examples: `joao/phase-2-schemas`, `joao/dependabot-config`, `claude/fix-ci-pnpm-version`. Bot-generated branches (Dependabot's `dependabot/...` prefix, automated release branches) are exempt. The point is "I can scan `git branch -r` and tell at a glance who's doing what" — not perfect compliance.

### 3.6 Per-phase QA documents

After every phase, write a complete QA document at `private/tmp/phase-N-qa.md` (gitignored — it can reference the founder's local environment, secrets paths, etc.). This is **the load-bearing handoff** between AI implementation and human verification.

**The QA doc is a complete, ordered, step-by-step procedure** — not a summary of what was shipped, not a release-notes blurb. It assumes the reader is starting on a **fresh environment from scratch**: a freshly-imaged laptop, no project clone, no tools installed, no accounts set up.

Every phase's QA doc must cover, in order:

1. **Prerequisites** — exact OS / runtime versions, every CLI tool that must be present (Node 20.x, pnpm 10.x via corepack, Docker, OpenSSL, etc.) with the install command for each.
2. **Repo setup** — `git clone`, `pnpm install`, every config-file copy with the exact destination path and permission (`chmod 600`, etc.).
3. **External platform sign-ins / integrations** — for any external service the phase touches: the sign-up URL, the screens to click through, the values to copy back into local config, the resulting env-var name. Every cloud console screen named explicitly. Don't write "set up Stripe" — write the literal click path and the field-by-field values.
4. **Local services** — `docker compose up` with the expected output, the ports each service binds to, how to verify each is running.
5. **Database / migrations** — `pnpm db:migrate`, `pnpm db:seed`, with expected output and how to verify.
6. **Run + smoke** — exact commands to start the dev environment, the URLs to visit, the things to click, the expected screen for each, and the expected backend log lines.
7. **Functional verification** — every user-visible feature shipped in this phase, with explicit step-by-step click paths and the expected outcomes. Reference the requirements (`R1`, `R2`, …) the steps verify.
8. **Test verification** — exact commands for `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm bench`, `pnpm build`, with expected output (test counts, coverage numbers, bundle size).
9. **Cleanup** — how to tear down what was set up, in case the user wants to re-run from scratch.

**Iteration over the prior phase.** Each phase-N QA doc is an extension of phase-(N-1) — the previous steps still need to work. Either re-include the prior steps verbatim (preferred — it's a complete recipe), or explicitly reference "run all of `phase-(N-1)-qa.md` first, then continue from step X" with no ambiguity about what carried over. Never assume the reader remembers the prior phase.

**The protocol.** The user runs through the QA doc manually, then in the next session reports either "all green" or "step X failed: [details]". If something failed, fix-with-test before starting the next phase. The next phase's QA doc opens by re-verifying the prior phase still works after the fix.

**Why this discipline.** AI-implemented phases are easy to declare done at the code level (tests pass) but hard to verify at the system level (does the founder's actual install + run + use experience work?). The QA doc is the contract that the phase is _actually_ shippable on the target environment, not just "works on Claude's understanding of the environment." It is the founder's safety net against integration drift.

A QA doc that says "install dependencies and run tests" is a failed QA doc. The right level of detail is "if the founder copy-pastes every command line in order on a fresh Ubuntu 24.04 laptop, the phase works." Aim there.

### 3.7 No premature abstraction, no dead-code accumulation

- Three similar lines is not a pattern; refactor when you have five and they're clearly the same thing.
- No backwards-compatibility shims for code that hasn't shipped publicly. Until v1 is live, just change the code.
- No `// removed for X` comments — delete is delete. Git remembers.
- No `// TODO: do this later` for things that should be done now. If it's not done now, file it as a real follow-up.

### 3.8 Project reviewer subagents

The project ships with five **reviewer-shaped** Claude Code subagents in `.claude/agents/` (version-controlled, not gitignored). Each is invoked at the **end of a relevant change**, before the PR opens, and returns a severity-tagged findings report against the documented authority for its area. None of them edit code (Read + Grep + Bash + Glob only) — they are independent reviewers, not builders.

| Agent                     | Triggered by                                                                                                                                      | Authority                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `design-review`           | UI changes (`apps/web/src/{components,features,routes,styles}/**`, Tailwind config, theme tokens, Ladle stories)                                  | `docs/design_system.md` §1–§11 + this file §4. Folds a11y in.         |
| `security-review`         | Auth / crypto / data-handling / route work (`apps/web/server/{auth,crypto,db,translation,billing,email,llm}/**`, env loader, new deps)            | `docs/security.md` + `docs/back_end_architecture.md` §3, §3.3, §4, §5 |
| `compliance-review`       | Data flows, retention, sub-processors, tracking, consent, legal pages. **Explicit no-legal-interpretation scope** — flags `[COUNSEL]` items only. | `docs/compliance.md` + `docs/dpia.md`                                 |
| `prompt-eval-reviewer`    | `packages/prompts/**` and LLM fixture changes                                                                                                     | `docs/back_end_architecture.md` §5.3, §5.4                            |
| `schema-migration-review` | `apps/web/server/db/schema.ts` and `drizzle/**`                                                                                                   | `docs/back_end_architecture.md` §3, §12                               |

**Discipline:**

- **Reviewers, not builders.** Builder personas ("you are a senior X who...") usually produce generic output dressed in persona language. The discipline lives in the docs; reviewer agents add **independent perspective + systematic checklist + context isolation**. We don't ship builder agents.
- **Auto-routed by Claude Code.** When a change matches an agent's description, Claude routes to it. You can also invoke explicitly via the `Agent` tool with the matching `subagent_type`.
- **End-of-task, not during construction.** Construction is the main session; the reviewer is the final gate.
- **Read-only by construction.** Tool restriction (Read/Grep/Bash/Glob, no Edit/Write) is enforced in the agent frontmatter. A reviewer that wants to "just fix this real quick" is the wrong shape — file a finding instead.
- **Cite the doc.** Every finding references the `§X.Y` section that establishes the rule. If the doc is silent, recommend documenting; don't invent rules.
- **PR template records invocations.** The PR template has a "Reviewer agents" section with a checkbox per agent. Empty when N/A; ticked when the agent ran and findings were addressed.

**Adding / removing / modifying agents:**

- The agent definitions are in `.claude/agents/<name>.md` with YAML frontmatter (`name`, `description`, `tools`).
- Description is the routing field — be specific about WHEN to invoke.
- If after a few phases an agent isn't pulling weight, delete the file. No commitment to maintain all five forever.
- New agent? PR + commit message explaining the failure mode it catches and why existing reviewers don't suffice.

## 4. Frontend design enforcement

UI work is held to a higher bar than functional correctness. The product's positioning depends on it.

### 4.1 The aesthetic is non-negotiable

The brand is **calm, considered, Aizome (Japanese indigo)**. AI tools default to bright, rounded, cheerful, emoji-heavy, exclamation-mark-friendly — that's the wrong product. A PR that ships AI-default UI will be reverted. Read `docs/design_system.md §1` (Principles) and §3 (Brand voice) before opening any UI work.

### 4.2 Reference apps to clear, in feel

Every UI judgment call should be checked against the bar:

- **Linear** — keyboard ergonomics, density without clutter
- **Granola** — quiet AI, in service to the user's text
- **Cron / Notion Calendar** — restrained colour, expressive type, polished motion
- **Raycast** — palette discipline, command vocabulary
- **Telegram (mobile)** — chat UI smoothness, scroll, tap targets

If your UI doesn't feel at home next to those, it's not done.

### 4.3 What's banned

These cause an immediate request-changes on PR review. Every item here is a known AI-default failure mode — the kind of thing code generators reach for by reflex.

**Visual / chrome:**

- Stock or AI-generated illustrations / hero images
- Neon or saturated colour outside the audit-point category palette (`docs/design_system.md §4`)
- Emoji or exclamation marks in product UI
- Generic shadcn defaults shipped as-is — every primitive must be styled to the Aizome palette before use
- Modals/popovers stacked on modals/popovers
- Loading states that are just a spinner — every loading state explains what's loading
- Hover-only affordances (everything must be visible by default; touch users have no hover)

**Motion** (full discipline in `docs/design_system.md §8`):

- Bouncy spring curves — off-brand, reads playful. Use `tween` + `ease-default` instead. Springs are forbidden.
- Parallax anywhere in product UI — the canonical AI-default move; expensive on mobile and reads as "look how clever I am." Out.
- Animations longer than 320 ms in product UI — if you need longer, you're trying to compensate for a slow load; fix the load instead.
- Animating layout properties (`width`, `height`, `top`, `left`, `padding`) — animate `transform` and `opacity` only. Layout animation triggers reflow and jank.
- Decorative micro-animations on every hover — motion encodes meaning, never decoration.

**Desktop ports of mobile patterns** (full discipline in `docs/design_system.md §11.2`):

- Bottom sheets on desktop — mobile pattern. Use a popover, modal, or slide-over.
- Hamburger menus as primary nav on desktop — the chat-list rail is always visible from `lg` upward.
- 44 px+ tap targets used everywhere on desktop — the mobile floor as the desktop default looks wasteful and unconfident. Use 32–36 px for compact desktop actions (icon buttons, table rows).
- Locking layouts to narrow widths "for breathing room" on wide screens — let the layout breathe to 1280 px+ with the documented multi-pane discipline.
- Mobile-only swipe gestures without keyboard / right-click equivalents — every swipe-archive must have both a button and a right-click menu equivalent.

### 4.4 Process for UI work

When implementing UI:

1. **Read the relevant `design_system.md` section** before writing any JSX.
2. **Use the `frontend-design` skill** if available in your tooling — it's tuned for distinctive, production-grade frontend output rather than generic AI aesthetics.
3. **Inject the design system context** into your reasoning. Concrete pixel values, named tokens, reference-app comparisons — not "make it look good."
4. **Build in Ladle stories first** — every bespoke component gets 4 stories minimum (default / loading / error / edge) per `docs/quality.md §3`. Stories are how you verify the design is right before wiring it up to real data.
5. **Take an actual screenshot** before declaring UI work done. Compare it side-by-side with the reference-app you're modelling against. If it doesn't hold up, iterate.
6. **Never** declare UI work done by typecheck + tests passing alone. Type checking and test suites verify code correctness, not feature correctness — if you can't actually test the UI in a browser, say so explicitly rather than claiming success.

### 4.5 The "screenshot-and-compare" loop

For every non-trivial UI change:

1. Implement.
2. Run `pnpm dev`, view the change in browser at multiple breakpoints (mobile + desktop).
3. Take a screenshot.
4. Open the corresponding reference-app screenshot or screen.
5. Compare. If it's not at the bar, iterate. Repeat.
6. Only then mark the task complete.

This loop is the difference between "the test passes" and "the design is right." AI tools that skip this loop ship UI that's correct but mediocre. Don't skip it.

## 5. Pre-flight checklist before opening a PR

Before a PR is reviewable:

- [ ] All quality gates pass locally (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`).
- [ ] If behaviour changed, the relevant `/docs/` sections are updated in the same PR.
- [ ] If a test changed, it was either (a) a unit/integration test you strengthened, or (b) an acceptance/e2e test authored by a human and noted in the PR body.
- [ ] If UI changed, you've verified it in a browser at mobile + desktop breakpoints; the screenshot holds up against the reference apps in `design_system.md §2`.
- [ ] If a new dependency was added, it's justified in the PR description (size, license, maintenance posture).
- [ ] Conventional-commit prefix on every commit; commit messages explain _why_.
- [ ] Pre-commit hooks ran clean (no `--no-verify`).

## 6. How this document evolves

This file is a working agreement, not project law. To change a rule:

1. Open a PR that updates this file.
2. Explain in the PR body what's changing and why.
3. Get human review.
4. Merge.

Adding a new rule has the same process. The bar for adding a rule is "this would have prevented a real bug or design regression we just hit, or one we're confident we'll hit soon." We don't add rules for hypotheticals.

To remove a rule, the bar is "we've found this rule no longer pulls its weight." Don't keep rules around for tradition.

## 7. Where to ask

For project-level decisions: open a PR or an issue. The founder reviews everything.

For routine code questions: the relevant `/docs/` section, then the existing code, then ask.

For AI-tool-specific questions about Claude Code: see `docs/quality.md §11` and the per-tool config (`.claude/`, `.cursorrules`, etc.).
