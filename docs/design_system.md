# Design System — Nuansu v1

This doc sets the design language and component patterns. It pairs with `front_end_architecture.md` (technical implementation) and `requirements.md` (what the UI must enable).

## 1. Principles

1. **Calm, never chatty.** The app handles intimate communication; a yelling UI feels invasive. Default volume is low. Flourish lives in motion, not in colour or copy.
2. **Audit over magic.** Every AI suggestion is shown, sourced, and dismissable. We never hide what the model did.
3. **Two languages, one moment.** When both languages are visible, the layout makes them peers — not a primary with a translation appended.
4. **Mobile-first, but desktop is a pleasure.** Density and information increase on desktop; structure stays the same so muscle memory transfers.
5. **Quiet feedback.** State changes prefer subtle motion and inline indicators over toasts and modals.

## 2. Reference apps

The bar to clear, in feel:

- **Linear** — keyboard ergonomics, density without clutter.
- **Granola** — quiet AI; the AI is in service to the user's text, not the other way around.
- **Cron / Notion Calendar** — restrained colour, expressive type, polished motion.
- **Raycast** — palette, command vocabulary, the way it surfaces options without overtaking the screen.
- **Telegram** (mobile) — the bar for a chat UI's smoothness, scroll, and tap targets.

## 3. Brand voice

- **Name.** Nuansu. Pronounced "noo-an-soo". A Japanese loanword for "nuance" (ニュアンス) — the product's reason to exist.
- **Tagline candidates** (broad-positioning per `compliance.md` §4):
  - _"Translate messages without losing the message."_
  - _"Faithful translation for personal conversations."_
  - _"The AI that asks before it changes your meaning."_
- **Tone of copy.** Plain, declarative, second-person. No emoji in product UI. No exclamation marks. No "Awesome!" or "Oh no!". Errors say what's wrong and what to do.
- **Language inclusivity.** The marketing copy never assumes who you're talking to. "Your messages" not "their messages"; "the conversation" not "the chat with your match".

## 4. Color

A two-axis system — neutral-heavy with one accent — keeps the visual focus on the text content (which is the actual product).

### 4.1 Direction — Aizome (Japanese indigo)

The accent is a **muted, deep indigo-blue** drawn from _aizome_ (藍染め — traditional Japanese indigo dye). Three reasons:

1. **It connects to JP culture without being kitsch.** No torii-gate red, no kanji-as-decoration. The colour is recognisably Japanese to JP users (yukata indigo, noren cloth) and reads as _quietly editorial_ to non-JP users.
2. **It sits next to bilingual text without competing.** The product shows EN and JP side-by-side; a saturated tech-blue or warm orange would fight the text. A muted blue recedes the way good ink recedes on paper.
3. **It differentiates from the field.** Most translation/AI tools default to electric blue (DeepL, Google) or red (Papago). Aizome reads more like a literary tool — closer to Granola or Things — which fits the anti-drift / audit / control brand.

Audit-point category colours sit on top: **teal** for name-locks (a "pinned" feel), **violet** for register shifts, **amber** for tone/idiom adaptations, **softer blue** for ambiguity flags. Each carries an icon shape too — colour alone never encodes meaning (a11y).

### 4.2 Light & dark

Both modes ship in v1, system-default on first load, user-overridable in settings. Dark mode is **rich charcoal, not pure black** — it reads less harsh, especially with mixed-script content where pure black + white can shimmer.

### 4.3 Tokens

Token names map to semantic roles, not hex codes. Implementation values can be tuned without renaming.

```
Surface        bg, bg-elevated, bg-sunken
Text           text-primary, text-secondary, text-muted, text-on-accent
Border         border-subtle, border-strong
Accent         accent (primary), accent-hover, accent-quiet
Author         author-mine-bg, author-mine-text, author-theirs-bg, author-theirs-text
Status         info, success, warn, danger
Audit          audit-name, audit-register, audit-tone, audit-ambiguity
```

### 4.4 Light mode values

