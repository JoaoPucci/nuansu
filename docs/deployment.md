# Deployment — Nuansu v1

This is a generic deployment guide. It is safe to commit to a public repo: it contains no secrets, no real account names, no user-specific values. Replace anything in `<angle-brackets>` with your own values.

## 1. Topology

```
                  ┌────────────────────────────────────────┐
                  │  Cloudflare Pages (Tokyo PoPs + edge)   │
                  │   • Static SPA (Vite + React)           │
                  │   • Pages Functions = Hono Worker       │
                  │   • Pages Cron Triggers (jobs)          │
                  └──────────┬──────────────────┬───────────┘
                             │                  │
                  ┌──────────▼──────────┐  ┌────▼───────────┐
                  │ Supabase            │  │ Upstash Redis   │
                  │ Northeast Asia 1    │  │ region: tokyo   │
                  │ (Tokyo)             │  │                 │
                  │  • Postgres         │  └─────────────────┘
                  │  • Storage          │
                  │  (Better Auth tables│
                  │   live in Postgres) │
                  └──┬──────────────────┘
                     │
        ┌────────────┴────────┐  ┌────────────┐  ┌────────────┐
        │ Anthropic           │  │ Stripe     │  │ Resend     │
        │ (USD pricing)       │  │            │  │            │
        └─────────────────────┘  └────────────┘  └────────────┘

  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  ┌──────────────┐
  │ Sentry      │  │ PostHog EU  │  │ AWS KMS          │  │ Cloudflare   │
  │             │  │             │  │ ap-northeast-1   │  │ Turnstile    │
  └─────────────┘  └─────────────┘  └──────────────────┘  └──────────────┘

  OAuth (no proxy — direct user redirect):
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ Google  │  │ Apple   │  │ LINE    │
  └─────────┘  └─────────┘  └─────────┘
```

All services are pay-as-you-go and have free or cheap tiers suitable for a pre-launch deployment. The biggest concentration is **Cloudflare** (hosting + WAF + DDoS + captcha) and **Supabase Tokyo** (Postgres + Storage). Auth runs in our Worker via Better Auth — no auth vendor.

## 2. Required services

You need accounts and minimal setup for:

| Service                                                    | Purpose                                                          | Env scoped                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cloudflare Pages                                           | Hosting (SPA + Pages Functions for API), Tokyo PoPs              | Project per environment (Preview deploys per branch + Production)  |
| Cloudflare (DNS, WAF, Turnstile, Cron Triggers, R2 future) | DNS + edge security + captcha + scheduled jobs                   | One zone for `nuansu.app`                                          |
| Supabase                                                   | **Postgres + Storage** (no Auth), Northeast Asia 1 (Tokyo)       | Separate project per environment                                   |
| Upstash                                                    | Redis (rate limit + cache), Tokyo region                         | Separate DB per environment                                        |
| Anthropic                                                  | LLM                                                              | One workspace; per-environment API keys                            |
| Stripe                                                     | Payments (USD) + Stripe Tax                                      | Test mode for dev/staging, Live for production                     |
| Resend                                                     | Transactional email (Better Auth magic links + Stripe receipts)  | One account; verified sending domain                               |
| Google Cloud Console                                       | Google OAuth client                                              | One project; OAuth client per environment                          |
| Apple Developer                                            | Apple Sign-in Service ID + key                                   | One team; one Service ID; per-env redirect URLs                    |
| LINE Developers Console                                    | LINE Login channel                                               | One Provider; one channel per environment                          |
| AWS KMS                                                    | Envelope-encryption root key                                     | Dedicated AWS sub-account; CMK per environment in `ap-northeast-1` |
| Sentry                                                     | Errors                                                           | Project per environment                                            |
| PostHog                                                    | Product analytics, EU-hosted                                     | Project per environment                                            |
| Better Stack                                               | Status page + uptime monitoring                                  | One project                                                        |
| Domain registrar                                           | DNS (registrar can be anywhere; nameservers point at Cloudflare) | One domain (`nuansu.app`)                                          |

## 3. Environment variables

Place in Cloudflare Pages as project environment variables (Preview + Production scoped); commit `.env.example` as documentation. Names below are illustrative and can be renamed in code.

