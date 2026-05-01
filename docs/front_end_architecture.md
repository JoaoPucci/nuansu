# Frontend Architecture — Nuansu v1

This doc defines the frontend implementation. It pairs with `architecture.md` (system shape), `design_system.md` (visual language), and `back_end_architecture.md` (API contract).

## 1. Stack

| Concern                | Choice                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| Build tool             | **Vite 5**                                                         |
| Language               | TypeScript (strict mode)                                           |
| UI framework           | **React 18**                                                       |
| Routing                | **TanStack Router** (file-based, type-safe)                        |
| Marketing prerendering | **`vite-react-ssg`** (SSG at build for `[locale]` routes)          |
| Hosting                | **Cloudflare Pages** (static SPA + Pages Functions for API)        |
| Styling                | Tailwind CSS v4 + CSS variables for tokens                         |
| UI primitives          | shadcn/ui (copied into the repo)                                   |
| Animation              | Framer Motion                                                      |
| Server-state           | TanStack Query v5                                                  |
| Client-UI state        | Zustand (small slices, never global blob)                          |
| Forms                  | react-hook-form + zod resolver                                     |
| Schemas                | shared package `@nuansu/schemas` (zod)                             |
| Icons                  | Lucide                                                             |
| Date/time              | date-fns + date-fns-tz                                             |
| i18n                   | **i18next + react-i18next** (runtime), routing prefix `/[locale]/` |
| Auth client SDK        | **Better Auth** client (`better-auth/react`)                       |
| Streaming              | Web Streams + Server-Sent Events (SSE) over fetch                  |
| Testing (unit)         | Vitest + React Testing Library                                     |
| Testing (e2e)          | Playwright                                                         |
| Component stories      | Ladle                                                              |
| Lint / format          | ESLint + Prettier                                                  |
| Type-check in CI       | `tsc --noEmit`                                                     |
| PWA                    | `vite-plugin-pwa`                                                  |

## 2. Route structure

TanStack Router file-based routes under `apps/web/src/routes/`:

```
src/routes/
├── __root.tsx                   # root layout: providers, theme, error boundary
├── $locale/                     # 'en' (default) and 'ja' for marketing
│   ├── _layout.tsx              # marketing chrome + locale switch
│   ├── index.tsx                # /, /ja
│   ├── pricing.tsx              # /pricing, /ja/pricing
│   ├── privacy.tsx
│   └── terms.tsx
├── auth/                        # SPA, English only at v1
│   ├── _layout.tsx              # minimal auth chrome
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   └── onboarding.tsx
└── app/                         # SPA, auth-gated
    ├── _layout.tsx              # app shell: nav, session loader, prefs loader
    ├── chats/
    │   ├── index.tsx            # /app/chats — list + empty state
    │   └── $chatId/
    │       ├── index.tsx        # /app/chats/<id>
    │       └── prefs.tsx        # /app/chats/<id>/prefs
    ├── settings/
    │   ├── _layout.tsx
    │   ├── index.tsx
    │   ├── preferences.tsx
    │   ├── account.tsx
    │   └── billing.tsx
    └── usage.tsx
```

API route handlers live in **`apps/web/functions/api/[[path]].ts`** which mounts the Hono app from `server/app.ts`. The API runs on Cloudflare Pages Functions (= Workers under the hood).

## 3. Rendering model

| Surface                         | Mode                                                                     | Why                                               |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| Marketing pages (`$locale/...`) | **SSG** at build via `vite-react-ssg`; ISR-flavoured rebuild on git push | SEO; static HTML loads in <100 ms from Tokyo PoPs |
| Auth pages (`auth/...`)         | SPA (CSR)                                                                | Auth flows; minimal SEO benefit                   |
| App pages (`app/...`)           | SPA (CSR)                                                                | Auth-gated, dynamic, user-specific                |
| Streaming endpoints             | Cloudflare Pages Functions (Hono)                                        | SSE over `ReadableStream`                         |

