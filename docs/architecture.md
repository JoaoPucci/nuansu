# Architecture — Nuansu v1

## 1. Goals & constraints

The architecture exists to satisfy these constraints, in priority order:

1. **Anti-drift fidelity.** Every translation is stored as a structured artifact (literal, natural, gloss, audit points, locked names). The system is built around this object, not around a string.
2. **Solo-founder operability.** One person ships, runs, and maintains v1. Stack choices favour boring, batteries-included primitives over microservices, queues, and bespoke infra.
3. **Polished SaaS experience.** Auth, billing, landing, transactional email, observability — all wired up properly, not "we'll do it later".
4. **Public-repo safe.** No vendor lock that requires private build steps; secrets via env; deployment doc that anyone can follow.
5. **Compliance posture from day one.** EU and Brazilian data subjects can be served correctly: data export, deletion, region-aware hosting, no LLM training.
6. **Headroom for the roadmap.** Voice, date mode, native apps, and BYO-API-key all need to land without a rewrite.

## 2. High-level shape

```
                    ┌─────────────────────────────────────────────┐
                    │   Cloudflare Pages + Pages Functions         │
                    │   (Tokyo PoPs + global edge)                 │
                    │                                              │
                    │   ┌──────────────────┐ ┌──────────────────┐ │
                    │   │ Static SPA       │ │ Hono API         │ │
                    │   │ Vite + React +   │ │ (Pages Functions │ │
                    │   │ TanStack Router  │ │  on workerd)     │ │
                    │   │ • Marketing (SSG)│ │ • Auth           │ │
                    │   │ • App shell (SPA)│ │ • CRUD           │ │
                    │   │ • i18n EN+JP     │ │ • Translation    │ │
                    │   │ • PWA            │ │   orchestration  │ │
                    │   └──────────────────┘ │ • Webhooks       │ │
                    │                        │ • SSE streaming  │ │
                    │                        └────────┬─────────┘ │
                    └────────────────────────────────│────────────┘
                                                     │
        ┌────────────────┬───────────────┬───────────┼──────────┬───────────┐
        │                │               │           │          │           │
        ▼                ▼               ▼           ▼          ▼           ▼
  ┌──────────┐   ┌──────────────┐  ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
  │ Better   │   │   Supabase   │  │   LLM    │ │ Stripe │ │ Email  │ │ Upstash  │
  │ Auth     │   │   Postgres   │  │Anthropic │ │  USD   │ │ Resend │ │  Redis   │
  │(library; │   │   (Tokyo)    │  │  Claude  │ │        │ │        │ │ (Tokyo)  │
  │ in Worker│──▶│   + Storage  │  │          │ │        │ │        │ │          │
  └──────────┘   └──────────────┘  └──────────┘ └────────┘ └────────┘ └──────────┘

  Cross-cutting: Sentry (errors), PostHog EU (product analytics, opt-in),
                 AWS KMS ap-northeast-1 (envelope encryption root key),
                 Cloudflare Turnstile (captcha), Cloudflare WAF + DDoS.
```

The whole runtime is **one Cloudflare Pages deployment** (static SPA + Pages Functions running Hono) plus **one Supabase project** in Tokyo holding Postgres and Storage. Auth runs _inside_ our Hono Worker via the Better Auth library — there is no auth vendor. Everything else is a managed third-party plus the LLM provider.

## 3. Components

### 3.1 Web app (Vite + React, hosted on Cloudflare Pages)

- **Vite** as build tool — fast dev, standard ESM output, vendor-neutral.
- **React 18** with **TanStack Router** for type-safe routing.
- **Marketing pages** prerendered to static HTML at build time (via `vite-react-ssg` or equivalent) for SEO; bilingual `en` + `ja` routes under `/[locale]/...`.
- **App shell** (`/app/*`) is an SPA — auth-gated, dynamic, no SSR needed.
- **PWA** via `vite-plugin-pwa` — installable, offline shell, drafts persisted to IndexedDB.
- **Hosting** on Cloudflare Pages; preview deploys per PR; Tokyo PoPs out of the box.

