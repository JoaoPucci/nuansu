# Design System — Nuansu v1

This doc sets the design language and component patterns. It pairs with `front_end_architecture.md` (technical implementation) and `requirements.md` (what the UI must enable).

## 1. Principles

1. **Calm, never chatty.** The app handles intimate communication; a yelling UI feels invasive. Default volume is low. Flourish lives in motion, not in colour or copy.
2. **Audit over magic.** Every AI suggestion is shown, sourced, and dismissable. We never hide what the model did.
3. **Two languages, one moment.** When both languages are visible, the layout makes them peers — not a primary with a translation appended.
4. **Mobile-first layout, desktop-native experience.** Mobile-first is an _engineering_ strategy (the layout gracefully scales to all sizes, working everywhere by construction); it is not a UX strategy. Desktop is a primary first-class target, not a scaled-up mobile port — keyboard-first ergonomics, density, hover affordances, multi-pane layouts, right-click menus. Same components, same interaction model; each platform leans into its own strengths. The product feels at home on a 27" monitor and on a 6" phone, and like neither port of the other. Full per-platform discipline in §11.
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

Motion is part of the brand. Reference apps (Linear, Granola, Cron, Raycast) earn their feel partly through motion — the right easing, the right direction, the right amount of stagger. AI defaults blow this: parallax everywhere, bouncy springs, decorative micro-animations on every hover. That's the wrong product. The bar here is **calm, purposeful, sub-180ms**.

This section gives implementation a coherent vocabulary and decision framework. Specifics that depend on browser-real validation (exact timing curves, micro-pixel tweaks) are discovered during Phase 5/6 implementation, not pre-specified here.

### 8.1 Principles

1. **Motion encodes meaning.** A modal fades because it's an overlay; a bottom sheet rises because it lives below the fold; navigation pushes laterally because spatial-page-stack is the mental model. Direction and curve are semantics, not decoration.
2. **Subtractive over additive.** When in doubt, less. A page that ships with no motion is more on-brand than one with bouncy springs everywhere.
3. **Match the reference apps in feel.** If your animation reads as "AI-default" (bouncy, long, parallax), it's wrong even if the duration token says 180ms.
4. **Never animate to compensate for slowness.** A spinner is not motion design. A 600ms enter to "soften" a slow load makes the load feel longer. Fix the load.
5. **Honour `prefers-reduced-motion`.** Always. Tested in §8.10.

### 8.2 Duration & easing tokens

Named tokens that components reference. Implementation: CSS custom properties + Framer Motion presets.

| Token               | Duration | Use                                                                        |
| ------------------- | -------- | -------------------------------------------------------------------------- |
| `motion-instant`    | 0 ms     | `prefers-reduced-motion` substitute for any non-essential motion           |
| `motion-quick`      | 120 ms   | Hover, focus, button press, icon state changes                             |
| `motion-default`    | 180 ms   | Most enter/exit (suggestion card, popover, toast, bubble emphasis)         |
| `motion-deliberate` | 220 ms   | List item enter (new message slide-up), drawer slide                       |
| `motion-layout`     | 260 ms   | Layout shifts that move existing content (chat-list reorder, panel resize) |

| Easing            | Curve                            | Use                                                                           |
| ----------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `ease-default`    | `cubic-bezier(0.2, 0.8, 0.2, 1)` | All enter, exit, micro-interactions. Quick start, smooth land.                |
| `ease-emphasized` | `cubic-bezier(0.32, 0.72, 0, 1)` | The one-off "this matters" enter (first paint of a chat, sample-chat banner). |
| `ease-linear`     | `linear`                         | Indeterminate progress (streaming accent bar). Never for enter/exit.          |

**No spring curves.** Springs read as playful and break the calm aesthetic. If something needs "extra life," shorten the duration instead of bouncing the curve.

### 8.3 Direction vocabulary

Direction conveys meaning. Don't reinvent per component.

| Element                        | Enter                        | Exit                       |
| ------------------------------ | ---------------------------- | -------------------------- |
| Modal / dialog                 | Fade + scale (0.96 → 1)      | Fade + scale (1 → 0.96)    |
| Toast                          | Slide up from bottom + fade  | Slide down + fade          |
| Slide-over (preferences panel) | Slide in from trailing edge  | Slide out to trailing edge |
| Bottom sheet (mobile)          | Slide up from bottom         | Slide down                 |
| Popover / tooltip / coachmark  | Fade + 4px slide from anchor | Fade                       |
| Inline card (suggestion, hint) | Fade + 4px slide up          | Fade + height collapse     |
| New message bubble             | Slide up 8px + fade          | (no exit; bubbles persist) |
| Route navigation               | Cross-fade (no slide)        | Cross-fade                 |
| Dropdown menu / select         | Fade + 4px slide from anchor | Fade                       |

