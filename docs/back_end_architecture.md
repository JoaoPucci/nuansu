# Backend Architecture — Nuansu v1

This doc covers the API surface, database schema, LLM orchestration, jobs, rate limits, and observability. It pairs with `architecture.md` (system shape) and `front_end_architecture.md` (client expectations).

## 1. Stack

| Concern            | Choice                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Runtime            | **Cloudflare Workers (`workerd`)**, deployed via Cloudflare Pages Functions, Tokyo PoPs                    |
| Framework          | **Hono** (router, middleware, streaming)                                                                   |
| Language           | TypeScript strict                                                                                          |
| ORM / migrations   | Drizzle ORM + drizzle-kit                                                                                  |
| DB                 | **Supabase Postgres 16 (Northeast Asia 1 / Tokyo)** — Postgres + Storage only; we do not use Supabase Auth |
| ID format          | **UUIDv7** (app-side generated; time-ordered)                                                              |
| Cache + rate limit | Upstash Redis (`@upstash/redis` HTTP client; Workers-friendly)                                             |
| LLM SDK            | `@anthropic-ai/sdk` (Sonnet 4.6 primary; Haiku 4.5 for inbound preview + back-translation)                 |
| Auth               | **Better Auth** (TypeScript library; runs in our Worker; auth tables in our Postgres)                      |
| Payments           | Stripe SDK + webhooks (USD, single price)                                                                  |
| Encryption KMS     | AWS KMS (`ap-northeast-1`, dedicated sub-account)                                                          |
| Email              | Resend SDK                                                                                                 |
| Validation         | zod (shared with frontend)                                                                                 |
| Errors             | Sentry                                                                                                     |
| Logs               | Cloudflare Workers Logs (real-time) + structured JSON via `pino`                                           |
| Background jobs    | Cloudflare Cron Triggers (single binding)                                                                  |

## 2. API surface

REST-ish JSON over HTTPS. Hono router mounted at `/api/*` via Cloudflare Pages Functions (`functions/api/[[path]].ts`). Authenticated via Better Auth session cookies. CSRF for cookie-authenticated mutating endpoints.

### 2.1 Endpoints

| Method   | Path                           | Purpose                                                                                           | Notes                                                      |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `POST`   | `/api/chats`                   | Create a chat                                                                                     | Body: `{ name, target_language, prefs? }`                  |
| `GET`    | `/api/chats`                   | List chats for current user                                                                       | Pagination cursor                                          |
| `GET`    | `/api/chats/:id`               | Fetch a chat with prefs                                                                           |                                                            |
| `PATCH`  | `/api/chats/:id`               | Rename / archive / update meta                                                                    |                                                            |
| `DELETE` | `/api/chats/:id`               | Soft delete (purged in 30d)                                                                       |                                                            |
| `GET`    | `/api/chats/:id/messages`      | Paginated messages                                                                                | Cursor by `created_at`                                     |
| `POST`   | `/api/chats/:id/messages`      | Commit a message                                                                                  | Body is a `TranslationObject`; server validates and stores |
| `GET`    | `/api/chats/:id/messages/:mid` | Single message with full version history                                                          |                                                            |
| `POST`   | `/api/chats/:id/translate`     | **Streaming.** Outbound translation                                                               | SSE; body `TranslateRequest`                               |
| `POST`   | `/api/chats/:id/inbound`       | **Streaming.** Inbound paste translation                                                          | SSE; body `InboundRequest`                                 |
| `GET`    | `/api/prefs`                   | Global prefs for current user                                                                     |                                                            |
| `PUT`    | `/api/prefs`                   | Update global prefs                                                                               |                                                            |
| `GET`    | `/api/chats/:id/prefs`         | Per-chat prefs                                                                                    |                                                            |
| `PUT`    | `/api/chats/:id/prefs`         | Update per-chat prefs                                                                             |                                                            |
| `GET`    | `/api/name-locks`              | Global name locks                                                                                 |                                                            |
| `PUT`    | `/api/name-locks`              | Replace global name locks                                                                         |                                                            |
| `GET`    | `/api/usage`                   | Today's usage and quota state                                                                     |                                                            |
| `POST`   | `/api/account/export`          | Trigger data export job                                                                           | Email delivers the link                                    |
| `POST`   | `/api/account/delete`          | Trigger account deletion                                                                          | Confirmed via email link                                   |
| `POST`   | `/api/auth/[[path]]`           | Better Auth handler — sign-in, sign-up, OAuth callbacks, magic-link verification, session refresh | Mounted as a single catch-all by Better Auth               |
| `POST`   | `/api/webhooks/stripe`         | Stripe webhook receiver                                                                           | Signature-verified                                         |
| `POST`   | `/api/webhooks/email`          | Email provider events (bounces, complaints)                                                       |                                                            |
| `GET`    | `/api/health`                  | Liveness                                                                                          | Pings DB + LLM                                             |