Why no SSR for the app shell: with a Tokyo Worker + Tokyo Postgres, an authenticated dashboard SSR'd at the edge has marginal benefit over SPA-with-fast-hydration, and SSR adds invalidation complexity. The marketing site is where SEO matters; that's prerendered.

## 4. State boundaries

Three categories, kept strictly separated:

1. **Server state** — chats, messages, prefs, usage. Owned by TanStack Query. Cache key is `[entity, ...filters]`. Mutations invalidate the right slice.
2. **UI state** — composer text, view toggles, panel open/closed, selected audit points. Owned by per-feature Zustand stores or React state. Never persists to the server unless committed.
3. **Form state** — owned by react-hook-form per form. Never escapes the form.

Anti-patterns to avoid:

- A "global app state" Redux blob.
- Calling `fetch` directly from components — always go through a query/mutation hook.
- Storing server data in Zustand (cache invalidation gets owned by two systems and breaks).

## 5. Feature folders

```
src/features/
├── auth/
│   ├── api/                   # Better Auth client wrappers
│   ├── components/            # SignInCard, OAuthButtons (Google, Apple, LINE)
│   └── hooks/                 # useSession, useSignIn
├── translation/
│   ├── api/                   # query + mutation hooks
│   ├── components/            # CandidatePanel, AuditPointList, RegisterBadge
│   ├── hooks/                 # useTranslateOutbound, useInboundPaste
│   ├── stores/                # composerStore (zustand)
│   ├── streaming/             # SSE parser + zod-validated chunk handler
│   └── types.ts               # imports from @nuansu/schemas
├── chats/
├── prefs/
├── billing/
└── usage/
```

A feature folder owns everything specific to that concern; cross-feature primitives go to `lib/` or `components/ui/`.

## 6. Composer flow — the centrepiece component

The composer is a state machine driven by user actions. Implementation: a small `useReducer` inside `ComposerProvider`.

```
States: idle → drafting → generating → iterating → committing → idle
```

Transitions:

- `START_DRAFT`: idle → drafting. Triggered by first keystroke.
- `REQUEST_TRANSLATE`: drafting → generating. Validates draft length, attaches snapshot of prefs + name-locks, fires SSE request.
- `STREAM_CHUNK`: generating → generating. Each chunk validates against `TranslationStreamChunk` schema; updates the partial Translation Object.
- `STREAM_DONE`: generating → iterating.
- `REFINE`: iterating → generating. Fires SSE again with the prior Translation Object as context.
- `EDIT_TARGET_INLINE`: iterating → iterating. Local edit, no LLM round-trip.
- `COMMIT`: iterating → committing. POST to `/api/chats/:id/messages`.
- `COMMIT_DONE`: committing → idle. Optimistically appends; query invalidation reconciles.
- `RESET`: any → idle.

Each state has its own UI affordances; transitions are the only way to change UI mode.

### 6.1 Preference drift suggestions (parallel channel)

`prefs_suggestion` chunks emitted by the translator (see `back_end_architecture.md §5.4`) are a **parallel channel**, not a composer state. They never block translation flow; they accumulate as decorations on committed messages and as items in a chat-header badge.

- The streaming reducer routes `prefs_suggestion` chunks to a separate `usePrefsSuggestionsStore` (Zustand) keyed by `chat_id`. They survive the composer state machine — applying or dismissing one doesn't affect translation.
- High-confidence suggestions (`confidence: "high"`) render inline as a `SuggestionCard` directly under the triggering message bubble. Medium and low confidence accumulate in a chat-header badge counter; tapping opens a panel listing them with the same actions.
- The card has three actions: **Apply**, **Keep both** (additive only — `name_lock_add`-only path), **Not now**. Each calls `POST /api/chats/:id/pref-suggestions/:sid/resolve` with the corresponding `action`. On success, optimistic update collapses the card.
- After a suggestion resolves with `apply` and the resolved field was a canonical name, the chat's `name_locks` query is invalidated so the next outbound translation includes the new + prior lock.