**Why Vite + React + TanStack Router.** No Next.js coupling — Vite is a build tool, React is a library, TanStack Router is open-source. Bundle output is portable to any static host. Avoids the Next-middleware class of CVEs (CVE-2025-29927 etc.) and the App-Router-specific debugging surface.

### 3.2 API (Hono on Cloudflare Pages Functions)

- **Hono** router runs inside Cloudflare **Pages Functions** (= Workers under the hood; same runtime).
- One file `functions/api/[[path]].ts` mounts the entire Hono app — auth handlers, CRUD, translation orchestration, webhook receivers, health checks.
- **SSE streaming** for translation responses uses standard `ReadableStream` — works on any Workers-compatible runtime.
- **Same deployable** as the SPA — `wrangler pages deploy` ships static + Functions together.

**Why Hono + Cloudflare Pages Functions.** Hono is MIT, designed for multi-runtime portability (Workers, Node, Deno, Bun, Lambda). Cloudflare Workers run on `workerd` (open source). Code is portable; we only opt into Cloudflare-specific bindings deliberately (currently: Cron Triggers).

### 3.3 Database (Supabase Postgres, Tokyo)

- Single Supabase Postgres instance in **Northeast Asia 1 (Tokyo)** for low latency to the JP-primary user base.
- Schema in [`./back_end_architecture.md` §3](./back_end_architecture.md). Highlights: `users`, `chats`, `messages`, `message_versions`, `preferences_global`, `preferences_chat`, `name_locks`, `usage_events`, `subscriptions`.
- Drizzle ORM for type-safe queries and migrations checked into git.
- **RLS policies on every user-scoped table** plus app-layer ownership checks (defence in depth — see security.md §3).

**Why Supabase Postgres.** Supabase bundles managed Postgres + Auth + Storage + RLS + backups in one Tokyo-region project — single bill, single dashboard, JP-local latency. Drizzle keeps the schema in TypeScript next to the code that uses it.

### 3.4 Auth (Better Auth, in our Hono Worker)

**Better Auth** — a TypeScript auth library. Runs _inside_ our Hono Worker. There is no auth vendor. Auth tables (`auth_users`, `auth_sessions`, `auth_accounts`, `auth_verification_tokens`) live in the same Supabase Postgres instance as the rest of the app data, but are owned and managed by Better Auth.

- Providers: **email magic link + Google OAuth + Apple OAuth + LINE Login**. LINE is shipped via Better Auth's "generic OAuth provider" adapter — ~30 lines of config.
- httpOnly + Secure + SameSite=Lax session cookies. CSRF protection on mutating routes.
- MFA (TOTP) gated to paid tier in v1, available to all in v2. Better Auth ships TOTP out of the box.
- Sessions validated at the edge (Cloudflare Worker reading the cookie + checking against the DB or a short-TTL Redis cache).

**Why Better Auth.** Removes the auth-vendor lock-in. AGPL-clean (Better Auth is MIT). Auth logic is in our codebase, our migrations, our tests. Tokyo region for sessions because the DB is in Tokyo and the Worker runs at Tokyo PoPs.

### 3.5 LLM provider (Anthropic Claude)

- Primary model: Claude Sonnet 4.6 — reasoning quality on JP nuance is the moat.
- Cheap-tier model for inbound preview / footnotes: Claude Haiku 4.5.
- Vision (Sonnet) for inbound image OCR — roadmap.
- All calls go through a single internal `translation` service module that owns prompt templates, structured-output schema, retries, and observability.
- **Prompt caching** on the system prompt + per-chat preferences — material cost win and it pins behaviour across calls.
- **No training on data** clause (zero-data-retention) negotiated with Anthropic.

### 3.6 Payments (Stripe)