```
# General
APP_URL=https://nuansu.app
APP_ENV=production            # local | preview | production
DEFAULT_LOCALE=en             # en | ja

# Supabase (Postgres + Storage only — no Auth)
# Three Postgres roles per back_end_architecture.md §3.3 (defence-in-depth):
#   nuansu_app      — application code (Hono routes via db.forUser); no access to auth_* tables, no BYPASSRLS
#   nuansu_auth     — Better Auth library (server/auth.ts only); no access to application tables
#   nuansu_migrate  — DDL only, used from CI; owns the schema
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_PROJECT_REF=<your-project-ref>
SUPABASE_SERVICE_ROLE_KEY=<jwt>          # for storage signed-URLs from the server
DATABASE_URL=postgres://nuansu_app:...?sslmode=verify-full         # pooled, app-runtime (role: nuansu_app)
AUTH_DATABASE_URL=postgres://nuansu_auth:...?sslmode=verify-full   # pooled, used only by server/auth.ts (role: nuansu_auth)
DIRECT_DATABASE_URL=postgres://nuansu_migrate:...                  # non-pooled, migrations only, CI-only (role: nuansu_migrate)

# Better Auth (runs in our Worker)
BETTER_AUTH_SECRET=<32-byte-hex>         # signs sessions
BETTER_AUTH_URL=https://nuansu.app

# OAuth providers (Better Auth picks these up)
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<secret>
APPLE_CLIENT_ID=<services-id>            # com.nuansu.signinwithapple
APPLE_CLIENT_SECRET=<jwt-or-key-id>
LINE_LOGIN_CHANNEL_ID=<channel-id>
LINE_LOGIN_CHANNEL_SECRET=<channel-secret>

# Redis (Upstash, Tokyo) — HTTP client, Workers-friendly
UPSTASH_REDIS_REST_URL=https://<region>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL_PRIMARY=claude-sonnet-4-6
ANTHROPIC_MODEL_BUDGET=claude-haiku-4-5

# Stripe (USD-only at v1)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=<your-stripe-price-id>

# Email
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=Nuansu <hello@nuansu.app>
RESEND_FROM_ADDRESS_JP=Nuansu <hello-jp@nuansu.app>

# Encryption (envelope) — AWS KMS
KMS_PROVIDER=aws
KMS_KEY_ID=arn:aws:kms:ap-northeast-1:<aws-account-id>:key/<key-id>
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=<scoped-iam-user>
AWS_SECRET_ACCESS_KEY=<secret>

# Captcha
TURNSTILE_SITE_KEY=<site-key>            # client-safe; prefix with VITE_PUBLIC_ for the SPA
TURNSTILE_SECRET_KEY=<secret>            # server-only

# Observability
SENTRY_DSN=https://...ingest.sentry.io/...
SENTRY_AUTH_TOKEN=sntrys_...             # used at build time only
POSTHOG_KEY=phc_...
POSTHOG_HOST=https://eu.posthog.com

# Feature flags / safety
LLM_KILL_SWITCH=false
LLM_FREE_TIER_DOWNGRADE=false            # flip to route Free users to Haiku
DAILY_FREE_QUOTA=10
MAX_DAILY_USER_USD=2.00
TRIAL_DAYS=14
```

Client-bundle exposure: only env vars prefixed `VITE_PUBLIC_*` reach the browser bundle (e.g., `VITE_PUBLIC_TURNSTILE_SITE_KEY`, `VITE_PUBLIC_POSTHOG_KEY`, `VITE_PUBLIC_SENTRY_DSN`). Everything else stays server-side. `lib/env.ts` validates server vars with zod at boot; missing or malformed fails fast.

## 4. Domain & DNS

- Root domain: `nuansu.app`. Nameservers point at Cloudflare (free DNS plan).
- Subdomains:
  - `nuansu.app` — marketing + app on the same origin.
  - `staging.nuansu.app` — staging environment (Cloudflare Pages preview alias).
  - `status.nuansu.app` — status page (Better Stack).