### 6.2 Compose-time hint (client-side, no LLM call)

A pure-client safety net for the case where the user types an outbound mentioning a now-stale canonical name. Implementation: `apps/web/src/lib/compose-hints.ts`.

- On every draft change (debounced 200 ms), run a regex over the draft against the chat's `name_locks` filtered to `prior_canonical: true` (a flag set when a name was applied-as-replaced).
- On match, render a soft inline hint below the composer input: "Did you mean **Misaki**?" with a one-tap rewrite button.
- One-tap rewrite is a pure string replace in the draft buffer — no network call, no LLM. The hint dismisses on first interaction (rewrite or close).
- Hint suppression: once dismissed for a given `(prior_name, new_name)` pair within the current composer session, do not re-show until next chat open.

This layer is independent of the LLM-driven detection in §6.1 and exists because the user editing their own draft shouldn't need to wait for a server round-trip to be reminded.

### 6.3 First-run experience — sample chat + coachmarks

The post-onboarding experience (`requirements.md` §5.1 R4a) is split into two pieces: a server-created **sample chat** that the user lands in, and a small set of **just-in-time coachmarks** that fire on first encounter with specific affordances. State lives server-side in `users.onboarding_state` (see `back_end_architecture.md §3.4`).

**`useOnboardingState` hook.** A single TanStack Query hook (`/api/onboarding/state`) loaded once at app shell mount, cached for the session. Drives both the sample-chat banner visibility and the coachmark gating.

**`useCoachmark(id)` hook.** Renders a coachmark if `id` is not in `dismissed_coachmarks` and the trigger condition is met. On dismiss, calls `POST /api/onboarding/dismiss-coachmark` and optimistically updates the cached onboarding state.

```ts
function useCoachmark(id: CoachmarkId): {
  shouldShow: boolean;
  dismiss: () => void;
};
```

Trigger wiring lives at the call site (the composer, the audit list, the view toggle, etc.) — the hook only owns the dismissed-set check and the dismiss mutation.

**Coachmark IDs and trigger sites:**

| ID                         | Trigger site                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| `composer_first_translate` | `Composer` — fires after first `STREAM_DONE` reducer transition  |
| `audit_points_first`       | `AuditPointList` — fires when first audit_point appears in state |
| `view_toggle_first`        | `ViewToggle` — fires on mount when chat has ≥1 message           |
| `refine_first`             | `Composer` — fires on first transition into `iterating`          |

**Discipline (enforced in code, not just docs):**

- A global `useCoachmarkLock` Zustand atom holds a single optional `activeId`. `useCoachmark` only returns `shouldShow: true` if `activeId === id` _or_ `activeId === null` and we successfully claim the lock. This guarantees at most one coachmark visible at any moment.
- Dismissals are idempotent server-side and optimistic client-side — re-renders never re-fire a coachmark.
- After page reload, the server-side `dismissed_coachmarks` is the source of truth; local Zustand state is rehydrated from the query cache.

**`SampleChatBanner`.** Rendered at the top of the chat view when `chat.id === onboarding.sample_chat_id`. Two affordances: a single line of copy (i18n key `onboarding.sample_chat_banner.label`) and a `[Use real chats →]` button that calls `POST /api/onboarding/complete`, then redirects to `/app/chats`. The banner is a structural layout element of the sample chat route, not a toast — it does not animate in, it's just there.

**Sample chat fixture rendering.** The three fixture messages are seeded server-side at onboarding-form submission (see `back_end_architecture.md §3.4`), so the client treats them like any other messages — they land in `messages` with normal `prefs_snapshot`, `model: 'fixture'`, `prompt_version: 'fixture-v1'` markers. The client doesn't need a special render path; the `model: 'fixture'` marker is purely for analytics filtering.