### 2.2 Conventions

- Request and response bodies are JSON unless stated.
- All write endpoints accept an `Idempotency-Key` header; replays return the original response.
- Errors return `{ error: { code, message, details? } }` with stable codes (`unauthorised`, `rate_limited`, `quota_exhausted`, `validation_failed`, `provider_unavailable`, `not_found`, `conflict`, `internal`).
- Pagination is cursor-based: `?cursor=<opaque>&limit=50`. Responses include `next_cursor`.
- Timestamps are ISO 8601 UTC.

### 2.3 Streaming

- `POST /translate` and `/inbound` return `text/event-stream`.
- Each event is `data: <json>\n\n` where `<json>` is one fragment of the partial Translation Object plus a `seq` field.
- A final `event: done\n` closes the stream.
- On error mid-stream: an `event: error\ndata: { code, message }\n\n` then close.

### 2.4 Auth on requests

- Browser cookie session → Hono middleware calls Better Auth's `auth.api.getSession({ headers })` to resolve `userId` and `region`.
- The middleware attaches `c.set("user", session.user)` and `c.set("session", session.session)` for downstream handlers.
- Anonymous routes are explicitly marked; authenticated is the default.
- Service-to-service: no v1 use case beyond webhooks (which use signed payloads).

## 3. Database schema

Drizzle definitions live in `apps/web/server/db/schema.ts`. Postgres-flavoured DDL summary below.

### 3.1 Core tables

