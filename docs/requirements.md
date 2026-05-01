# Requirements — Nuansu v1

## 1. Vision

Nuansu is a chat-shaped copilot for people writing messages across a language barrier. The user pastes (or in v2 receives) messages in a target language, types replies in their own language, and Nuansu produces a faithful, audit-able translation that preserves names, tone, and meaning. The defining principle is **anti-drift**: the LLM never silently rewrites the user's intent.

The product UX feels like a chat client with three differences:

1. Each message has a **target-language form** and a **source-language form**, with a toggle.
2. Outbound messages go through a **suggestion / accept / iterate panel** before being committed to the thread.
3. Each chat carries **per-chat preferences** (tone, nickname, naturalness slider, register defaults) that ride along with every translation request.

## 2. Target user (v1)

Primary persona — the founder profile:

- Adult non-speaker writing in a language they can't fully read.
- Uses messaging apps (LINE, Tinder, Pairs, KakaoTalk, WhatsApp, Telegram, Mercari chat, Etsy chat).
- Has tried ChatGPT/DeepL/Google Translate and is dissatisfied: too authorial, too literal, too inconsistent on register.
- Willing to pay $10–$15/month for a tool that saves 4 minutes per message and explains itself.

Secondary personas (kept in mind, not prioritised in v1 UI):

- Language-exchange partners (HelloTalk/Tandem refugees).
- Cross-border buyers/sellers on marketplace chat.
- Stans/fans replying to creator comments in the creator's language.

## 3. v1 scope

### In scope

1. Auth & onboarding (email magic link + Google + Apple + LINE Login OAuth).
2. Marketing landing page + waitlist capture, **bilingual EN + JP at launch**.
3. Chat shell — list of "chats" (each is a workspace for one conversation), per-chat preferences, message history.
4. **Inbound flow** — paste a message you received → see a literal translation, a natural translation, and a gloss explaining register and any culturally specific elements.
5. **Outbound flow** — type your message in your source language → Nuansu produces both literal and natural target-language candidates plus a list of _audit points_ (name handling, register choice, idiom adaptation) → user accepts, edits, or iterates → message commits to the chat thread.
6. **View toggles per thread** — show all messages in source language, all in target language, or both side-by-side. Toggle is non-destructive: every message stores both forms.
7. **Original recovery per message** — every committed outbound message keeps the user's original source-language draft and the pre-edit candidates; an explicit affordance lets the user open the raw history of any message.
8. **Global preferences** — language pair, default register, default naturalness, "names are sacred" toggle, "explain back in English" verbosity.
9. **Per-chat preferences** — overrides for tone, nickname for me, nickname for them, register, naturalness, custom notes the LLM should respect ("uses Kansai-ben", "no emoji", "she's my coworker").
10. **Account management** — profile, billing, data export, account deletion.
11. **Subscription billing** — free tier with daily quota, paid tier with higher/uncapped quota.
12. **Mobile-first responsive web app** — installable as a PWA. Same UI scales beautifully to desktop.

### Out of scope for v1 (roadmap)

These features were considered during planning and stay parked for v1:

- Voice message in/out, IRL date mode, sticker/emoji semantic translation.
- Cultural-footnote tappable inline `(?)` markers (basic explanatory gloss is in v1; the curated catalog is roadmap).
- Auto-flashcard / SRS export.
- Red-flag / scam classifier banner.
- Dialect-match generation (detect-and-flag is v1; matching is roadmap).
- Native iOS/Android apps and keyboard extension.
- BYO-API-key / E2E mode.
- Direct messaging-app integrations (no LINE, Tinder, Telegram OAuth).

`/docs/architecture.md` shows where these slot in without rework.

## 4. Glossary