The repeated `4px slide from anchor` for popover-class elements creates a consistent "anchored to a thing" feel; modals and toasts use larger movements because they're not anchored to a UI element.

### 8.4 Pattern catalog

Component-level motion specs already documented in §7 components. Summary table for cross-reference:

| Component                        | Enter                                                    | Exit                         | Duration / easing                       |
| -------------------------------- | -------------------------------------------------------- | ---------------------------- | --------------------------------------- |
| `MessageBubble` (new)            | Slide up 8px + fade                                      | None                         | `motion-deliberate` / `ease-default`    |
| `CandidatePanel` (streaming)     | Slide up 12px + fade                                     | Slide down + fade            | `motion-default` / `ease-default`       |
| `AuditPointList` items           | Stagger 30ms each, fade in                               | Stagger collapse             | `motion-default` / `ease-default`       |
| `SuggestionCard`                 | Fade + 4px slide up                                      | Height collapse + fade out   | 180 ms in / 120 ms out / `ease-default` |
| `ComposeHint`                    | Fade only                                                | Fade only                    | 120 ms / `ease-default`                 |
| `Coachmark`                      | Fade + 4px slide from anchor                             | Fade                         | 180 ms in / 120 ms out / `ease-default` |
| `SampleChatBanner`               | None on enter (structural)                               | Fade out (during navigation) | 180 ms / `ease-default`                 |
| Toast (sonner)                   | Slide up from bottom + fade                              | Slide down + fade            | `motion-default` / `ease-default`       |
| Drawer (preferences slide-over)  | Slide in from right (desktop) / up (mobile bottom sheet) | Slide out reverse            | `motion-deliberate` / `ease-default`    |
| Modal / dialog                   | Backdrop fade + content fade+scale (0.96 → 1)            | Reverse                      | `motion-default` / `ease-default`       |
| View toggle (source/both/target) | Cross-fade message bodies in place (no reflow)           | n/a                          | 160 ms / `ease-default`                 |