```sql
-- ─── Better Auth tables (managed by the library; schema generated by better-auth CLI) ───
-- These are the auth source of truth. Application 'users' (below) extends them with
-- product-specific fields via a 1:1 join on id.

CREATE TABLE auth_users (
  id              text PRIMARY KEY,                     -- Better Auth uses text IDs (UUID-shaped)
  email           citext UNIQUE NOT NULL,
  email_verified  boolean NOT NULL DEFAULT false,
  name            text,
  image           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_accounts (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  provider_id     text NOT NULL,                         -- 'email', 'google', 'apple', 'line'
  account_id      text NOT NULL,                         -- provider's user id
  access_token    text,
  refresh_token   text,
  id_token        text,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);

CREATE TABLE auth_verification_tokens (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,                              -- email for magic links
  value       text NOT NULL,                              -- token
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Application users — product-specific extension of auth_users ───
CREATE TABLE users (
  id              text PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  display_name    text,
  source_language text NOT NULL DEFAULT 'en',
  locale          text NOT NULL DEFAULT 'en',           -- 'en' | 'ja' — drives email templates + JP support routing
  region          text NOT NULL DEFAULT 'jp',           -- 'jp' | 'us' | 'eu' — drives multi-region routing (architecture.md §10)
  is_dogfood      boolean NOT NULL DEFAULT false,       -- excludes from product analytics
  dek_wrapped     bytea,                                -- KMS-wrapped per-user data encryption key
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- A trigger creates a row in `users` whenever a row is created in `auth_users`.

CREATE TABLE preferences_global (
  user_id              text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_target_lang  text NOT NULL DEFAULT 'ja',
  default_register     text,            -- e.g., 'casual', 'teineigo'
  default_naturalness  smallint NOT NULL DEFAULT 50 CHECK (default_naturalness BETWEEN 0 AND 100),
  names_are_sacred     boolean NOT NULL DEFAULT true,
  explain_verbosity    text NOT NULL DEFAULT 'standard',  -- 'terse' | 'standard' | 'verbose'
  preferred_model_tier text NOT NULL DEFAULT 'standard',  -- 'standard' | 'priority'
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE name_locks (
  id          uuid PRIMARY KEY,                        -- UUIDv7
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id     uuid REFERENCES chats(id) ON DELETE CASCADE,  -- null => global lock
  source_form text NOT NULL,
  target_form text,                                          -- optional (e.g., explicit kana)
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_name_locks_user_chat ON name_locks(user_id, chat_id);

CREATE TABLE chats (
  id              uuid PRIMARY KEY,                    -- UUIDv7
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  avatar_color    text,
  target_language text NOT NULL,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chats_user ON chats(user_id) WHERE archived_at IS NULL;

CREATE TABLE preferences_chat (
  chat_id          uuid PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  target_language  text,                       -- override
  register         text,
  naturalness      smallint CHECK (naturalness BETWEEN 0 AND 100),
  my_nickname      text,
  contact_name_src text,
  contact_name_tgt text,
  notes            text,                       -- freeform; included in system prompt
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id               uuid PRIMARY KEY,                   -- UUIDv7
  chat_id          uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction        text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  final_target_text bytea NOT NULL,           -- field-level encrypted
  final_source_text bytea NOT NULL,           -- field-level encrypted
  gloss            bytea,                      -- field-level encrypted
  register_chosen  text,
  register_detected text,
  dialect_flags    text[] NOT NULL DEFAULT '{}',
  prefs_snapshot   jsonb NOT NULL,
  model            text NOT NULL,
  prompt_version   text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX idx_messages_chat_created ON messages(chat_id, created_at DESC);

CREATE TABLE message_versions (
  id          uuid PRIMARY KEY,                        -- UUIDv7
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind        text NOT NULL,                  -- draft | literal | natural | user_edit | ai_refined
  source_text bytea,                           -- encrypted
  target_text bytea,                           -- encrypted
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_message_versions_message ON message_versions(message_id, created_at);

CREATE TABLE audit_points (
  id          uuid PRIMARY KEY,                        -- UUIDv7
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  category    text NOT NULL,                  -- name | register | idiom | tone | ambiguity | omission | other
  before_text text,
  after_text  text,
  rationale   text NOT NULL,
  accepted    boolean,                         -- null = informational only
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_events (
  id            uuid PRIMARY KEY,                      -- UUIDv7
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id       uuid REFERENCES chats(id) ON DELETE SET NULL,
  kind          text NOT NULL,                -- translate_outbound | translate_inbound | refine
  model         text NOT NULL,
  input_tokens  integer NOT NULL,
  output_tokens integer NOT NULL,
  cached_tokens integer NOT NULL DEFAULT 0,
  cost_micro_usd integer NOT NULL,
  request_id    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_events_user_day ON usage_events(user_id, created_at DESC);

CREATE TABLE subscriptions (
  user_id              text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id   text NOT NULL,
  stripe_subscription_id text,
  status               text NOT NULL,          -- trialing | active | past_due | canceled | none
  plan                 text NOT NULL DEFAULT 'free',  -- free | pro
  trial_ends_at        timestamptz,            -- 14-day no-card trial expiry
  current_period_end   timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE waitlist (
  email      citext PRIMARY KEY,
  source     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deletion_requests (
  user_id      text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz NOT NULL,          -- now() + 30 days
  completed_at timestamptz
);

CREATE TABLE export_jobs (
  id           uuid PRIMARY KEY,                      -- UUIDv7
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL,                  -- queued | running | done | failed
  download_url text,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE audit_log (
  id          uuid PRIMARY KEY,                      -- UUIDv7
  user_id     text REFERENCES users(id) ON DELETE SET NULL,
  actor       text NOT NULL,                  -- user | system | admin
  action      text NOT NULL,                  -- account_created | session_started | export_requested | data_deleted | ...
  ip          inet,
  user_agent  text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

Notes:

- **Application IDs (chats, messages, etc.) are UUIDv7** generated app-side (`uuid` column type, time-ordered, sortable). Use a small library (`uuidv7` npm) — avoids the Postgres-extension dependency and keeps generation portable.
- **Better Auth IDs (`auth_users.id`, `auth_sessions.id`, `auth_accounts.id`, `users.id`) are `text`** because Better Auth issues string IDs. They're UUID-shaped but the column type stays `text` to match Better Auth's schema generator output. The application `users.id` is `text` (FK to `auth_users.id`); all `user_id` references throughout the schema are `text`.
- `bytea` columns store envelope-encrypted ciphertext (see `security.md §4`).
- Soft deletes (`deleted_at`) on user-visible content; hard purge via background job per compliance.

### 3.2 Indexes

The most-read patterns:

1. `messages` by `(chat_id, created_at DESC)` — chat scroll.
2. `chats` by `(user_id)` filtered to `archived_at IS NULL` — chat list.
3. `usage_events` by `(user_id, created_at DESC)` — quota checks (also memoised in Redis).

### 3.3 Tenancy / authorisation

- Every application row references `user_id` (directly or transitively via `chat_id`). Every query must filter by `user_id`.
- A Drizzle wrapper enforces this at query-builder level: `db.forUser(user)` returns a constrained client. Bypassing is grep-able and CI-banned.
- **Postgres RLS is enabled** on every user-scoped application table as defence-in-depth. Because Better Auth doesn't set `auth.uid()` like Supabase Auth does, RLS policies use a Postgres session-local variable set at the start of each transaction:
  ```sql
  SET LOCAL nuansu.user_id = '<uuid>';
  ```
  The Drizzle wrapper sets this from the Hono session; RLS policies read `current_setting('nuansu.user_id', true)`. The app-layer wrapper is the primary control; RLS catches bugs.
- Better Auth tables (`auth_users`, `auth_sessions`, etc.) are managed by the library and have their own access discipline — never queried directly outside `server/auth.ts`.

## 4. Auth — Better Auth in our Worker

Better Auth runs as a library inside the Hono app. No external auth service.

### 4.1 Configuration shape

```ts
// server/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: false }, // magic links only
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMagicLinkEmail(user.email, url, user.locale ?? "en");
    },
  },
  socialProviders: {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "line",
          clientId: env.LINE_LOGIN_CHANNEL_ID,
          clientSecret: env.LINE_LOGIN_CHANNEL_SECRET,
          authorizationUrl: "https://access.line.me/oauth2/v2.1/authorize",
          tokenUrl: "https://api.line.me/oauth2/v2.1/token",
          userInfoUrl: "https://api.line.me/v2/profile",
          scopes: ["profile", "openid"],
        },
      ],
    }),
  ],
  session: { cookieCache: { enabled: true, maxAge: 60 * 5 } }, // 5min cookie cache
  trustedOrigins: [env.APP_URL],
});
```

### 4.2 Hono mount

```ts
// server/app.ts
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```

### 4.3 Session middleware

```ts
const requireAuth = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: { code: "unauthorised" } }, 401);
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
};
```

### 4.4 Why this shape

- **Zero auth-vendor lock-in.** Better Auth is MIT, runs anywhere TypeScript runs.
- **Tokyo-local sessions.** Auth tables in our Tokyo Postgres; session validation hits Tokyo. Optionally a 5-min cookie-side cache to avoid even the DB hit on most requests.
- **JP locale email templates.** The `sendVerificationEmail` hook routes to the EN or JP template based on `user.locale`.
- **LINE Login as a generic OAuth provider** — ~30 lines of config; no custom adapter.

## 5. The translation orchestrator

Single module: `apps/web/server/translation/`. All LLM calls go through it.

### 4.1 Inputs (TranslateRequest)

```ts
type TranslateRequest = {
  draft_source_text: string;
  prior_translation?: TranslationObject; // when refining
  refine_instruction?: string;
  prefs_snapshot: {
    source_lang: string;
    target_lang: string;
    register: string | null;
    naturalness: number;
    my_nickname: string | null;
    contact_name_src: string | null;
    contact_name_tgt: string | null;
    notes: string | null;
    explain_verbosity: "terse" | "standard" | "verbose";
  };
  name_locks: { source_form: string; target_form?: string }[];
  recent_thread: { author: "mine" | "theirs"; source: string; target: string }[]; // last N
  idempotency_key: string;
  user_id: string;
};
```

### 4.2 Output (TranslationStreamChunk)

The stream emits typed fragments that build up to a Translation Object:

```ts
type TranslationStreamChunk =
  | { type: "literal"; text_delta: string }
  | { type: "natural"; text_delta: string }
  | { type: "gloss"; text_delta: string }
  | { type: "register"; detected?: string; chosen?: string; confidence?: number }
  | { type: "dialect"; flags: string[] }
  | { type: "name_check"; name: string; preserved: boolean }
  | { type: "audit_point"; point: AuditPoint }
  | { type: "done" }
  | { type: "error"; code: string; message: string };