- Stripe Checkout for first purchase; Stripe Customer Portal for self-serve management.
- **Single USD price at v1**: Pro $12/month. No annual plan v1.
- Webhooks update local `subscriptions` and entitlements; signed and idempotent.
- Stripe Tax enabled — covers JP consumption tax (10%), EU VAT, US sales tax. JP users see the converted JPY amount and tax line at checkout.
- Founder onboarded as **個人事業主** in Japan: Visa + MC + Apple Pay + Google Pay at launch; JCB after Stripe review (1–3 days). Konbini deferred until incorporation or specific Stripe approval.

### 3.7 Transactional email (Resend)

- Magic-link delivery, billing receipts (Stripe-driven), data-export delivery, account-deletion confirmation.
- DKIM/SPF/DMARC configured on the sending domain.

### 3.8 Cache / rate limit (Upstash Redis)

- Per-user and per-IP rate limits for translation, signup, login.
- Hot-key cache for chat preferences and user settings (read-heavy on every translation).
- Idempotency keys for translation requests.

### 3.9 Object storage (Supabase Storage)

- **Supabase Storage** in the same Tokyo project as the DB. S3-compatible API; access via signed URLs.
- v1 use: avatar images.
- v2 use: voice notes, image messages.
- **Future-Tokyo-only constraint:** Supabase Storage is per-project (per-region). When voice ships in v2 or when multi-region launches, swap to **Cloudflare R2** with a single global bucket — better edge serving and cheaper egress at scale. R2 is S3-compatible; the migration is mechanical.

### 3.10 Observability

- Sentry for errors (frontend + backend).
- PostHog (EU-hosted) for product analytics and feature flags. Opt-in only for EU users; respect Do Not Track.
- Cloudflare logs (Workers Logs, real-time) + Postgres slow-query log.
- Health endpoint that pings DB and LLM provider; uptime monitor via Better Stack.

## 4. Data flow — outbound translation

The single most important flow.

```
User                  Worker (CF Pages)       LLM (Anthropic)             DB
 │                        │                        │                       │
 │  type draft (SPA)      │                        │                       │
 │ ─────────────────────► │                        │                       │
 │                        │                        │                       │
 │  tap Translate         │                        │                       │
 │ ─────────────────────► │                        │                       │
 │                        │  load chat prefs +     │                       │
 │                        │  global prefs +        │                       │
 │                        │  name locks (cache)    │                       │
 │                        │ ─────────────────────────────────────────────► │
 │                        │ ◄───────────────────────────────────────────── │
 │                        │                        │                       │
 │                        │  build messages,       │                       │
 │                        │  attach cached system  │                       │
 │                        │  prompt                │                       │
 │                        │ ─────────────────────► │                       │
 │                        │                        │                       │
 │                        │  stream JSON tokens    │                       │
 │                        │ ◄───────────────────── │                       │
 │   stream candidates    │                        │                       │
 │ ◄───────────────────── │                        │                       │
 │                        │                        │                       │
 │  iterate / accept      │                        │                       │
 │ ─────────────────────► │                        │                       │
 │                        │  write message +       │                       │
 │                        │  message_versions +    │                       │
 │                        │  usage_event           │                       │
 │                        │ ─────────────────────────────────────────────► │
 │                        │  ◄──── ack             │                       │
 │   commit confirmation  │                        │                       │
 │ ◄───────────────────── │                        │                       │
```

Key points:

- The **streaming response** is split into a JSON stream of structured fragments (`literal`, `natural`, `gloss`, `audit_points[]`) — see back_end_architecture.md §5 for the schema and parser.
- The DB write happens **only on commit**, not on every iteration. Iterations live in client state until the user accepts.
- Quotas are checked **before** dispatching the LLM call; rate limits checked at the edge.

## 5. Data flow — inbound paste

Lighter:

1. User pastes received text into the chat input panel.
2. Client posts to `/api/chats/:id/inbound`.
3. Server validates, applies rate limit, loads prefs.
4. Server calls Claude with the inbound prompt template; streams structured output.
5. Server writes the inbound message in one transaction (target form + source-translation form + gloss + register read).
6. Client renders.