| Role                 | Value     | Notes                                                            |
| -------------------- | --------- | ---------------------------------------------------------------- |
| `bg`                 | `#FAFAF7` | Warm off-white — washi-paper feel; less clinical than `#FFFFFF`. |
| `bg-elevated`        | `#FFFFFF` | Cards, modals, message bubbles.                                  |
| `bg-sunken`          | `#F2F4F7` | Settings panels, secondary surfaces.                             |
| `border-subtle`      | `#E5E7EB` | Default divider.                                                 |
| `border-strong`      | `#CDD2D8` | Card borders, focused-input.                                     |
| `text-primary`       | `#0E1116` | Near-black with a hint of warmth (not pure `#000`).              |
| `text-secondary`     | `#4A5260` | Meta lines, timestamps.                                          |
| `text-muted`         | `#6B7280` | Hints, placeholders.                                             |
| `text-on-accent`     | `#FFFFFF` | Text on accent fills.                                            |
| `accent`             | `#3D5A80` | Aizome — the brand colour.                                       |
| `accent-hover`       | `#2E4566` | One step deeper.                                                 |
| `accent-quiet`       | `#EAEEF4` | Tinted background for accent surfaces (banners, selected rows).  |
| `author-mine-bg`     | `#3D5A80` | Solid accent fill for own messages.                              |
| `author-mine-text`   | `#FFFFFF` |                                                                  |
| `author-theirs-bg`   | `#F2F4F7` | Cool light grey for other-party messages.                        |
| `author-theirs-text` | `#0E1116` |                                                                  |
| `audit-name`         | `#0E7C7B` | Teal — "pinned" feel for proper-name locks.                      |
| `audit-register`     | `#7C5CB8` | Violet — politeness shifts.                                      |
| `audit-tone`         | `#C97A2E` | Amber — naturalness / idiom adaptations.                         |
| `audit-ambiguity`    | `#4D6E96` | Lighter aizome — uncertainty flags.                              |
| `info`               | `#3D5A80` | Same as accent.                                                  |
| `success`            | `#0E7C5C` | Subdued green.                                                   |
| `warn`               | `#C97A2E` | Same as `audit-tone`.                                            |
| `danger`             | `#C8423B` | Considered, not loud.                                            |

### 4.5 Dark mode values

| Role               | Value     | Notes                               |
| ------------------ | --------- | ----------------------------------- |
| `bg`               | `#0F1115` | Rich charcoal, not pure black.      |
| `bg-elevated`      | `#181B22` | One step up.                        |
| `bg-sunken`        | `#0A0C10` | One step down.                      |
| `border-subtle`    | `#262A33` |                                     |
| `border-strong`    | `#3A3F4B` |                                     |
| `text-primary`     | `#E7EAEF` | Off-white, not pure `#FFF`.         |
| `text-secondary`   | `#9AA1AD` |                                     |
| `text-muted`       | `#6B7280` |                                     |
| `text-on-accent`   | `#FFFFFF` |                                     |
| `accent`           | `#5C7AA8` | Aizome lifted for dark-bg contrast. |
| `accent-hover`     | `#7090BC` |                                     |
| `accent-quiet`     | `#1B2333` | Tinted dark surface.                |
| `author-mine-bg`   | `#5C7AA8` |                                     |
| `author-theirs-bg` | `#1F232C` |                                     |
| `audit-name`       | `#1FA9A4` |                                     |
| `audit-register`   | `#9F84D4` |                                     |
| `audit-tone`       | `#D8985B` |                                     |
| `audit-ambiguity`  | `#7090BC` |                                     |
| `success`          | `#3CAA86` |                                     |
| `warn`             | `#D8985B` |                                     |
| `danger`           | `#E26E68` |                                     |

All text/background pairs are verified WCAG 2.2 AA at body-text size, AAA at heading sizes.

### 4.6 Discipline

- Do not introduce a new colour without retiring one or assigning it a token.
- Never colour-code by language (no "JP is red, EN is blue") — colour is reserved for _roles_, not content.
- Audit-point colours always pair with an icon shape; never colour alone.
- The accent is the _only_ saturated colour on the page in steady state — status colours appear briefly during interactions, audit colours only inside the audit list. Everything else is neutral.

## 5. Typography

### 5.1 Stacks

- **UI sans:** Inter (variable). Tabular numerals enabled in stats.
- **Japanese:** Noto Sans JP (variable). Falls back gracefully to system "Hiragino Sans" / "Yu Gothic UI".
- **Korean:** Pretendard. Falls back to "Apple SD Gothic Neo" / "Malgun Gothic".
- **Chinese (roadmap):** Noto Sans SC / TC.
- **Mono (rare — only for code-like display in audit details):** JetBrains Mono.

### 5.2 Mixed-script rules

When a target-language string sits next to source-language English, both must remain legible at the same optical size. Implementation: a `lang="ja"` (or appropriate) attribute triggers a CSS `font-family` override that pulls in the script-appropriate fallback. Line-height bumps to 1.6 for CJK; 1.5 for Latin.