## 7. Streaming — `useStreamedTranslation`

A custom hook that owns the streaming lifecycle:

```ts
type Args = {
  endpoint: "translate" | "inbound";
  payload: TranslateRequest | InboundRequest;
  onChunk: (partial: PartialTranslationObject) => void;
};

function useStreamedTranslation(args: Args) {
  // POST with `Accept: text/event-stream`, AbortController on unmount/cancel.
  // Each chunk is JSON; validated with zod against TranslationStreamChunk.
  // The hook merges chunks into the partial Translation Object and emits onChunk.
  // Returns: { status, error, cancel }.
}
```

Failure modes:

- Network error → emit a typed error; UI surfaces "Connection lost — retry".
- Schema validation error → log to Sentry, fall back to a single retry, then bubble.
- Provider 5xx → typed `provider_unavailable`; UI shows a banner.

## 8. Auth integration (Better Auth client)

- `import { authClient } from "@/lib/auth-client"` — the Better Auth React client.
- Sign-in page calls `authClient.signIn.email({ email })` for magic-link, or `authClient.signIn.social({ provider: "google" | "apple" | "line" })` for OAuth.
- A top-level `<SessionProvider>` reads `authClient.useSession()` and exposes the current user; `app/_layout` redirects to `/auth/sign-in` if no session.
- Server-side, the Hono app validates sessions via Better Auth's `auth.api.getSession({ headers })`.

LINE Login is wired via Better Auth's "generic OAuth provider" config — see `back_end_architecture.md §4.x`.

## 9. Forms

react-hook-form + zod schemas (shared with the server). Pattern:

```ts
import { GlobalPrefsSchema } from "@nuansu/schemas";

const form = useForm<z.infer<typeof GlobalPrefsSchema>>({
  resolver: zodResolver(GlobalPrefsSchema),
  defaultValues: query.data,
});
```

Server validation re-uses the same schema in the Hono route. No drift.

## 10. Data fetching patterns

- **Initial fetch on mount** via TanStack Query hooks; SSR/RSC patterns _not_ used (this is a SPA).
- **Mutations** via `useMutation`. Optimistic updates for: rename chat, archive chat, toggle audit point accepted state, set per-chat preference.
- **Pagination** for messages: cursor-based, virtualised list (TanStack Virtual). Page size 50.
- **Real-time later.** v1 doesn't need pub/sub — this is a single-user-per-chat product. Roadmap for native apps may add SSE on chat changes; not needed for MVP.

## 11. Performance budgets

| Metric                                        | Target                                 |
| --------------------------------------------- | -------------------------------------- |
| First Contentful Paint (mobile 4G, marketing) | ≤ 1.0 s (static HTML)                  |
| First Contentful Paint (mobile 4G, app shell) | ≤ 1.5 s                                |
| Largest Contentful Paint (mobile 4G)          | ≤ 2.5 s                                |
| Time to Interactive (app shell)               | ≤ 3.0 s                                |
| JS bundle (initial app shell)                 | ≤ 180 KB gzipped                       |
| Streaming first token (translate)             | ≤ 1.2 s p50, ≤ 2 s p95                 |
| Layout shifts during streaming                | 0 (allocate space for candidate cards) |

How:

- Marketing routes are static HTML — TTFB is dominated by Cloudflare PoP latency.
- Code-split the app shell: composer + candidate panel + audit list lazy-loaded when the user enters a chat for the first time in a session.
- Fonts: variable Inter + Noto Sans JP, `font-display: swap`, subset Latin + JIS-X-208 for first paint.
- PostHog loaded with deferred initialisation; opt-in for EU.

## 12. PWA

- Manifest via `vite-plugin-pwa`: name, short_name, icons (192/512 + maskable), theme_color, background_color, display: standalone.
- Service worker (Workbox-generated by the plugin):
  - Cache-first for static assets.
  - Network-first for the `app/*` shell, with a stale-while-revalidate fallback.
  - **Never cache** API responses with user content; always network.
  - Offline page: "Translation needs a connection. Drafts are saved on this device."