## 6. The Translation Object

Every committed message is one _Translation Object_. The schema is the load-bearing element of the architecture; everything else is plumbing around it.

```ts
type TranslationDirection = "outbound" | "inbound";

type TranslationVersion = {
  id: string; // UUIDv7
  kind: "draft" | "literal" | "natural" | "user_edit" | "ai_refined";
  source_text: string | null; // user's source-language form (always present for outbound)
  target_text: string | null; // target-language form
  created_at: string;
};

type AuditPoint = {
  id: string;
  category: "name" | "register" | "idiom" | "tone" | "ambiguity" | "omission" | "other";
  before: string | null;
  after: string | null;
  rationale: string; // English explanation
  accepted: boolean | null; // null = not yet acted on
};

type TranslationObject = {
  id: string;
  chat_id: string;
  direction: TranslationDirection;
  versions: TranslationVersion[];
  final_target_text: string;
  final_source_text: string; // for outbound: the user's chosen source form; for inbound: the literal pass back-translation
  gloss: string;
  register: { detected: string | null; chosen: string | null; confidence: number };
  dialect_flags: string[]; // e.g., ["kansai-ben"]
  locked_names: { value: string; preserved: boolean }[];
  audit_points: AuditPoint[];
  prefs_snapshot: object; // the prefs that produced this translation, for reproducibility
  model: string; // e.g., "claude-sonnet-4-6"
  created_at: string;
};
```

This object is what the UI renders, what export emits, what the DB stores (across `messages` and `message_versions`), and what every roadmap feature attaches to.

## 7. Tech-stack decisions and rationale

| Layer                  | Choice                                       | Why                                                                                                                                             |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Build tool             | **Vite**                                     | Vendor-neutral; fast dev; standard ESM output. No framework opinions baked in.                                                                  |
| UI framework           | **React 18**                                 | Largest ecosystem; shadcn/ui; LLM-coding-fluency.                                                                                               |
| Routing                | **TanStack Router**                          | Type-safe, file-based, SPA-friendly. No Next.js coupling.                                                                                       |
| Marketing prerendering | **`vite-react-ssg`** (or equivalent)         | Static HTML at build time for SEO; bilingual `[locale]` routes.                                                                                 |
| API framework          | **Hono**                                     | MIT, multi-runtime, streaming-native, type-safe. Runs on Cloudflare Workers, Node, Deno, Bun, Lambda.                                           |
| Hosting                | **Cloudflare Pages + Pages Functions**       | Tokyo PoPs; preview deploys per PR; WAF + DDoS baseline-included; AGPL-clean runtime (`workerd` open source).                                   |
| Language               | TypeScript end-to-end                        | Single mental model; share types between API and UI.                                                                                            |
| Styling                | Tailwind CSS + shadcn/ui                     | Tasteful defaults, owned components (no library lock-in), production-ready.                                                                     |
| Animation              | Framer Motion                                | Small, expressive.                                                                                                                              |
| State                  | TanStack Query + Zustand for UI              | Server state and client UI state separated cleanly.                                                                                             |
| Forms                  | react-hook-form + zod                        | Validation that travels server-side too.                                                                                                        |
| ORM                    | Drizzle                                      | Type-safe; migrations in git; thin and predictable.                                                                                             |
| DB                     | **Supabase Postgres (Tokyo, Postgres-only)** | Standard Postgres; managed backups + PITR; Tokyo region. We don't use Supabase Auth.                                                            |
| Auth                   | **Better Auth** (library, in our Worker)     | MIT TypeScript library; email magic link + Google + Apple + **LINE Login** custom OAuth; auth tables in our Postgres; zero auth-vendor lock-in. |
| LLM                    | Anthropic Claude (Sonnet 4.6 + Haiku 4.5)    | Best-in-class JP nuance; prompt caching; ZDR available. Sonnet for both Free and Pro at v1.                                                     |
| Payments               | Stripe + Stripe Tax (USD only)               | Single price; Stripe Tax handles JP consumption tax + EU VAT + US sales tax + FX.                                                               |
| Email                  | Resend                                       | Solid DX; good deliverability defaults.                                                                                                         |
| Cache / rate limits    | Upstash Redis (Tokyo)                        | Standard Redis protocol; fits Cloudflare Workers via `@upstash/redis` HTTP client.                                                              |
| Storage                | **Supabase Storage**                         | Same project as DB; signed URLs; S3-compatible. Migrate to Cloudflare R2 when voice/multi-region ships.                                         |
| Encryption KMS         | **AWS KMS** (`ap-northeast-1`)               | Dedicated AWS sub-account holding only the envelope-encryption root key.                                                                        |
| Captcha                | Cloudflare Turnstile                         | Friendly UX; first-party with our Cloudflare hosting.                                                                                           |
| Errors                 | Sentry                                       | Industry default.                                                                                                                               |
| Analytics              | PostHog (EU-hosted)                          | Feature flags + product analytics; EU project keeps GDPR posture clean; self-hostable.                                                          |
| Status page / uptime   | Better Stack                                 | Provisioned at `status.nuansu.app`.                                                                                                             |
| Deploy                 | Cloudflare Pages + Supabase                  | Solo-founder operable; JP-local latency; vendor-portable runtime.                                                                               |