### 5.3 Scale

A 1.125 ratio scale, 8 steps:

| Token          | Size | Use                        |
| -------------- | ---- | -------------------------- |
| `text-xs`      | 12px | Meta, labels               |
| `text-sm`      | 14px | Secondary body, controls   |
| `text-base`    | 16px | Default body, message text |
| `text-md`      | 18px | Emphasised body            |
| `text-lg`      | 20px | Card titles                |
| `text-xl`      | 24px | Section heads              |
| `text-2xl`     | 30px | Page titles                |
| `text-display` | 48px | Marketing hero only        |

Message text in chat bubbles is `text-base` minimum; bumps to `text-md` on desktop where space allows.

## 6. Spacing & layout

### 6.1 Grid

8-pt grid; 4-pt for fine-tuning. All spacing tokens are multiples of 4.

### 6.2 Layouts

- **Marketing pages.** Single 1200px container max-width, generous vertical rhythm, alternating sections.
- **App shell.**
  - Mobile: a bottom-tab nav (Chats / Settings) with a top app bar inside the chat view.
  - Tablet/desktop: a left rail (chat list, 280–320px), a chat panel, an optional right rail (chat preferences slide-over, hidden by default).
- **Chat panel.**
  - Top: chat header with name, target language flag (de-emphasised), preferences toggle.
  - Middle: virtualised message list. Bubbles align right (mine) / left (theirs). Each bubble has a small footer with timestamp and a tappable menu.
  - Bottom: composer dock — a multi-line input on top, a one-line action row beneath (Translate primary CTA, mode toggle, attach disabled in v1).

### 6.3 Breakpoints

```
sm: 640px   md: 768px   lg: 1024px   xl: 1280px   2xl: 1536px
```

Design starts at 375px (iPhone 13 mini width) and scales up. Single-column under `md`. Two-column from `lg`.

## 7. Components

These are the building blocks. Each gets a small story file in development.

### 7.1 MessageBubble

Two variants: `mine` (right-aligned, accent fill) and `theirs` (left-aligned, neutral fill). Each carries:

- Primary text in the _currently displayed_ language.
- A "translation glyph" (subtle ⇄) to flip just this bubble.
- A meta footer: timestamp, register badge if relevant, and a trailing **action icon trio**.

**Trailing action icon trio.** Three small monochrome icons (16 px) in `text-tertiary`, 8 px gap between them, sitting at the trailing edge of the meta footer. Always visible on both mobile and desktop — no hover-reveal — because copy is the product's exit action and is too important to hide.

| Icon          | Default behaviour                                                                     |
| ------------- | ------------------------------------------------------------------------------------- |
| `copy` (📋)   | One-tap: copy the **natural target text** to clipboard. Confirmation toast + haptic.  |
| `caret` (⌄)   | Tap: open the copy-variants popover (see below).                                      |
| `history` (⏱) | Tap: open the message history drawer (raw draft → candidates → audit points → final). |

All three are real `<button>` elements with descriptive aria-labels (`aria-label="Copy translation"`, etc.). On focus, icon colour shifts to `text-secondary` with a 2 px outer ring in `accent-subtle`.

**Copy-variants popover.** Opened by the caret, by long-press on the bubble (mobile), by right-click (desktop), or by Shift+Enter on a focused bubble. Small popover anchored to the caret with a 4 px caret-glyph, 8 px radius, `surface-2` background, `border-subtle`, `shadow-popover` elevation. Three menu items, context-aware:

| Bubble direction | Menu items                                         |
| ---------------- | -------------------------------------------------- |
| Outbound (mine)  | _Copy translation_ · _Copy source_ · _Copy both_   |
| Inbound (theirs) | _Copy original_ · _Copy translation_ · _Copy both_ |

"Copy both" produces a fixed bilingual format: `source\n\ntarget`. No configuration knob in v1.