```

The server fans the LLM's structured tokens out into these chunks. The LLM is asked for JSON; a streaming JSON parser (or Anthropic's native partial-JSON handling) emits chunks as soon as a field stabilises.

### 4.3 System prompt design

Stored in `packages/prompts` as versioned files. The v1 prompt has these sections, in order:

1. **Role.** "You are Nuansu, a translation copilot. Anti-drift is the prime directive."
2. **Anti-drift rules** — explicit, numbered:
   - Reproduce proper names verbatim from the user's source. Never katakana-ify, kanji-ify, or substitute.
   - Never edit the user's source draft. You translate from it; you don't rewrite it.
   - Always produce both a literal and a natural pass.
   - When register is provided, match it exactly; when not, infer from `naturalness`.
   - When you change anything noteworthy in the natural pass relative to the literal, emit an audit point.
3. **Context** — language pair, register, naturalness, contact context, notes.
4. **Name locks** — the list, instructions to preserve verbatim.
5. **Output schema** — strict JSON, fields as in §5.2.
6. **Few-shot examples** — 3 pairs covering name preservation, register match, idiom adaptation.

The first three sections are aggressively cached. Per-call context is small.

### 4.4 Model routing

```
default (free + paid)   -> Claude Sonnet 4.6
priority (paid)         -> Claude Sonnet 4.6 with reasoning thinking budget
inbound preview         -> Claude Haiku 4.5
back-translation        -> Claude Haiku 4.5
```

**v1 policy:** Sonnet 4.6 for both Free and Pro outbound translations — the JP-nuance bar is the product moat and Free tier is bounded by the daily quota (10/day), not by a cheaper model. A `LLM_FREE_TIER_DOWNGRADE` feature flag is wired up but off by default; flip to Haiku-on-free if costs spike or abuse appears.

### 4.5 Reference-check (back-translation diff)

After the natural pass is finalised on commit, a background task back-translates the natural target text into source-language and computes a diff against the user's draft. Significant divergence flags an audit point retroactively (becomes visible on the message history). Cheap (Haiku); doesn't block the foreground.

### 4.6 Retries and timeouts

- Provider call timeout: 25s for streaming, 12s for non-streaming.
- Single retry on `provider_unavailable` (5xx, timeouts) with 500ms backoff.
- Translation-specific JSON-parse failure: regenerate once with stricter "valid JSON only" instruction.

### 4.7 Idempotency

- Each translate request includes an `Idempotency-Key`.
- Server caches `(user_id, idempotency_key)` → response in Redis for 10 minutes; replays return the cached stream from a buffer (or a sentinel "in-flight" if the original is mid-stream).

### 4.8 Cost & token accounting

- Every LLM call writes a `usage_events` row with `input_tokens`, `output_tokens`, `cached_tokens`, `cost_micro_usd`.
- Daily roll-up via SQL view (or scheduled materialised view) for the usage UI.

## 6. Quotas and rate limits

Two layers:

1. **Quota** — per-user daily translation count. Configured by tier:
   - Free: **10 per rolling 24 hours**.
   - Pro: functionally uncapped, with a **1,000/day soft cap** for abuse detection and a per-user daily $ kill-switch.
   - Trial (14-day no-card): same as Pro for the trial duration; downgrades to Free if no card is added.

   Implementation: Redis sorted set per user keyed by epoch ms; on each translate request, count entries within 24h. Atomic via Lua script.

2. **Rate limit** — short-window abuse bound. Stricter for unauthenticated endpoints (signup, login). Implementation: Upstash `@upstash/ratelimit` with sliding-window.

| Endpoint                        | Limit               |
| ------------------------------- | ------------------- |
| `POST /signup`                  | 5 / IP / hour       |
| `POST /login`                   | 10 / IP / hour      |
| `POST /api/chats/:id/translate` | 30 / user / minute  |
| `POST /api/chats/:id/inbound`   | 60 / user / minute  |
| `PUT /api/prefs`                | 20 / user / minute  |
| Other authed                    | 120 / user / minute |

## 7. Background jobs

v1 uses lightweight scheduled jobs via **Cloudflare Cron Triggers** bound to a separate Worker (or to the same Pages project). No queue server.

| Job                      | Cadence                                         | Purpose                                                     |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------- |
| `back_translation_check` | per-write trigger (server action invokes async) | Reference-check; writes audit points                        |
| `usage_rollup`           | nightly                                         | Daily/monthly aggregates per user                           |
| `purge_soft_deleted`     | hourly                                          | Delete soft-deleted chats/messages older than 30d           |
| `process_export_queue`   | every 5 min                                     | Build JSON archives, upload, email link                     |
| `process_deletion_queue` | hourly                                          | Hard-delete users whose 30d window elapsed                  |
| `prompt_cache_warm`      | hourly                                          | Re-issue a cheap call to keep the cached system prompt warm |
| `health_check_alerts`    | every 5 min                                     | DB ping, LLM ping, alert on failure                         |

When voice / date-mode arrives, a real worker (BullMQ on Upstash) replaces these.

## 8. Webhooks

### 7.1 Stripe

- Single endpoint, signature-verified (`Stripe-Signature` HMAC).
- Idempotent: store `event.id` in a `webhook_events` table; ignore duplicates.
- Events handled: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
- Side effects: update `subscriptions`, update entitlements, send transactional email.

### 7.2 Email provider

- `email.delivered`, `email.bounced`, `email.complained`. On hard bounce or complaint, set the user's email status; halt further marketing/transactional sends until corrected.

## 9. LLM provider configuration

- Anthropic API key stored in Cloudflare Pages env per environment.
- Zero-data-retention agreement signed; reflected in `Anthropic-No-Train: true` semantics where the provider exposes them.
- A single `AnthropicClient` wrapper in `server/llm/anthropic.ts` adds: structured-output validation, prompt caching headers, request_id propagation, latency + token logging.

## 10. Security responsibilities (server-side)

Detailed in `security.md`. Highlights enforced server-side:

- Authentication on every authed route via middleware.
- Authorisation (ownership) enforced at the data-access layer.
- CSRF protection on POST/PUT/DELETE handlers via Hono's CSRF middleware (origin + double-submit token check).
- Input validation via zod at the edge of every handler.
- Output encoding: never inject user-supplied text into HTML; everything is JSON.
- Field-level encryption of message content using envelope encryption (see security.md §4).
- Webhook signature verification on every webhook.

## 11. Observability

- Structured logs via `pino`. Required fields: `request_id`, `user_id` (if known), `route`, `latency_ms`, `status`, plus route-specific metadata.
- Sentry for exceptions; tagged with `release` and `request_id`.
- Translation calls log: `model`, `prompt_version`, `cached_tokens`, `input_tokens`, `output_tokens`, `cost_micro_usd`.
- A `/api/health` endpoint pings DB and LLM with cheap calls; uptime monitor watches it.

## 12. Migrations

- `drizzle-kit` generates migrations from schema diffs; reviewed and committed.
- A migration is applied via `drizzle-kit migrate` in CI on the production branch after the build but before traffic switch (no data destruction during a rolling deploy).
- Backwards-compatible only. Drops/renames go through a two-phase deploy (add new, dual-write, switch reads, drop old).

## 13. Testing strategy

| Layer        | Tool                             | Coverage                                                                                          |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Unit         | Vitest                           | Schemas, utilities, the SSE parser, the rate-limit Lua, the prompt builder                        |
| Integration  | Vitest + ephemeral Postgres      | DB layer, ownership wrappers, key route handlers                                                  |
| Contract     | zod schemas shared with frontend | Compile-time guarantee                                                                            |
| Prompt evals | Custom harness                   | Golden-set translations scored by a JP-native reviewer; regression triggers per prompt-version PR |
| Load         | k6                               | Read paths and a simulated translate flow with stubbed LLM                                        |
| Chaos        | Manual                           | LLM 5xx, DB connection blip, Stripe webhook replay                                                |

Prompt evals are non-negotiable: a regression in `audit_point` accuracy or `name preservation` blocks the prompt-version PR.

## 14. Local development

- `docker compose up` provides Postgres + Redis (stub of Upstash via `redis:7`).
- LLM calls in dev hit a stub by default (`LLM_PROVIDER=stub`) that replays a recorded canned response; pass `LLM_PROVIDER=anthropic` to hit live.
- Stripe in dev uses the Stripe CLI for webhook tunnelling.
- `pnpm dev` runs **`vite dev`** for the SPA on `:5173` and **`wrangler pages dev`** for the Pages Functions on `:8788`. Vite proxies `/api/*` to wrangler so the SPA sees one origin.
- Better Auth's `auth.api.getSession` works the same in dev and prod — auth tables seeded by `pnpm seed`.

## 15. Open questions (backend-flavoured)

All previously listed backend open questions have been resolved (UUIDv7 chosen, Supabase Tokyo locked, RLS + app-layer wrapper both on, rolling 24h quota, Sonnet for everyone v1). See [`./questions.md`](./questions.md) for any remaining cross-cutting TODOs.