Rejected alternatives and why:

- **Next.js + Vercel.** The original v0 pick. Reconsidered: Next.js App Router has had a recurring class of middleware CVEs (CVE-2025-29927 etc.); Vercel's deployment patterns drift hard toward vendor-specific features (ISR, Edge runtime, Server Components) that make migration painful. For an AGPL-licensed SaaS handling personal messages, the security and lock-in calculus tipped to the Vite + Hono + Cloudflare stack.
- **Vue / Nuxt.** Genuinely viable framework, but smaller component ecosystem (no shadcn-vue at React's maturity), lower LLM-assistance fluency for solo development. Picked React for ecosystem.
- **SvelteKit.** Smaller bundles, simpler model, but smaller ecosystem and harder to find prebuilt patterns for SaaS UI. Reasonable alternative if React weren't already a fit.
- **Supabase Auth.** Lower lock-in than Clerk but still a vendor with proprietary user store + JWT scheme. Better Auth runs in our codebase, owns its tables, has zero vendor surface — strictly better for the AGPL-clean / no-lock-in posture.
- **Clerk for auth.** Best-in-class auth UX, but adds a second vendor and bill, and is proprietary. Better Auth gives us the same providers (Google/Apple/LINE/email magic link) without the vendor.
- **Neon Postgres.** Branching for preview DBs is nicer than Supabase, but Neon's nearest region is Singapore — adds ~70–90 ms RTT from Tokyo. Supabase Tokyo wins for JP latency.
- **Pure AWS (RDS + Cognito + S3).** Trades Supabase lock-in for AWS lock-in. Cognito UX is rough, JP localization weak, custom OAuth (LINE) is undocumented. Not a good lock-in trade.
- **Self-hosted everything (Coolify / VPS).** Cheaper at small scale but each piece (Postgres backups, TLS, queues, secrets) is a recurring chore. Not worth the founder's hours.
- **Separate FastAPI backend.** Adds an origin, a deploy pipeline, and CORS to manage with no v1 benefit. Revisit if a Python-specific dependency (Whisper local, etc.) shows up.
- **GraphQL API.** Adds a layer for no v1 win; REST + Hono is enough.
- **Microservices.** Premature.
- **Cloudflare KV instead of Upstash Redis.** Works for caching, but Redis's primitives for sliding-window rate limits and idempotency are easier to reason about and portable.

## 8. Module map

```
nuansu/
├── apps/
│   └── web/                         # Vite + React SPA + Pages Functions
│       ├── src/                     # SPA source
│       │   ├── routes/              # TanStack Router file-based routes
│       │   │   ├── $locale/         # 'en', 'ja' — marketing routes (prerendered)
│       │   │   │   ├── index.tsx           # landing
│       │   │   │   ├── pricing.tsx
│       │   │   │   ├── privacy.tsx
│       │   │   │   └── terms.tsx
│       │   │   ├── auth/            # sign-in, sign-up, onboarding (SPA)
│       │   │   └── app/             # chats, settings, billing (SPA, auth-gated)
│       │   ├── components/          # ui/ (shadcn) + chat/ + settings/ + marketing/
│       │   ├── features/            # translation/, chats/, prefs/, billing/, auth/
│       │   └── lib/                 # client utilities
│       ├── functions/               # Cloudflare Pages Functions
│       │   └── api/[[path]].ts      # mounts the Hono app
│       ├── server/                  # Hono app + server-only modules (db, llm,
│       │   │                        # better-auth config, rate-limit, mailer)
│       │   ├── app.ts               # Hono root
│       │   ├── auth.ts              # Better Auth instance
│       │   ├── db/                  # Drizzle schema + client
│       │   ├── llm/                 # Anthropic wrapper + prompt building
│       │   └── routes/              # /chats, /translate, /webhooks/*
│       ├── public/                  # static assets
│       ├── index.html               # SPA entry
│       ├── vite.config.ts
│       └── wrangler.toml            # Cloudflare Pages config
├── packages/
│   ├── prompts/                     # versioned prompt templates + tests
│   ├── schemas/                     # zod schemas shared between server and client
│   └── i18n/                        # UI i18n keys (en, ja)
├── infra/
│   └── (docs only — no IaC in v1; deploy is service-by-service per deployment.md)
└── docs/                            # this folder
```

A monorepo with one deployed app (Cloudflare Pages = SPA + Functions in one unit) and three shared packages. `prompts` and `schemas` are unit-tested independently of the app build.

## 9. Key cross-cutting concerns

### 9.1 Secrets & configuration

- All secrets via environment variables. `.env.example` checked in; `.env.local` git-ignored.
- Server-only secrets never imported by client modules; enforced by ESLint rule `import/no-restricted-paths` and a strict `vite.config.ts` envPrefix policy (only `VITE_PUBLIC_*` reaches the browser bundle).
- Cloudflare Pages env vars scoped per environment (Preview, Production); managed via `wrangler` or the dashboard.

### 9.2 Observability

- Sentry on both runtimes; release tagging via the Cloudflare Pages build commit SHA.
- A `request_id` propagated from client → server → LLM call; logged at every hop.
- Translation calls log: model, input/output token counts, latency, prompt-cache hit rate, cost estimate.

### 9.3 Cost control

- Daily LLM spend tracked per user via `usage_events`; aggregated nightly.
- Soft alert if daily spend > threshold per user (likely abuse).
- Hard kill-switch env var pauses all LLM calls and renders a graceful banner ("translation paused").

### 9.4 Versioning of prompts

- Prompt templates live in `packages/prompts` with semver. Every translation stores `prompt_version` so we can replay exactly.
- New prompt versions ride out behind a feature flag and are A/B'd on a small fraction.

### 9.5 Internationalisation

- UI strings in JSON files keyed by locale. Default `en`. New locales = a translation pass + RTL audit later.
- The _target language_ of a translation is independent of the UI locale.

### 9.6 Feature flags

- PostHog feature flags. Used for: prompt versions, model tier defaults, quota values, rollout of risky UI changes.

### 9.7 Quality & testing policy

Cross-cutting quality, testing, and CI gate policy lives in [`quality.md`](./quality.md). Highlights: strict TDD; complexity capped via sonarjs (cognitive ≤ 15, cyclomatic ≤ 12); coverage ≥ 80% on non-UI; CRAP score ≤ 30 per function (custom CI script); property-based testing for parsers/reducers/transformations via fast-check; fitness functions for architectural invariants; mutation testing deferred to v2. The bars exist to constrain AI-assisted development — every gate is enforced by CI, not by review etiquette.

## 10. Scaling story

**v1 (0 → 1k users):**

- Single Supabase project in Tokyo (Northeast Asia 1). Single Cloudflare Pages deployment serving from Tokyo PoPs and global edge. Upstash on default plan.
- Vertical-scale Postgres if needed; that's it.

**1k → 10k users:**

- Add a Supabase read replica for analytics queries.
- Move heavy LLM-orchestration to a small Node worker if request paths get cluttered (BullMQ on Upstash).
- Introduce a CDN-cached marketing build separate from the app.

**10k+ or EU traffic > 25%:**

- Region-pair: keep Tokyo as primary, add an EU Supabase project as a read replica (or a second region per user residency).
- Native iOS/Android apps consume the same API.
- Voice / date mode on a dedicated worker tier.

## 11. Roadmap fit (how v2/v3 land without rework)

Each roadmap item maps cleanly to existing structure:

- **Voice in/out.** New worker service that accepts uploads (object storage), produces transcripts, hands off to the same translation pipeline. Stores under `messages.audio_url` + an additional `versions[]` entry of kind `transcript`.
- **Sticker / emoji semantics.** Pure client-side overlay backed by a curated catalog table; no architecture change.
- **Auto-flashcard export.** Read-only over `messages` and `message_versions`; produces an Anki .apkg or CSV.
- **Native apps.** Talk to the existing API. Auth via the same provider.
- **BYO-API-key / E2E.** Staged: BYO-Anthropic-key first (same provider, per-user contract / data-residency / billing — small lift on top of the existing orchestrator), then BYO-other-provider (GPT / Gemini) only if demand justifies the per-provider prompt families and pricing repositioning. Adds a per-user encrypted credential vault; the translation orchestrator chooses provider per user. Detail and rationale: [`questions.md`](./questions.md) "Deferred decisions (v2+)".
- **Date mode.** Live transcription via a websocket on the worker; same Translation Object format with `direction = "transcript"`.

## 12. Risks called out in the architecture

- **LLM provider lock.** Moats on JP nuance are real but Anthropic could change pricing, retire models, or change ZDR terms. Mitigation: the `translation` module abstracts over provider; OpenAI and Google are drop-in fallbacks at degraded quality.
- **Vendor consolidation.** Cloudflare + Supabase are convenient; if pricing turns hostile we've kept them separable. Cloudflare Pages output is a static build + standard Workers (`workerd` is open source; same code runs on Vercel Edge / Lambda@Edge / Deno Deploy). Supabase is portable Postgres + S3-compatible storage. Better Auth is a library in our codebase, not a vendor.
- **Streaming + Workers runtime quirks.** Cloudflare Workers run on `workerd`, which supports a Web-standard subset (fetch, Request/Response, ReadableStream, Web Crypto, IndexedDB-like via Durable Objects). Some Node-flavoured libraries (`crypto.createHash` rather than Web Crypto, etc.) need shims or substitutes. We pin to libraries that ship Workers builds — Hono, Drizzle, Better Auth, `@anthropic-ai/sdk` all do.
- **Prompt-caching coupling.** Aggressive caching ties cost economics to provider behaviour. Track hit rate; alert if it drops.
- **Compliance vs operability.** EU residency might force a second region sooner than expected if EU signups dominate. We pick a Postgres host that supports it.

## 13. Decision record style

Each significant decision should land as a short ADR-style note in `docs/adr/` once implementation starts. The decisions in this doc are the seed set; revisions go in ADRs, not by editing this doc invisibly.

The vendor and product decisions resolved on 2026-04-26 (Cloudflare Pages Tokyo, Supabase Postgres+Storage Tokyo, Better Auth in our Worker, Vite+React+Hono stack, Anthropic Sonnet 4.6 for everyone, USD-only Stripe, broad positioning, EN+JP marketing, LINE Login, AWS KMS, founder = 個人事業主, AGPL-3.0) are the de-facto **ADR-001 through ADR-007** of this project; back-fill them into `docs/adr/` once that folder exists.