**Confirmation toast.** "Copied" appears bottom-centred for 1.5 s (shorter than the standard 3 s — copy is high-frequency and the toast shouldn't accumulate). Haptic: light tap on iOS/Android via the Vibration API where supported. Desktop has no haptic.

**Long-press behaviour on mobile.** The bubble container uses `user-select: none` to suppress the native iOS text-selection menu on long-press; long-press fires our copy-variants popover instead. A "Select text" menu item inside the popover toggles `user-select: text` on the bubble for the user who explicitly wants to drag-select.

**Keyboard.** Bubbles are focusable (`tabindex="0"`). On focus: Enter copies the natural target; Shift+Enter opens the variants popover; Cmd/Ctrl+C also copies the natural target.

### 7.2 Composer

Three states: idle, drafting, generating, iterating, committing.

- Idle: empty multi-line input with a placeholder like "Write your message".
- Drafting: shows live token count when above 200 characters.
- Generating: candidates panel slides in below the composer; literal first, natural second, audit points third. The original draft remains visible above for reference.
- Iterating: candidates remain interactive; a _refine instruction_ input appears below ("more casual", "use her name Lu"). Audit points are checkable.
- Committing: brief skeleton-shimmer on the draft as it animates into the chat list.

### 7.3 CandidatePanel

A two-card stack inside the composer.

```
┌─ Literal ────────────────────────┐
│  土曜日に会えますか？            │
│  ⓘ Word-for-word — formal "ます" │
│  [Use this]   [Edit]             │
└──────────────────────────────────┘
┌─ Natural ────────────────────────┐
│  土曜どう？                       │
│  ⓘ Casual short form — fits Aiko │
│  [Use this]   [Edit]             │
└──────────────────────────────────┘
```

Both can stream in; the `Use this` button is disabled until streaming completes.

### 7.4 AuditPointList

A list. Each row has an icon (category), a brief explanation, and accept/reject buttons. Accepted points are visually subdued; rejected points are dimmed. The list is scrollable and never wider than the candidate panel.

### 7.5 ViewToggle (per chat)

A three-way segmented control: `Source` / `Both` / `Target`. Lives in the chat header. Persists per chat per device.

### 7.6 PreferencesPanel (per chat)

A right-slide-over (mobile: bottom-sheet). Sections: Names & nicknames, Register & tone, Naturalness slider, Notes. Live-validate; save on blur, not on close.

### 7.7 OAuth provider buttons

The signup / sign-in screen shows four entry points stacked: **email magic link**, **Google**, **Apple**, **LINE**. Buttons share our token system (filled border, neutral background, brand glyph in colour). LINE's brand green is used only for the glyph, not the whole button — keeps the row visually balanced. Order on JP locale leads with LINE; on EN locale leads with email.

### 7.8 SuggestionCard

In-flow surface for preference drift suggestions emitted by the translator (see `back_end_architecture.md §5.4`). Renders inline beneath the triggering message bubble for `high`-confidence suggestions; medium/low live in the chat-header badge panel.

**Anatomy:**

- Leading icon: a small `⊕` (additive change) or `↻` (replacement) glyph in `text-secondary`. Icon shape carries category meaning, never colour-only.
- One-line `reasoning` headline ("She introduced a different name", "Both of you have moved to casual register") in `text-primary` 14 px medium.
- A secondary line showing the change as `from → to`, with a thin `text-tertiary` evidence excerpt below in 13 px (the snippet from the triggering message).
- Three actions, equal visual weight, never two: **Apply** (primary outline button), **Keep both** (ghost button — only enabled for name-related categories), **Not now** (ghost button, `text-tertiary`).

**Surface:**

- Background `surface-2` (one step above the message thread background), 1 px `border-subtle`, 12 px radius (matches MessageBubble), 12 px padding.
- Inset 32 px from the bubble's source-side edge so it visually attaches to the triggering message but doesn't take its full width.
- Max 2 lines of reasoning + 2 lines of excerpt; truncate with ellipsis. Long excerpts open a tooltip on hover/long-press.

**Behaviour:**

- Enters with a 180 ms fade + 4 px upward slide; respects `prefers-reduced-motion` (fade only).
- On action tap: optimistic collapse with 120 ms height-out, then a confirmation toast ("Updated to Misaki", "Kept both names", "Dismissed").
- Dismiss is silent (no toast — the user said "not now" and doesn't want noise).
- Never two cards stacked under the same bubble — server enforces one suggestion per call.

**A11y:**

- Card is `role="region"` with `aria-label="Preference suggestion"`.
- The three action buttons are real `<button>` elements with descriptive labels (`aria-label="Apply: change Aiko to Misaki"`).
- Keyboard: Tab cycles through the three actions; Enter activates; Escape dismisses (equivalent to "Not now").

### 7.9 ComposeHint

Soft inline surface below the composer input when the user types a draft mentioning a now-stale canonical name. Pure client-side (regex over the chat's `name_locks` flagged `prior_canonical: true`). See `front_end_architecture.md §6.2`.

- One line: "Did you mean **{new_name}**?" (the new name in `text-primary` semibold; the rest in `text-secondary`).
- Trailing affordance: an inline button **Use {new_name}** (text-only, primary colour). One tap rewrites the matched substring in the draft buffer.
- Trailing close `×` to dismiss for the rest of the chat session.
- Background `surface-1` with a 1 px `border-subtle` left edge as an attached strip; no full card chrome — this is a hint, not a card.
- Enter/exit: 120 ms fade. No slide.

### 7.10 Coachmark

Just-in-time tooltip that fires on first encounter with a specific affordance (e.g., the literal/natural split, audit points, view toggle, refine box). See `requirements.md §5.1` R4a and `front_end_architecture.md §6.3`. Strict discipline: at most one visible at any moment; never on a return visit; persisted server-side.

**Anatomy:**

- Small directional callout: a 4 × 4 px caret pointing at the anchor element, plus a rounded card body 280 px wide on mobile, 320 px on desktop.
- One-line headline in 14 px medium (`text-primary`) — the _what_ ("Two passes: literal and natural").
- One or two lines of body in 13 px (`text-secondary`) — the _why_ ("Literal stays close to your source; natural reads as a native speaker would say it.").
- One trailing dismiss affordance: text button `Got it` in `text-primary` medium. No `×` icon — coachmarks are intentionally one-action.

**Surface:**

- Background `surface-2` with 1 px `border-subtle`, 8 px radius (smaller than message bubbles — coachmarks are auxiliary), 12 px padding.
- Soft drop shadow at elevation token `shadow-popover` (lighter than dialogs, heavier than cards).
- Caret picks up the same `border-subtle` edge so it reads as a continuous shape.

**Placement:**

- Anchored to the relevant UI element with 8 px offset. Direction (above / below / left / right) chosen at runtime based on viewport space; never overlap the anchor.
- On mobile, prefer below-anchor with full-width inset of 16 px from screen edges.

**Behaviour:**

- Enters with 180 ms fade + 4 px slide from the anchor direction; respects `prefers-reduced-motion` (fade only).
- `Got it` calls the dismiss API (idempotent), optimistically updates the cache, and exits with 120 ms fade.
- Tapping outside the coachmark does **not** dismiss it — coachmarks are intentional, the user must acknowledge by reading and tapping. (Exception: pressing Escape dismisses, for keyboard parity.)
- Anchor element retains a subtle 2 px outer ring in `accent-subtle` while the coachmark is active, so the eye is led from copy to target.

**A11y:**

- Coachmark is `role="tooltip"` with `aria-live="polite"`; the anchor element gets `aria-describedby` pointing at the coachmark id.
- Focus is **not** stolen — coachmarks must not interrupt typing or other in-progress actions.
- Keyboard: Escape dismisses; Tab continues normal page traversal; Enter on the anchor element with a coachmark active also dismisses (so a user navigating by keyboard can acknowledge inline).

**Strict discipline (also enforced in code per `front_end_architecture.md §6.3`):**

- One visible at any moment (global lock).
- Never re-fires after dismissal — server-side `users.onboarding_state.dismissed_coachmarks` is authoritative.
- Never used for marketing or feature announcements — coachmarks are reserved for first-run product orientation only.

### 7.11 SampleChatBanner

Thin top-of-chat strip rendered when the user is in their auto-created sample chat (see `requirements.md §5.1` R4a). Frames the experience without being a modal.

- Single line: "Sample chat — try replying to Aiko to see how Nuansu translates" (i18n key, locale-appropriate name for the contact).
- Trailing button: `Use real chats →` in `text-primary` medium. One tap calls the complete-onboarding API and redirects to the real chat list.
- Background `accent-subtle` (a soft Aizome wash, 8% opacity), 1 px `border-subtle` bottom edge, 12 px vertical padding, 16 px horizontal.
- Sticky at the top of the chat scroll container — does not scroll with messages; remains visible until the user dismisses.
- No close `×` — the dismiss action is the explicit `Use real chats →` button. The user shouldn't be able to silently dismiss the frame and then wonder why this chat is weird.
- Enter: rendered with the chat view, no animation. Exit: 180 ms fade-out as the redirect navigates away.

**A11y:**

- Banner is `role="region"` with `aria-label="Sample chat introduction"`.
- The `Use real chats →` button is a real `<button>` with descriptive aria-label.
- High enough contrast on the `accent-subtle` wash that text remains AA against both light and dark themes.

### 7.12 Empty / loading / error states

Each major view has all three. Empty states explain what to do next. Error states explain _what's wrong_ and _what to try_ — never just a sad face.

### 7.13 Toasts

Reserved for confirmations (Saved, Copied, Deleted) — never for errors. Bottom-centred, 3s, dismissable.

## 8. Motion

- **Duration default:** 180ms. Faster (120ms) for hover/focus, slower (260ms) for layout shifts.
- **Easing default:** custom cubic-bezier(0.2, 0.8, 0.2, 1) — quick start, smooth land.
- **Streaming text.** Tokens append with no animation (animation per token is dizzying). The candidate card shows a thin indeterminate accent bar while streaming.
- **List enter / exit.** New messages slide up 8px and fade in 220ms.
- **Mode transitions.** When switching the view toggle, message bodies cross-fade in place (160ms) — never reflow the list.
- **Reduced motion.** `prefers-reduced-motion` disables all non-essential motion; transitions become instant.

## 9. Iconography & illustration

- **Icons:** Lucide. Stroke 1.75. Size 16/20/24.
- **Illustrations:** minimal. One bespoke marketing illustration for the hero section. Avoid AI-generated imagery (off-brand for a product whose pitch is "the AI didn't take liberties").

## 10. Accessibility checklist

- WCAG 2.2 AA contrast on all text/background pairs.
- `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast` respected.
- Keyboard support for every action; focus rings visible (2px accent ring with 2px offset).
- ARIA: chat list as `role="list"`, messages as `role="listitem"`, candidate streaming region as `aria-live="polite"`, audit list as a real `<ul>`.
- Screen reader labels on every icon button.
- Forms: label-input pairing, error messages tied via `aria-describedby`.
- Language attributes (`lang="ja"`, `lang="ko"`) on translated content for correct screen-reader pronunciation.
- Touch targets ≥ 44x44 pt; primary actions ≥ 48x48 pt.

## 11. Mobile patterns

- **Bottom-sheet** for preferences and settings panels under `md`.
- **Swipe** gestures for: archive a chat (left swipe), toggle a single message's language (right swipe). Always backed by a button equivalent.
- **Pull-to-refresh** off — chat sync is real-time.
- **Safe-area** padding throughout; no content under the home indicator or notches.
- **Composer keyboard handling.** When the keyboard opens, the chat list scrolls so the latest message is just above the composer. The composer never jumps when the candidate panel appears.
- **Haptics.** Subtle haptic on commit and on accept-audit-point (iOS Safari and Android — feature-detect).

## 12. Marketing site

- **Bilingual at launch:** routes are `/en/...` (default) and `/ja/...`. A locale switch sits in the header; user-agent language hints prefill but the manual choice persists in a cookie.
- Single page in v1 with sections: hero, demo, how-it-works (3 steps), proof / testimonials placeholder, pricing card, FAQ, privacy posture call-out, footer.
- Hero is a real screenshot or live demo, not stock illustration.
- Below the fold: a 30-second looping screencast of an outbound translation, captioned (captions translated for `ja`).
- The pricing card mirrors the in-app billing screen so the brand feels continuous. v1 lists Free + Pro $12/month (USD); JP users see the converted JPY at Stripe checkout.
- Footer: TOS, Privacy, Contact (`support@`), JP contact (`support-jp@`), Status, GitHub (when public). The `ja` locale footer leads with `support-jp@` and `privacy-jp@`.
- The same component tree powers both locales — copy is keyed via `next-intl`; every string has both `en` and `ja` entries before merging to main.

## 13. Component library + tooling

- shadcn/ui as the source of base components, copied into `components/ui/` and styled to the tokens above.
- A Storybook (or Ladle) for the bespoke components: MessageBubble, Composer, CandidatePanel, AuditPointList. Each component has at least 4 stories: default, loading, error, edge case.
- Visual regression on the bespoke components via Playwright + a small set of stable screenshots.

## 14. Done-bar before public launch

- Every component above passes its Storybook checklist (default/loading/error/edge).
- Lighthouse mobile ≥ 90 across the four scores on landing + app shell.
- A keyboard-only walkthrough completes signup → create chat → translate → toggle view → accept audit point.
- A screen-reader walkthrough (VoiceOver iOS, NVDA Windows) completes the same.
- Three professional designers (or design-conscious peers) sanity-check the home + app screens; their top-three blockers are addressed.