- Records:
  - `CNAME` apex (Cloudflare CNAME flattening) → Cloudflare Pages project.
  - DKIM + SPF + DMARC for Resend (Resend's setup wizard provides exact records).
  - CAA records limiting issuance to Cloudflare's CA.
- TLS automatic via Cloudflare (Universal SSL).
- WAF + DDoS + bot management automatic on the Cloudflare zone.

## 5. Initial provisioning steps

Run once per environment.

### 5.1 Supabase project (DB + Auth + Storage)

1. Create a Supabase project in **Northeast Asia 1 (Tokyo)**.
2. Note the project ref, anon key, service role key, JWT secret, and connection strings (pooled + direct).
3. Apply migrations: `pnpm drizzle:migrate` against `DIRECT_DATABASE_URL`.
4. Verify: `pnpm drizzle:check` passes.
5. Confirm point-in-time recovery (PITR) is enabled and backup retention ≥ 7 days.
6. **Enable RLS** on every user-scoped table. The migration generator emits policies matching the app-layer `db.forUser` filter; review and apply.
7. Create a Postgres trigger on `auth.users` insert that mirrors the new row into the application `users` table.

### 5.2 Redis

1. Create an Upstash database in Tokyo region.
2. Note `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN`.

### 5.3 Better Auth + OAuth providers

Better Auth runs inside our Hono Worker; there is no auth-vendor dashboard. Provisioning is done at the OAuth providers and via app config.

1. **Generate `BETTER_AUTH_SECRET`** — `openssl rand -hex 32` — store in Cloudflare env.
2. **Google Cloud Console**:
   - Create an OAuth 2.0 Client ID (Web application).
   - Authorized JavaScript origins: `https://nuansu.app` (and preview URLs).
   - Authorized redirect URIs: `https://nuansu.app/api/auth/callback/google`.
   - Note client ID + secret → Cloudflare env.
3. **Apple Developer**:
   - Create a Services ID (e.g., `com.nuansu.signinwithapple`).
   - Configure Sign in with Apple; redirect URI `https://nuansu.app/api/auth/callback/apple`.
   - Generate a key for Sign in with Apple; download the `.p8`.
   - Better Auth's Apple provider takes the team ID + key ID + p8 contents (typically composed into a JWT signing secret).
4. **LINE Developers Console**:
   - Create a Provider (e.g., "Nuansu").
   - Create a LINE Login channel (not Messaging API). Region: Japan.
   - Scopes: `profile`, `openid` (no `email` or `friends` at v1).
   - Callback URL: `https://nuansu.app/api/auth/callback/line`.
   - Note Channel ID + Channel secret → Cloudflare env.
   - Configure the channel name, icon, and consent-screen description in JP.
5. **Email templates** for magic link / verification / sign-in are owned by Better Auth + Resend in our codebase. Two templates per event: `en` and `ja`. The `ja` template renders from `RESEND_FROM_ADDRESS_JP`.
6. **DB trigger** mirrors new `auth_users` rows into the application `users` table:

   ```sql
   CREATE FUNCTION mirror_user() RETURNS TRIGGER AS $$
   BEGIN
     INSERT INTO users (id, locale, region) VALUES (NEW.id, 'en', 'jp')
     ON CONFLICT DO NOTHING;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER mirror_user_after_insert
   AFTER INSERT ON auth_users FOR EACH ROW EXECUTE FUNCTION mirror_user();
   ```

7. Run `pnpm better-auth migrate` (or apply Better Auth's generated SQL) once before first deploy.

### 5.4 Anthropic

1. Create a workspace.
2. Sign DPA + zero-data-retention agreement (ask Anthropic support; not always self-serve).
3. Generate API keys per environment.
4. Confirm prompt-caching availability in the response of a probe call.

### 5.5 Stripe

1. Activate the account. **Onboard as 個人事業主** (Japan sole proprietor): provide My Number, JP residence card / driver's licence, JP bank account.
2. Create one product: **"Nuansu Pro"** with a single recurring USD price of **$12/month**. Note the price ID. (No annual plan at v1.)
3. Enable **Stripe Tax** — the JP consumption tax (10%) line and FX conversion are handled automatically; JP users see the converted JPY amount at checkout.
4. Confirm enabled payment methods: Visa, Mastercard, Apple Pay, Google Pay (default for individual onboarding). Request **JCB** approval from Stripe Support — typically 1–3 days. **Konbini** is deferred until incorporation or specific Stripe approval.
5. Configure 14-day free trial with no card required: subscriptions created via `trial_period_days=14`, `payment_behavior=default_incomplete`. Customer Portal lets users add card mid-trial.
6. Configure Customer Portal (cancel, update payment, download invoice).
7. Add webhook: `https://nuansu.app/api/webhooks/stripe`. Subscribe to: `checkout.session.completed`, `customer.subscription.{created,updated,deleted,trial_will_end}`, `invoice.payment_succeeded`, `invoice.payment_failed`. Note signing secret.
8. Test mode equivalent for dev / preview environments.

### 5.6 Resend

1. Create a project.
2. Verify the sending domain (`nuansu.app`); add DKIM + SPF + DMARC records.
3. Add the API key to env vars.
4. Configure webhook: `https://nuansu.app/api/webhooks/email`. Subscribe to bounce / complaint events.

### 5.7 Sentry

1. Create a project ("nuansu-web").
2. Add the DSN to env vars.
3. Configure source map upload during the build (`@sentry/vite-plugin`); release tagging via Cloudflare Pages commit SHA.
4. Configure data scrubbing rules; verify message-content redaction with a test event.

### 5.8 PostHog

1. Create an EU project ("nuansu").
2. Add API key to env vars.
3. Define core events (per `front_end_architecture.md §14`).
4. Set up feature flags: `prompt_version`, `quota_free_daily`, `enable_priority_model`.

### 5.9 Supabase Storage

1. In the Supabase dashboard → Storage, create a bucket `avatars` (public-read, signed-upload).
2. Configure CORS for origins: `https://nuansu.app` and preview deploys.
3. v2: add `voice` (private) when voice features ship.

### 5.10 LINE Login

1. In the [LINE Developers Console](https://developers.line.biz/), create a Provider for Nuansu.
2. Create a LINE Login channel; v1 scopes: `profile`, `openid`. **Do not** request `email` or `friends` scope at v1.
3. Note the Channel ID and Channel secret.
4. Add the Supabase callback URL (`https://<your-project-ref>.supabase.co/auth/v1/callback`) to the channel's callback list.
5. Configure the channel's name, icon, and consent-screen description in JP.

### 5.11 AWS KMS (envelope-encryption root key)

1. Create a dedicated AWS sub-account just for KMS — it should hold no other resources.
2. In `ap-northeast-1` (Tokyo), create a Customer Managed Key (CMK) with:
   - Symmetric encryption.
   - Key rotation enabled (annual).
   - Key policy allowing `kms:GenerateDataKey` and `kms:Decrypt` to a single IAM user.
3. Create the IAM user; generate access key + secret. Store these in Cloudflare Pages env (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).
4. Enable CloudTrail in this sub-account; ship logs to a write-only S3 bucket with object lock (90 days).
5. Note the key ARN as `KMS_KEY_ID`.

### 5.12 Cloudflare Pages

1. Create a Cloudflare account and add `nuansu.app` as a zone.
2. Cloudflare → Pages → Create project → Connect to GitHub → select the repo.
3. Configure build:
   - Framework preset: **None** (Vite is detected but we override).
   - Build command: `pnpm build`.
   - Build output directory: `apps/web/dist`.
   - Functions directory: `apps/web/functions` (auto-detected if present).
4. Configure environment variables for Production and Preview (paste from §3 of this doc).
5. Add custom domain: `nuansu.app` → Cloudflare auto-routes the apex.
6. Enable Cron Triggers in `wrangler.toml` for the scheduled jobs (see `back_end_architecture.md §7`).
7. Confirm Pages Functions is enabled and `functions/api/[[path]].ts` is mounted.
8. Verify a deployment lands; check the Pages URL.

## 6. CI/CD

GitHub Actions workflow:

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test:unit
      - run: pnpm test:e2e:ci # uses stubbed LLM + ephemeral DB

  # Preview deploys are handled automatically by Cloudflare Pages on every push,
  # so we only run validation in CI. Cloudflare picks up the build from `main`
  # and from PR branches and produces a preview URL per deployment.

  production-migrations:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm drizzle:migrate # app schema
        env:
          DIRECT_DATABASE_URL: ${{ secrets.DIRECT_DATABASE_URL }}
      - run: pnpm better-auth:migrate # Better Auth schema
        env:
          DIRECT_DATABASE_URL: ${{ secrets.DIRECT_DATABASE_URL }}
      # Cloudflare Pages auto-deploys on the same push; no manual deploy step needed.
```

Secrets used by CI live in GitHub Actions secrets:

- `DIRECT_DATABASE_URL` (production migrations)
- `SENTRY_AUTH_TOKEN` (source map upload during build, picked up by `@sentry/vite-plugin`)

(Cloudflare Pages handles its own deploy on push to the connected GitHub repo; no Cloudflare API token needed in GitHub Actions for deploys.)

## 7. Branching & release

- `main` is always deployable; PRs require green CI to merge.
- Each PR gets a Cloudflare Pages Preview deployment at `<branch>.<project>.pages.dev` with a Preview-environment DB schema (seeded automatically).
- Production deploys happen on merge to `main` after migrations.
- Migrations are forward-compatible only; for incompatible changes, follow the two-phase pattern (add → dual-write → switch reads → drop).

## 8. Backups & disaster recovery

- DB host's PITR enabled; daily snapshot retained ≥ 7 days, weekly ≥ 30 days.
- Quarterly restore drill: spin up a fresh DB from a recent snapshot in staging; smoke-test signin and translation.
- KMS key never deleted; rotated per provider's recommendation; old versions retained for re-wrap.
- Object storage versioning enabled.
- Recovery objectives:
  - RTO (recovery time): 4 hours.
  - RPO (recovery point): 1 hour.

## 9. Observability

- Cloudflare Workers Logs streamed (real-time tail via `wrangler pages deployment tail`); longer retention via Better Stack.
- Sentry with source maps; release tagging via the build's commit SHA.
- Uptime monitor pings `/api/health` from at least two regions every 60s.
- Status page on `status.nuansu.app` linked from the marketing footer.
- Cost alerts: Anthropic + Cloudflare + Supabase + AWS configured for monthly spend thresholds.

## 10. Region strategy

Day-one: **Tokyo primary** — Cloudflare Pages (Tokyo PoPs) + Supabase Northeast Asia 1 + Upstash Tokyo + AWS KMS `ap-northeast-1`. Lowest latency to the JP-primary user base. EU users are served from Tokyo at v1; this is GDPR-compatible because Japan has an EU adequacy decision.

When EU traffic exceeds ~25% (or earlier, if EU users explicitly request residency):

1. Provision a second Supabase project in an EU region.
2. Configure user routing on signup: EU IP → EU project; record region in `users.region`.
3. Application reads/writes by region; cross-region failover is _not_ in v1 (each region is independent).
4. Backups separate per region.

## 11. Pre-launch deploy checklist

- [ ] Production env vars set in Cloudflare Pages; smoke test boot.
- [ ] Supabase migrations applied (app schema + Better Auth schema); row counts as expected; RLS policies confirmed via the test suite.
- [ ] Better Auth: email magic-link, Google, Apple, **LINE** sign-in verified end-to-end.
- [ ] Stripe: live-mode checkout works for one JP tester; consumption tax line item visible; webhook signature verified end-to-end.
- [ ] Resend: domain verified; deliverability tested to gmail/outlook/icloud; JP template renders correctly with JP characters.
- [ ] Anthropic: live API call returns successfully; ZDR confirmed.
- [ ] AWS KMS: a deliberate encrypt → decrypt round-trip succeeds; CloudTrail event landed in the write-only bucket.
- [ ] Sentry: a deliberate test error captured with redaction working.
- [ ] PostHog: a test event landed; opt-in banner verified for EU IPs.
- [ ] Turnstile: signup-form challenge verified.
- [ ] CSP, HSTS, secure cookies verified via Mozilla Observatory or similar.
- [ ] Lighthouse score ≥ 90 on the four mobile metrics — both `en` and `ja` locales.
- [ ] Backups: latest snapshot present; restore drill ran in the last 30 days.
- [ ] Status page live (Better Stack); uptime monitor active.
- [ ] Cost alarms armed (Anthropic, Cloudflare, Supabase, AWS).
- [ ] Privacy policy, ToS, sub-processor list, contact page live in **EN and JP**.
- [ ] `support-jp@`, `privacy-jp@` mailboxes live with JP-language acknowledgement template.

## 12. Local development

```sh
pnpm install
cp .env.example .env.local           # fill in dev values
docker compose up -d                  # postgres + redis
pnpm drizzle:migrate                  # app schema
pnpm better-auth:migrate              # Better Auth schema
pnpm dev                              # vite dev (5173) + wrangler pages dev (8788)
```

Notes:

- LLM defaults to a stub in dev (`LLM_PROVIDER=stub`). Pass `LLM_PROVIDER=anthropic` to hit live.
- Stripe in dev uses the Stripe CLI (`stripe listen`) to forward webhooks to `http://localhost:8788/api/webhooks/stripe`.
- Better Auth runs in the Pages Functions Worker; OAuth provider configs in `.env.local` use test/dev credentials.
- Seed data via `pnpm seed` (creates a test user + a sample chat with messages).

## 13. Tear-down

If shutting an environment down:

1. Drain users (status page banner, in-app notice).
2. Trigger data export for any users who haven't.
3. Run final backup; archive off-site.
4. Delete services in reverse provisioning order (Cloudflare Pages project, DB, Redis, etc.).
5. Confirm Stripe customer migration or refund per regulation.
6. Terminate sub-processors; archive DPAs.

## 14. Operational runbooks (high-level)

These are short pointers; full procedures live in private runbooks.

- **LLM provider outage** → toggle `LLM_KILL_SWITCH=true`; banner in app; alert subscribers via status page.
- **DB primary failure** → failover per provider; verify writes resume; restore latest snapshot if needed.
- **Cost anomaly** → identify offending user via `usage_events`; suspend account; review.
- **Suspected breach** → follow `security.md §12`.
- **Stripe webhook backlog** → use Stripe dashboard "resend events"; idempotency table prevents duplicates.