When a per-component spec contradicts this table, the component spec wins (it's likely a deliberate exception). Any third option needs a written justification — components should not invent new motion vocabularies.

### 8.5 Streaming visualization

While translation streams (composer in `generating` state, inbound paste in flight), surface progress without distracting from the content that's appearing.

- **Token append: no animation.** New tokens appear instantly. Animating per-token is dizzying and reads as "the AI is putting on a show."
- **Indeterminate accent bar:** 2 px tall, full width of the candidate card, sitting at the top edge. Background `accent-quiet`; sliding gradient overlay in `accent` (Aizome) at ~40% opacity, animating left-to-right linearly over 1200 ms, infinite repeat. Renders as a calm "energy is happening here" cue without competing for attention.
- **Bar disappears** the moment streaming completes, fade-out 120 ms.
- **No spinners anywhere.** Spinners say "I'm computing"; the bar says "data is arriving." Different signals, and we're always in the second case.
- **Skeleton shimmer for non-streaming loads** (initial chat-list paint, message-history paint): pulse animation 1500 ms infinite, opacity 0.4 ↔ 0.7. Subtle. Never on a content surface that's already partly loaded.

### 8.6 Stagger

When a list of items reveals, stagger gives the eye time to track. Cap it tight — long stagger reads as choreography.

- **Stagger interval:** 30 ms between items.
- **Maximum staggered items:** 6. Beyond 6, items 7+ appear simultaneously with item 6.
- **Apply to:** `AuditPointList` enter, suggestion-list-panel enter (when chat-header badge is opened), chat-list initial paint when transitioning from auth → app.
- **Don't apply to:** message bubbles arriving during a chat session (those use the per-bubble enter, no batching), settings rows, search results.

### 8.7 Microinteractions

Small confirmations that say "the system noticed your action." All under 200 ms. Pattern: scale or color, never both, never bounce.

| Action                               | Visual                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Button press                         | Scale 1 → 0.97 on press, return on release. 80 ms each direction.                                                               |
| Icon button (copy / caret / history) | Background `accent-quiet` flash 100 ms on activation                                                                            |
| Copy success                         | Tiny "Copied" toast (1.5 s) + Vibration API tap on touch devices (per §7.1)                                                     |
| Swipe-to-archive (mobile)            | Bubble slides 64 px left under thumb; release at >50% threshold completes the archive with a 220 ms slide-out + height-collapse |
| Swipe-to-toggle-view (mobile)        | Subtle 40 px peek of the alternate view at swipe boundary; release commits                                                      |
| Tap a suggestion action              | Card collapses (height 0) over 120 ms, then toast confirms                                                                      |
| Audit point accept                   | Item border-left switches to `success`, no slide; sibling items don't shift                                                     |
| Audit point reject                   | Item fades to 50% opacity, strikethrough on the suggested change                                                                |

### 8.8 Performance budget

Motion that janks is worse than no motion. Targets:

- **60 fps** on iOS 14+ Safari (oldest realistic target for our PWA), Android Chrome on a mid-range 2022 device, latest desktop Chrome / Safari / Firefox.
- **GPU-accelerated only.** Animate `transform` and `opacity`. Animating `width`, `height`, `top`, `left`, `padding` triggers layout — banned except in deliberate cases (height-collapse on suggestion-card dismiss, drawer width).
- **No parallax, ever.** Parallax is the canonical AI-default move. It's expensive on mobile and reads as "look how clever I am." Out.
- **No motion blur, motion gradients, or animated SVG paths** in product UI. (The marketing site can have one bespoke hero illustration with subtle motion if it earns its place.)
- **No animation longer than 320 ms** in product UI. If you need longer, you're probably trying to compensate for a slow load — fix the load.
- **`will-change` discipline.** Add only on the element about to animate; remove after. Permanent `will-change` on every animated element evicts memory and slows scrolling.

The `motion-fps` benchmark in `vitest bench` doesn't make sense (browser-only); we instead spot-check via Chrome DevTools Performance tab on key flows during Phase 5/6 implementation: composer state-machine transitions, message-list scroll, suggestion-card resolution.

### 8.9 Framer Motion conventions

We use Framer Motion as the React API for motion (already in `package.json`). Conventions:

- **Wrap when motion is non-trivial.** A simple 120 ms hover doesn't need `<motion.div>` — CSS transitions handle it cheaper. Wrap when there's enter/exit choreography, layout animation, or coordinated sequences.
- **Variants are reusable** in `apps/web/src/lib/motion-variants.ts` (file lands in Phase 5). Common variants: `fadeSlideUp`, `fadeScale`, `slideOverRight`, `slideOverBottom`, `coachmarkAnchored(direction)`. Components import and apply, never inline custom variants for what already exists.
- **`AnimatePresence` for exit** — use it whenever an element conditionally renders and needs to animate out before unmount (modals, toasts, suggestion cards).
- **`LayoutGroup` for shared-element transitions** — use sparingly. The view-toggle cross-fade is the only v1 use case.
- **Avoid `whileHover` / `whileTap`** — prefer CSS `:hover` / `:active` for cheaper hover/press feedback. Use Framer Motion's whileHover only when the hover state needs to coordinate with other elements (rare).
- **Never `useScroll` with parallax in product UI.** Banned per §8.8.
- **Spring curves: forbidden** — see §8.2. Use `tween` with `ease-default` instead.

### 8.10 `prefers-reduced-motion`

The OS-level "I don't want motion" setting. Honour it everywhere, automatically.

| Motion class                                                            | Reduced-motion behaviour                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Decorative / coordination (stagger, mode transitions, slide directions) | Becomes instant — no animation, no fade               |
| Transform-based enter/exit (slide, scale)                               | Becomes a 120 ms fade-only                            |
| Streaming accent bar                                                    | Becomes a static 2 px filled bar (no slide animation) |
| Skeleton shimmer                                                        | Becomes a static surface-2 placeholder                |
| Microinteractions (button press scale, icon flash)                      | Disabled — show the end state instantly               |
| Toast slide-up                                                          | Becomes a fade-only, same duration                    |
| Modal / dialog scale                                                    | Becomes fade-only, same duration                      |

Implementation: a single `useReducedMotion()` hook from Framer Motion exposes the OS preference; variants accept a `reduce` flag and switch curves. The CSS layer has a fallback `@media (prefers-reduced-motion: reduce)` block that disables `transform` transitions for non-Framer elements (CSS-only buttons, etc.).

**Never disable motion entirely under `prefers-reduced-motion`** — fade-only is still motion and helps users orient. Disable only the kinetic component.

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

## 11. Platform patterns

Mobile and desktop are **both first-class targets**, not one a port of the other. The mobile-first layout strategy (per §1, §6.3) means the layout works at every size by construction; the per-platform discipline below is what makes each _feel native_ rather than scaled.

The reference apps in §2 carry both bars: Linear (desktop keyboard ergonomics + density) and Telegram (mobile chat smoothness + tap targets) are the dual frame. If the mobile build feels like a desktop site shrunk, or the desktop build feels like a phone app stretched, it's not done.

### 11.1 Mobile patterns

- **Bottom-sheet** for preferences and settings panels under `md`.
- **Swipe** gestures for: archive a chat (left swipe), toggle a single message's language (right swipe). Always backed by a button equivalent.
- **Pull-to-refresh** off — chat sync is real-time.
- **Safe-area** padding throughout; no content under the home indicator or notches.
- **Composer keyboard handling.** When the keyboard opens, the chat list scrolls so the latest message is just above the composer. The composer never jumps when the candidate panel appears.
- **Haptics.** Subtle haptic on commit and on accept-audit-point (iOS Safari and Android — feature-detect).
- **Tap target minimum:** 44 × 44 px for any interactive element under `md`. iOS HIG / Material both expect this.

### 11.2 Desktop patterns

The founder's primary use is desktop. The bar is **Linear / Raycast / Cron / Granola** — all unmistakably desktop-shaped, with keyboard ergonomics, density, and information richness their mobile counterparts don't carry. If the desktop build looks like an upscaled phone app, it's wrong.

What desktop _gains_ over mobile:

- **Keyboard-first navigation.** Every action reachable by keyboard. Cmd-K command palette (lands in Phase 5+). Documented shortcuts for: switch chat, toggle view (source/both/target), copy translation, refine, commit, open preferences, archive. Every shortcut surfaces in a `?` keymap modal and in tooltips.
- **Density.** Denser than mobile by design. Chat list rows ~44 px desktop vs 56 px mobile. Settings forms tighter line-height. Body text bumps to `text-md` from `text-base` (per §5.3) — denser scanning, more chats above the fold, more thread visible without scroll.
- **Multi-pane discipline.** Three panes from `xl` (1280 px+): left rail (chat list, 280–320 px) · main panel (chat / settings / usage) · right rail (preferences slide-over, pinnable open from `xl` upward). At `lg`–`xl` (1024–1279 px), right rail folds away unless explicitly opened. Below `lg`, the chat-list rail folds to a top-tab bar (mobile pattern, not the same product).
- **Hover affordances.** Hover states for every interactive element. Hover-reveal acceptable for genuinely-secondary actions (chat-list row "more options" three-dot menu) but **never** for first-class actions like copy (per §7.1, always-visible).
- **Right-click context menus.** Desktop users expect them. Already specced for copy on `MessageBubble` (§7.1); apply consistently — chat-list row right-click opens "Rename / Archive / Delete"; message-bubble right-click opens copy variants.
- **Window-chrome respect.** PWA install on macOS gets a custom title-bar drag region (CSS `app-region: drag` on the header band). Don't paint a fake nav bar that imitates a browser. Honour native window-management gestures (double-click title to maximize / restore).
- **Resize at all sizes from 1024 px up.** Don't lock to a narrow column "for breathing room." A chat that uses 60% of a 27" monitor with vast empty margins is wrong. Let the chat list breathe to 320 px, the main panel to whatever's left up to a ~720 px reading-line-length cap (so JP/EN long lines stay readable), the right rail to 360 px when pinned.
- **Tab / keyboard navigation discipline.** Logical tab order top-to-bottom, left-to-right. Focus rings always visible (per §7.x focus styles). Escape closes popovers and modals. Arrow keys navigate lists (chat list, audit point list, suggestion-card menu).
- **Tap target minimum drops to 32–36 px** for compact desktop actions (icon buttons, table rows) — the mobile 44 px floor is wasteful here and reads as unconfident.

**Banned on desktop** (request-changes on PR review):

- **Bottom sheets.** Mobile pattern. On desktop, use a popover, modal, or slide-over.
- **Hamburger menus** as primary nav. Mobile pattern. The chat-list rail is always visible on desktop from `lg` upward.
- **44 px+ tap targets used everywhere.** Looks wasteful and unconfident on desktop. Use the smaller 32–36 px range for icon buttons and table rows.
- **Mobile-only swipe gestures with no desktop equivalent.** Every swipe-archive must have a button or right-click menu equivalent (the rule in §11.1 already requires this; this re-states it for the desktop side).
- **Locking layouts to a narrow viewport.** A 27" monitor with the app pinned to 720 px and vast margin is wrong. Let it breathe.
- **Modal-on-modal stacking** to substitute for desktop's natural multi-pane support. If you need two layers visible, use the slide-over rail or a popover, not a stacked dialog.

The product feels _different_ on desktop: dense, keyboard-driven, multi-pane, hover-rich. Same components, same interaction model, same brand voice — but each component knows when it's on desktop and adapts its affordances accordingly.

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