| Term                   | Meaning                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Source language**    | The user's own language (input).                                                                                                      |
| **Target language**    | The language the conversation partner uses (output).                                                                                  |
| **Literal pass**       | A translation optimised for word-for-word fidelity, accepting some awkwardness.                                                       |
| **Natural pass**       | A translation that sounds native, accepting controlled deviation from literal.                                                        |
| **Gloss**              | A short English explanation of what was sent, why it was phrased that way, and what register it carries.                              |
| **Audit point**        | An item in the suggestions panel: a specific change Nuansu wants to make and the reason. The user accepts, rejects, or modifies each. |
| **Register**           | Politeness level. JP: casual / teineigo / sonkeigo / kenjougo. KR: banmal / jondaetmal.                                               |
| **Naturalness slider** | 0–100 dial controlling how aggressively the natural pass deviates from the literal. 0 = literal-safe; 100 = native-feel-risky.        |
| **Proper-name lock**   | A list of names/handles/places the LLM must reproduce verbatim and flag if it can't.                                                  |
| **Anti-drift**         | The product principle: never silently rewrite meaning. Always explain, always recover.                                                |

## 5. Functional requirements

Each numbered requirement gets a **definition of done (DoD)** that lists the acceptance criteria.

### 5.1 Authentication & onboarding

- **R1.** Users sign up with email + magic link or with Google / Apple / LINE OAuth.
- **R2.** First-run onboarding asks: source language, default target language, default register hint, agreement to TOS/Privacy.
- **R3.** Users can sign in across devices; sessions persist via httpOnly cookies; logout works.
- **R4.** Account deletion request is honoured within 30 days (compliance.md §3).
- **R4a. First-run experience — sample chat + just-in-time coachmarks.** On completing the onboarding form, the server creates a per-user **sample chat** ("Aiko (sample)" or locale-appropriate equivalent) pre-populated with three fixture messages that demonstrate the product's pillars in context: (1) an outbound bubble in dual-pane view with a name-preserved badge and tap-to-open version history; (2) an inbound card showing literal + natural + gloss + register read; (3) a fresh inbound that prompts the user to write their first reply. A thin top-of-chat banner labels it: "Sample chat — try replying to Aiko to see how Nuansu translates" with a [Use real chats →] dismiss action. Layered on top, a small set of **just-in-time coachmarks** fire on first encounter with specific affordances: (a) `composer_first_translate` — explains the literal / natural split when streaming first completes; (b) `audit_points_first` — explains accept/reject when the first audit point appears; (c) `view_toggle_first` — explains source/target/both modes when the toggle is first visible; (d) `refine_first` — explains the refine box when iterating state is first entered. Coachmark dismissals persist server-side via `users.onboarding_state` so they don't repeat across devices. **Strict discipline:** at most one coachmark visible at any time; never on a return visit; max one fixture chat per user.

**DoD R1–R4a:** A new user can complete signup → onboarding → land in the sample chat in under 60 seconds, and reach a successful first translation in the sample chat in under 90 seconds without consulting external help. The sample chat displays correctly in both EN and JP source locales. Coachmarks fire exactly once per user across all sessions and devices. The user can dismiss the sample chat in one tap and reach a real empty chat list. Logging out and back in preserves all preferences and the dismissed-coachmark set. Account deletion request is honoured within 30 days.

### 5.2 Landing page & marketing

- **R5.** Public landing page at `/[locale]/` (default `en`, also `ja`) describes the product in broad terms (see compliance.md §4 for language constraints), shows the core flow with one looping demo, takes a waitlist email when signups are gated. A locale switch sits in the header; user-agent language hints prefill but a manual choice persists.
- **R6.** Pricing page lists tiers, quota limits, supported language pairs, and what's included. **v1 pricing is USD-only — Free and Pro $12/month.** Stripe Tax handles JP consumption tax (10%) and FX conversion at checkout; the JP user sees the converted amount on the Stripe checkout screen.

**DoD:** Lighthouse mobile score ≥ 90 across Performance, Accessibility, Best Practices, SEO on both `en` and `ja` locales. Landing page LCP ≤ 2.5s on 4G.