- Drafts saved to IndexedDB on every keystroke (debounced 500 ms); restored on reload.

## 13. Internationalisation

- **i18next + react-i18next**. Namespaces per feature (`common.json`, `marketing.json`, etc.).
- **Marketing pages**: `en` (default) + `ja` shipped at v1 — both routes prerendered.
- **App UI**: `en` only at v1; the i18n scaffold is in place so adding `ja` (or other locales) for the app is a translation pass, not a refactor.
- Direction handled per locale (`dir="rtl"` for Arabic when added).
- Number/date formatting via the platform `Intl` APIs; never hand-rolled.
- Locale switch persists in a `nuansu_locale` cookie (1 year) so server-prerendered pages match the user's choice on subsequent visits.

## 14. Error & loading patterns

- **Error boundaries** at feature level (translation, billing, settings) — a failure in one feature does not blank the app.
- **Suspense / fallback** at route level via TanStack Router's pendingComponent + errorComponent.
- Loading states use skeleton shapes that match the eventual layout — no spinners over content.
- Error states explain what to try; "Something went wrong" alone is banned.

## 15. Telemetry

- **Errors:** Sentry. Source maps uploaded per build.
- **Product analytics:** PostHog. Events instrumented at the action level — not pageviews. Standard events: `signed_up`, `onboarding_completed`, `chat_created`, `translate_started`, `translate_completed`, `translate_iterated`, `audit_point_accepted`, `audit_point_rejected`, `view_toggle_changed`, `quota_blocked`, `upgrade_clicked`, `subscription_started`.
- **Privacy gates.** EU IP → opt-in banner; respects DNT; can be disabled per-user in settings.

## 16. Testing strategy

- **Unit / component tests** (Vitest + RTL): schema validators, reducers, the SSE parser, audit-point UI state. Target: anything pure.
- **Component visual** (Ladle): every bespoke component has stories for default / loading / error / edge cases.
- **E2E** (Playwright): the four happy paths from `requirements.md §7`. Pinned to a seeded staging DB and a stubbed LLM that replays canned chunked responses.
- **Accessibility tests** (axe-core via Playwright): on each main route.
- **Performance smoke** (Lighthouse CI): on every PR for marketing + app shell.

## 17. Repo discipline

- ESLint config bans:
  - Imports from `server/**` in `src/**` files (hard separation of server-only code).
  - `process.env.*` access outside `lib/env.ts`.
  - Relative imports across feature folders (must go through public exports).
- A `lib/env.ts` parses `process.env` (server) / `import.meta.env` (client) against zod schemas at boot; missing or malformed fails fast.
- Pre-commit (lefthook): `tsc --noEmit`, `eslint`, `prettier --check`, fast unit tests on changed files.
- Vite's `envPrefix: "VITE_PUBLIC_"` enforces that only explicitly-named env vars reach the browser bundle.

## 18. Accessibility-driven semantics

Every bespoke component starts with the right HTML element before reaching for ARIA. Examples:

- The chat list is a `<ul>` of `<li>` with TanStack Router `<Link>` anchors.
- Message bubbles are `<article>` elements with `aria-label="Message from <author>"`.
- The candidate panel is a `<section>` with `aria-live="polite"` so screen readers narrate streaming output.
- The audit point list is a `<ul>`. Each accept/reject pair is a real `<button>`.
- The view toggle is a `<fieldset>` with three `<input type="radio">` + visually-styled `<label>`s.

## 19. Open questions

All previously listed frontend open questions are resolved (Vite + React + TanStack Router locked, Cloudflare Pages locked, Better Auth locked, marketing in same app via prerendering, Ladle for stories). See [`./questions.md`](./questions.md) for any remaining cross-cutting TODOs.