### 5.3 Chat shell

- **R7.** Users see a left rail (or top tab on mobile) listing chats; clicking enters that chat.
- **R8.** Each chat has: a name, an optional avatar/colour, a target language, per-chat preferences, and an ordered list of messages.
- **R9.** Users can create, rename, archive, and delete chats.
- **R10.** Messages are visually distinguished by author: **mine** vs **theirs**. Both columns share the same bubble shape with reversed alignment and colour.

**DoD:** Creating a chat → typing the first outbound message → it lands in the thread takes ≤ 5 taps on mobile. Up to 10,000 messages per chat scroll smoothly with virtualisation.

### 5.4 Per-chat & global preferences

- **R11.** Global preferences (Settings) include: source language, default target language, default register, default naturalness, name-lock list (global), explain-back verbosity (terse / standard / verbose), preferred translation model tier.
- **R12.** Per-chat preferences override globals: target language, register, naturalness, contact's nickname for me, contact's name in source script, contact's name in target script, freeform "Notes the assistant should respect" textarea.
- **R13.** Preferences are visible from the chat header in a slide-over panel; changes apply to _future_ messages only — already-committed messages are immutable.
- **R13a. In-flow preference drift detection.** The translator emits suggestions when it sees evidence that a preference is stale — name reveals ("実は美咲です"), nickname offers ("call me Lu"), sustained register shifts (-san dropping), or post-hiatus context updates. Suggestions surface inline in the chat (high-confidence) or in a chat-header badge (medium-confidence). The user always confirms — the system never auto-applies. Confirmation actions are **Apply** (update the field), **Keep both** (additive name-lock without replacing canonical), or **Dismiss** (suppress the same suggestion for 30 days). Name updates are always additive: applying a canonical-name change auto-preserves the prior name as a name-lock so historical messages still resolve. A complementary **compose-time hint** (client-side regex over the user's outbound draft against the chat's name_locks) flags use of a prior canonical name and offers a one-tap rewrite — no LLM call needed for this layer. Detection contract in [`back_end_architecture.md §5.4`](./back_end_architecture.md).

**DoD:** User can set "Aiko: Kansai-ben, naturalness 70, no emoji, she calls me Lu" once and every subsequent outbound carries that context without re-entry. When the contact later introduces a different name mid-chat, the user sees a single inline suggestion card under the triggering message; one tap updates the chat preferences and adds the new name to the lock list while preserving the prior name. When the user types an outbound that mentions the prior canonical name, the composer surfaces a soft "Did you mean [new name]?" hint with one-tap rewrite.

### 5.5 Inbound translation flow

- **R14.** A "Paste a message" affordance accepts text the user received.
- **R15.** Nuansu produces a structured response: literal translation, natural translation, gloss (1–3 lines), register read, dialect flag (if any), proper-name observations.
- **R16.** The pasted message is stored in the thread as a "theirs" message with both forms (target-original + source-translation).
- **R17.** Latency target: first token ≤ 1s; full structured output ≤ 6s.

**DoD:** Pasting a typical 80-character JP sentence yields a complete inbound card with literal + natural + gloss + register badge in under 6 seconds at p95. The user sees the literal pass first while the natural and gloss stream in.

### 5.6 Outbound composition flow

This is the centrepiece. The flow has four states:

1. **Drafting** — user types in source language. A floating panel shows live token count and current preferences.
2. **Generating** — on tap of "Translate" (or auto-trigger after a pause + length threshold), Nuansu streams the literal candidate, then the natural candidate, then a list of audit points.
3. **Iterating** — user accepts the literal, accepts the natural, edits either inline, or types a follow-up instruction in a "refine" box ("more casual", "use her nickname Lu instead of ルー", "drop the apology"). Each refinement preserves the prior version in history.
4. **Committed** — user picks one (or accepts the user's own edit) and posts to the thread. The committed message stores: original source draft, all candidate versions, audit points and which were accepted, the chosen final target text, and the chosen final source-translation.

- **R18.** Audit points are presented as a list: "I changed _X_ to _Y_ because…", each independently accept/reject-able.
- **R19.** When the user edits the target text manually, Nuansu **does not** silently rewrite the source draft to match. It can offer to update the source-side gloss, but that's an explicit action.
- **R20.** When the user edits the source draft, Nuansu re-runs the candidates from the new draft.
- **R21.** The user can open any committed message and see all its history (raw draft, pre-edit candidates, audit points, final).

**DoD:** A typical 2-sentence outbound translation completes (literal + natural + audit points + at least 2 named-entity preservations + 1 register read) in ≤ 8s at p95. The user can accept-as-is in 1 tap; iterate with a refine instruction in ≤ 3 taps.

### 5.7 View toggles & original recovery

- **R22.** A per-thread toggle switches the entire view between _target-language only_, _source-language only_, and _side-by-side_.
- **R23.** A per-message affordance opens history: original draft → candidates → audit points → final, top to bottom.
- **R24.** Toggles are persistent per chat, scoped per device.
- **R24a. Copy is a first-class affordance on every message bubble.** Each bubble exposes an always-visible trailing icon group: a primary `copy` icon, a `caret` that opens a copy-variants menu, and the existing `history` icon. **One-tap on the copy icon copies the natural target text** (the thing the user came here to send) regardless of the current view-toggle state — the toggle changes what's _displayed_, not what's _copied_. The caret menu offers context-aware variants: for outbound messages, _Copy translation_ / _Copy source_ / _Copy both_; for inbound messages, _Copy original_ / _Copy translation_ / _Copy both_. "Copy both" produces a fixed bilingual format (`source\n\ntarget`). On mobile, long-press on the bubble opens the same menu as the caret (redundant convenience, not the discoverable primary path); on desktop, right-click does the same. Keyboard: Enter on a focused bubble copies the natural target; Shift+Enter opens the menu; Cmd/Ctrl+C on a focused bubble also copies the natural target. Confirmation surfaces as a subtle "Copied" toast plus a light haptic on mouse + touch platforms that support it.

**DoD:** Toggling does not refetch; both forms are already on the client. Switching is instant (< 100ms) and preserves scroll position. Tapping the copy icon on any bubble — outbound or inbound, in any view-toggle state — places the natural target text in the system clipboard within 100 ms and surfaces a confirmation toast. The copy-variants menu is reachable via caret, long-press (mobile), right-click (desktop), and keyboard (Shift+Enter on focused bubble), all four paths yielding the same menu options.

### 5.8 Quotas & billing

- **R25.** Free tier: **10 translations / 24 hours**, rolling window. Configurable via feature flag.
- **R26.** Paid tier (Pro): functionally uncapped with a **1,000/day soft cap** for abuse detection.
- **R27.** Billing via Stripe — **single USD price: Pro at $12/month**. No annual plan at v1. Users self-serve upgrade, downgrade, payment-method update, cancel, and view invoices via Stripe Customer Portal. New users get a **14-day no-card Pro trial** that downgrades to Free if no card is added.
- **R28.** Usage UI shows today's quota and the rolling-window reset time.

**DoD:** Hitting quota produces a clear, non-blocking notice with an Upgrade CTA. Rolling-24h reset is computed off the user's earliest in-window translation, not a clock boundary.

### 5.9 Data export & deletion

- **R29.** Settings exposes "Export my data" → JSON archive of profile + preferences + chats + messages, delivered via email link within 24 hours.
- **R30.** Settings exposes "Delete my account" with a two-step confirmation; on completion, account is soft-deleted within 24 hours and hard-purged within 30 days.

**DoD:** Both actions are tested end-to-end. The export includes every message in both forms.

## 6. Non-functional requirements

### 6.1 Performance

- First Contentful Paint ≤ 1.5s on 4G mobile for the app shell.
- p95 outbound translation total time ≤ 8s.
- p50 outbound translation first-token ≤ 1.2s.
- Streaming responses; no blocking spinners over 1s without progress feedback.

### 6.2 Mobile-first

- Designed at iPhone 13/14 viewport first; tested on Android mid-range; scales to iPad and desktop.
- Touch targets ≥ 44pt; no hover-only affordances.
- Installable PWA with offline shell and a "you're offline" banner — outbound translation requires network.

### 6.3 Accessibility

- WCAG 2.2 AA conformance.
- Full keyboard navigation; visible focus rings; semantic landmarks; live regions for streaming output.
- Screen-reader-friendly chat: each message announces author and language; toggles announce state changes.

### 6.4 Reliability

- 99.5% monthly availability target for v1.
- LLM provider outages degrade gracefully: a queued state, a clear error, and a retry option.
- All writes are durable before UI says "sent".

### 6.5 Security & privacy

- All committed messages encrypted at rest at the field level (see security.md §4).
- TLS in transit, HSTS, secure cookies.
- No training on user data: contractual with LLM provider.
- Access to a chat is restricted to its owner; no sharing in v1.

### 6.6 Internationalisation (UI)

- v1 **app UI** shipped in **English** only.
- v1 **marketing pages** ship bilingual: **English (default) + Japanese** at launch, served from `/[locale]/...` routes.
- All copy externalised behind an i18n layer so future languages are a translation pass.
- The _target language_ (the language the user is translating into) is independent of UI/marketing locale.

### 6.7 Polish bar

- Match the design fluency of Linear, Granola, Cron, Raycast — the bar is fast, quiet, and confident, not flashy.
- Detail-level work: skeleton loaders, optimistic updates, micro-interactions, motion under 250ms, haptic-feeling transitions on mobile.

## 7. Happy paths

### 7.1 New user → first translated message

1. User lands on `/`, sees demo, taps **Sign up**.
2. Creates account, completes onboarding (source: English, target: Japanese, casual default).
3. Lands on empty Chats screen with a **Create chat** primary action.
4. Creates a chat named "Aiko", target Japanese.
5. Pastes a JP message Aiko sent. Sees literal + natural + gloss; learns it's casual + Kansai-hint.
6. Taps **Reply**. Types "thanks, can we meet Saturday at the station near your place?"
7. Sees streaming literal + natural candidates + 3 audit points (named entity preservation: "Saturday" left literal, station-vague vs. specific, casual register chosen).
8. Accepts, with one inline edit (changes "your place" → "yours" because the audit point flagged ambiguity).
9. Posts. Message lands in thread bubble-style, shows JP form by default; tap toggles to EN form.
10. Switches whole-thread toggle to JP-only to copy and paste into LINE.

### 7.2 Returning user mid-conversation

1. User opens app on phone, sees recent chats with last-message preview.
2. Taps Aiko. Pastes new inbound. Skim-reads natural + gloss.
3. Taps reply, drafts a one-liner. Hits Send (auto-translate). Audit panel shows 1 point (uses 「ね」 sentence-ending). Accepts.
4. Posts in 9 seconds total.

### 7.3 Iteration with refinement

1. User pastes a message from a coworker, target Japanese, register set to teineigo.
2. Drafts an English reply.
3. Receives candidates that feel off. Types in refine box: "more apologetic, formal — this is to my boss's boss."
4. Receives revised candidates with register flipped to sonkeigo. Audit point explains the shift.
5. Accepts.

## 8. Edge cases & failure modes

| Scenario                                                | Behaviour                                                                                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM outage / 5xx                                        | Banner: "Translation service unavailable, retrying." Drafts are preserved locally. Manual retry button.                                            |
| Network drops mid-stream                                | Partial output is preserved. Banner: "Connection lost." Tap to resume.                                                                             |
| User pastes 10,000-character text                       | Hard cap at 4,000 characters per message v1; soft warning at 2,000.                                                                                |
| Mixed-language input (e.g., EN sentence with a JP name) | Treat as source = primary language inferred from majority script; preserve the JP token verbatim.                                                  |
| Source language differs from configured global          | Detect and prompt: "Looks like Spanish, not English — translate from Spanish?"                                                                     |
| Target language has no good register equivalent         | Fall back to closest mapping; gloss explains the limitation.                                                                                       |
| Proper-name lock fails (LLM ignored a locked name)      | Pipeline runs a post-check (target text contains all locked entries verbatim); if not, regenerates once and flags persistent failures to the user. |
| Off-policy / unsafe content                             | Standard provider safety filter; clear error to user; do not store content that the provider refused.                                              |
| Quota exhausted mid-iteration                           | Show banner with quota state, allow user to finish current iteration (already paid) but block new translations until upgrade or reset.             |
| User deletes a chat with unsynced edits                 | Show local-modifications-pending warning before destructive action.                                                                                |
| Voice / unsupported input pasted                        | "Looks like you pasted a link / file. Paste plain text only in v1."                                                                                |
| LLM returns invalid JSON                                | Auto-retry once with a stricter system prompt; on second failure show a generic "couldn't parse — try simpler input" error.                        |
| Concurrent device edits to preferences                  | Last-write-wins with a "preferences updated on another device" banner.                                                                             |
| User in EU expects EU data residency                    | v1: only EU LLM hosting if Anthropic offers it; commit to EU-hosted DB region for EU sign-ups (see compliance.md §1).                              |
| User account hacked                                     | Session revocation, password/magic-link rotation, audit log accessible to user.                                                                    |

## 9. Acceptance criteria for v1 launch

The "release MVP to closed beta of 10 users" gate:

- [ ] All R1–R30 implemented and passing manual QA.
- [ ] Founder dogfoods for 7 consecutive days, sends ≥ 50 outbound messages.
- [ ] Reply time per message dropped to a median ≤ 90 seconds.
- [ ] No `P0` bugs open. No `P1` bugs older than 5 days.
- [ ] Lighthouse mobile ≥ 90 across the four scores on landing + app shell.
- [ ] Stripe live-mode checkout works for one paying tester.
- [ ] Data export round-trip verified.
- [ ] Account deletion verified.
- [ ] Privacy policy + terms reviewed by legal counsel — **JP-language versions reviewed by JP-qualified counsel** (APPI + consumer protection).
- [ ] Security review passed (security.md §10 checklist).
- [ ] Anthropic DPA + zero-retention agreement signed.
- [ ] Backups tested by restoring a snapshot to staging.
- [ ] LINE Login QA: signup → onboarding → session restore on web and PWA.
- [ ] `support-jp@` and `privacy-jp@` mailboxes provisioned with JP-language acknowledgement template.
- [ ] Bilingual marketing copy (EN + JP) reviewed end-to-end; locale switch tested.
- [ ] Stripe live-mode checkout verified for JP card (Visa/MC), Apple Pay, Google Pay; consumption tax line item visible.

## 10. Success metrics post-launch

Tracked in PostHog (or equivalent — see questions.md):

- **Activation:** % of signups who send ≥ 1 outbound message within 7 days.
- **Retention:** week-2 / week-4 / month-2 retention.
- **Messages per active user per day** (proxy for value).
- **Iteration count per message** (high count = LLM not getting it right; investigate).
- **Audit-point acceptance rate** (low = noise; high = useful suggestions).
- **Free → paid conversion at day 14**.
- **NPS / "would you be very disappointed without Nuansu?"** at day 30.

## 11. References

- [`./architecture.md`](./architecture.md) — system shape that satisfies these requirements.
- [`./compliance.md`](./compliance.md) — legal and positioning constraints that bound the product copy and data practices referenced above.
