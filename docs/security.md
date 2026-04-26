# Security — Nuansu v1

The data Nuansu handles is intimate by nature: dating-app messages, personal conversations across language barriers. The threat model and controls below are sized for that sensitivity, scaled to a solo-founder-operable v1 SaaS.

## 1. Asset inventory

| Asset                                   | Sensitivity          | Where it lives                                                     |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------ |
| User account credentials                | High                 | Better Auth tables in our Postgres (no external auth vendor)       |
| Session tokens                          | High                 | httpOnly cookies, browser                                          |
| Message content (source + target)       | Critical             | Postgres `messages` / `message_versions`, encrypted at field level |
| Per-chat preferences (notes, nicknames) | High                 | Postgres `preferences_chat`, encrypted at field level for `notes`  |
| Name locks                              | Medium               | Postgres `name_locks`, encrypted                                   |
| Audit points                            | Medium               | Postgres `audit_points`                                            |
| Usage metrics                           | Low                  | Postgres `usage_events`, no message bodies                         |
| Email                                   | High                 | Postgres `users`, hashed where possible (see §4.4)                 |
| Stripe customer + payment refs          | High                 | Stripe (we only store IDs and minimal metadata)                    |
| LLM provider conversation context       | Critical (transient) | Anthropic — covered by ZDR + DPA                                   |
| Logs                                    | Variable             | Cloudflare Workers Logs + Sentry — must be redacted (see §6)       |
| Backups                                 | Critical             | DB provider (encrypted at rest)                                    |
| Secrets                                 | Critical             | Cloudflare Pages env, never committed                              |

## 2. Threat model — STRIDE summary

| Threat                     | Examples                                                                   | Controls                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing**               | Forged session, account takeover                                           | Auth provider; httpOnly+SameSite cookies; rotate on privilege change; OAuth + magic link only (no passwords in v1); MFA on paid tier (free in v2). |
| **Tampering**              | XSS-injected client modifying requests; webhook replay                     | CSP; SameSite cookies + CSRF tokens on POST/PUT/DELETE handlers (Hono CSRF middleware); signed webhooks with replay-protected event IDs.           |
| **Repudiation**            | "I didn't request that deletion"                                           | Audit log of security-relevant actions; export confirmation emails; 24h delay on irreversible actions.                                             |
| **Information disclosure** | DB breach exposes messages; logs leak content; LLM provider stores prompts | Field-level envelope encryption; ZDR contract with Anthropic; redaction in logs; least-privilege DB users.                                         |
| **Denial of Service**      | Quota abuse, request flooding, LLM cost-exhaustion attack                  | Rate limits (per IP, per user); quota tiers; per-user daily $ cap with kill-switch; Cloudflare WAF + DDoS + bot management baseline.               |
| **Elevation of Privilege** | Cross-tenant access; admin bypass                                          | Ownership enforced at data-access layer; CI lint bans raw queries; admin endpoints behind a separate role + MFA.                                   |

## 3. Authentication & sessions

- **No password v1.** Email magic link + Google OAuth + Apple OAuth + **LINE Login**, all via **Better Auth** running in our Hono Worker.
- **Sessions:** httpOnly + Secure + SameSite=Lax cookies. Session lifetime: 30 days, sliding. Server-side session store is `auth_sessions` in our Postgres; Better Auth signs cookies with `BETTER_AUTH_SECRET` (32-byte random hex per environment).
- **Session validation** happens at the edge in our Worker. A 5-minute cookie cache avoids hitting the DB on every request; full validation on cache miss.
- **OAuth callbacks** land at `/api/auth/callback/<provider>`; Better Auth verifies state + nonce + token claims. Provider scopes are minimal (Google: `email profile`; Apple: `email name`; LINE: `profile openid`).
- **MFA:** TOTP (RFC 6238) optional v1, required for accounts with paid plans v2 default. WebAuthn passkeys when the provider supports it.
- **Re-auth required for:** changing email, deleting account, exporting data, downloading export, changing payment method.
- **Logout from all devices** affordance in settings; revokes all sessions.
- **Email change** sends a confirmation link to the _old_ address with a 24h cancel window.
- **Account recovery** via the auth provider's flow; rate-limited; alert email on success.

## 4. Encryption at rest

### 4.1 Provider-level

Supabase encrypts data at rest with provider-managed keys. This is necessary baseline but not sufficient: a compromise of provider credentials would expose all data.

### 4.2 Application field-level (envelope encryption)

Sensitive fields (message bodies, glosses, notes, name-lock entries) are encrypted application-side before insert. Architecture:

- **KMS (root key)** — **AWS KMS** in a dedicated AWS sub-account (`ap-northeast-1` / Tokyo region for locality). One Customer Master Key (CMK) per environment (`production`, `preview`). The IAM principal that the Cloudflare Worker authenticates as can `kms:GenerateDataKey` and `kms:Decrypt` against the CMK and _nothing else_ — no broader AWS access.
- **Per-user data key (DEK)** — generated on first message write; wrapped by KMS; stored in `users.dek_wrapped` (bytea).
- **Field encryption** — XChaCha20-Poly1305 via libsodium. Each field gets a unique 24-byte nonce stored alongside ciphertext. AAD includes the row's primary key to prevent ciphertext swapping.
- **Audit:** AWS CloudTrail in the KMS sub-account is enabled and shipped to a write-only S3 bucket with object lock (90 days). Any KMS use is auditable retrospectively.

Code shape:

```ts
async function encryptForUser(
  userId: string,
  plaintext: string,
  aad: Buffer,
): Promise<EncryptedField> {
  const dek = await getOrCreateUserDek(userId); // KMS-unwrapped, cached briefly
  const nonce = randomNonce(24);
  const ciphertext = xchacha20poly1305_encrypt(plaintext, nonce, aad, dek);
  return { ciphertext, nonce };
}
```

Why this shape:

- A DB-only breach yields ciphertext only.
- Per-user DEKs allow targeted purge: delete the DEK and the user's data is cryptographically erased (compliance.md §3).
- The KMS root key never leaves KMS; even server compromise is contained until rotation.

### 4.3 Encryption in transit

- TLS 1.3 everywhere; HSTS with `max-age=31536000; includeSubDomains; preload`.
- TLS to the DB (sslmode=verify-full).
- TLS to Redis.
- TLS to the LLM provider (default).

### 4.4 Email handling

- Email stored as `citext` for case-insensitive uniqueness.
- We do _not_ hash email at the user table because we need to send to it; instead we treat it as PII and apply the same access discipline as any sensitive field. Email is not used as a join key elsewhere.
- Waitlist emails kept separately; deletable on request.

### 4.5 Path to E2E (roadmap)

A BYO-API-key tier (parked in the v2 roadmap) shifts the trust model: the user's DEK derives from a passphrase + their key, the server stores only ciphertext, and translation requests fan out to the user's own LLM credentials. Out of scope for v1; the field-level scheme above keeps the door open without redesign.

## 5. Authorisation

- **Single tenant per user** in v1 — no orgs, no shared chats. This simplifies the model: every row has a `user_id`, and access requires the request's `user_id` to match.
- **Server-only data layer.** All DB access goes through `db.forUser(userId)`. The wrapper attaches `WHERE user_id = $1` to every query and refuses unscoped queries. CI lint bans `db.<table>.findX` outside the wrapper.
- **Defence in depth.** Postgres RLS turned on (Supabase makes this easy); policies match the wrapper. If the wrapper is bypassed by accident, RLS still blocks.
- **Admin access** to production data is limited to break-glass scenarios; access via a dedicated read-only role with audit logging. No admin UI in v1; queries via `psql` over a bastion, logged.

## 6. Logging & redaction

- **Never log message content.** A logger wrapper redacts known field names (`source_text`, `target_text`, `gloss`, `notes`, `draft_source_text`, ...). Lint rule blocks plain `console.log` in `server/`.
- **Sentry filters** strip request bodies for routes that handle messages. PII redaction patterns drop email addresses from breadcrumbs.
- **PostHog** receives only event names + non-PII properties; no message content.
- **LLM provider logs** are subject to ZDR; we don't fetch or replay them.
- **Audit log** lives in DB and is queryable by the user (their own actions).

## 7. Input validation & output encoding

- Every Route Handler validates its body against a zod schema before doing anything.
- Path/query parameters validated similarly.
- File uploads (avatars now; voice later) validated by MIME, magic bytes, size limit; processed in a sandbox.
- Rich-text not allowed anywhere in v1 — all text fields are plain.
- HTML never injected from user-supplied content; React's default escaping is the only mode used.
- Email templates use a templating engine that escapes by default; user-supplied values rendered as plain text.

## 8. Abuse & DoS

- **Rate limits** per `back_end_architecture.md §5`.
- **Quota** with hard upper bounds even on paid tier.
- **Per-user $/day kill-switch.** A nightly job alerts if any user spends > $X; manual review and account suspension if needed.
- **Captcha** (hCaptcha or Turnstile) on signup and waitlist forms.
- **WAF**: Cloudflare's WAF + bot management + DDoS scrubbing on the zone (baseline-included).
- **Email enumeration:** signup flow says "if an account exists, we sent a link" rather than confirming existence.

## 9. Vendor risk

| Vendor                                                 | What it sees                                                                                                                        | Mitigations                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Anthropic                                              | Prompts and responses transiently                                                                                                   | DPA + ZDR; minimal context (snapshot, not full thread); APAC endpoint where available                            |
| Cloudflare (Pages + Functions + WAF + DNS + Turnstile) | Hosting our app + edge security; sees request metadata + ciphertext bodies in transit; cannot decrypt our envelope-encrypted fields | DPA; CSP locked down; secrets in Cloudflare env (encrypted at rest); WAF + bot management baseline-included      |
| Supabase (Postgres + Storage only)                     | Ciphertext + non-encrypted metadata + Better Auth tables (sessions, OAuth IDs); avatar blobs                                        | DPA; encryption at rest; audit logs; RLS on every user-scoped table                                              |
| Google (OAuth)                                         | OAuth identifiers and basic profile only — **never message content**                                                                | Scopes: `email profile`; tokens validated by Better Auth in our Worker                                           |
| Apple (Sign in with Apple)                             | OAuth identifiers — email may be a relay address — **never message content**                                                        | Scopes: `email name`; tokens validated server-side                                                               |
| LINE (LINE Login OAuth)                                | OAuth identifiers and basic profile only — **never message content**                                                                | Scopes restricted to `profile openid`; no friend list, no message access; LINE channel secrets in Cloudflare env |
| AWS (KMS only)                                         | Wrap/unwrap envelope keys; never plaintext                                                                                          | Dedicated sub-account; IAM scoped to KMS-only operations; CloudTrail enabled with object-lock                    |
| Stripe                                                 | Payment data                                                                                                                        | PCI-compliant by design; we never see card data                                                                  |
| Resend                                                 | Email content (transactional only — including Better Auth magic links)                                                              | DPA; templates contain no message body                                                                           |
| Sentry                                                 | Stack traces                                                                                                                        | PII scrubbing; no body capture for sensitive routes                                                              |
| PostHog                                                | Product events                                                                                                                      | EU-hosted; opt-in for EU users; no message content                                                               |
| Upstash                                                | Rate-limit counters                                                                                                                 | No PII; only user-IDs as keys                                                                                    |

A `vendors.md` (v2) records DPAs, sub-processors, audit reports.

## 10. Pre-launch security checklist

Mirrored as `requirements.md §9` gating items.

- [ ] All Anthropic ZDR + DPA terms signed and archived.
- [ ] DPAs signed with: Supabase, Stripe, Resend, Sentry, PostHog, Upstash, Cloudflare, AWS, Google, Apple, LINE.
- [ ] OAuth provider credentials in Cloudflare env: Google, Apple, LINE — scopes restricted per §3 of this doc.
- [ ] `BETTER_AUTH_SECRET` generated per environment via `openssl rand -hex 32`; rotation documented.
- [ ] AWS KMS sub-account CloudTrail enabled, S3 object lock confirmed, IAM principal scoped to KMS-only.
- [ ] All env-var names and example values audited; no secrets in repo.
- [ ] CSP locked down (no `unsafe-inline`); report-only mode in staging, enforce in prod after a clean week.
- [ ] HSTS preload submitted only after stable on production.
- [ ] httpOnly + SameSite + Secure verified on all auth cookies.
- [ ] CSRF protection live on all POST/PUT/DELETE handlers via Hono CSRF middleware.
- [ ] Field-level encryption tested with a key rotation drill.
- [ ] Backup restore tested end-to-end on staging.
- [ ] Account deletion path tested; verifies hard purge + DEK destruction.
- [ ] Rate limit + quota tested by automated load.
- [ ] Per-user $/day cap and kill-switch tested.
- [ ] Sentry redaction rules tested; no message bodies in captured events.
- [ ] Pen-test or third-party review (light scope) — recommend `@assetnote` style or [Doyensec light-scope] when budget permits.
- [ ] Dependency audit (`pnpm audit`) clean; Renovate or Dependabot enabled.
- [ ] Source maps not exposed; sourcemaps uploaded to Sentry only.
- [ ] Admin/break-glass procedure documented.
- [ ] Incident response runbook (§12) on file.

## 11. Secret management

- All secrets in environment variables, sourced per environment from Cloudflare Pages.
- `.env.example` enumerates every variable with safe placeholder values.
- A `lib/env.ts` zod schema is the single source of truth; missing or malformed fails app boot.
- Rotate secrets on schedule:
  - Auth provider secrets: per provider's recommendation.
  - DB credentials: every 90 days.
  - LLM provider key: every 90 days; rotate on suspicious activity.
  - Stripe webhook signing secret: on rotation events.
  - KMS root key: never re-issued; instead, new version + re-wrap DEKs (rotation procedure documented).
- Local `.env.local` is git-ignored and developer-specific; never shared.

## 12. Incident response (light)

For a solo-founder app, a lightweight runbook is enough.

- **Severity levels:** P0 customer data exposed; P1 service down or material function broken; P2 partial degradation; P3 cosmetic.
- **Triggers:** uptime alert, Sentry anomaly, customer report, security advisory on a dependency.
- **First 30 minutes:**
  1. Acknowledge the alert.
  2. Mitigate: kill-switch the affected feature if possible.
  3. Capture state: open a doc, paste timestamps, suspect changes, current actions.
- **Within 24 hours:**
  - Notify affected users (if any data was exposed) — template in `compliance.md §6`.
  - Patch root cause; deploy a fix.
- **Within 7 days:**
  - Postmortem doc: timeline, contributing factors, action items.
- **Disclosure:** per regulation (GDPR 72h notification of authorities for personal-data breaches, LGPD 2 working days).

## 13. Specific protections

### 13.1 Cross-site scripting (XSS)

- React default escaping; no `dangerouslySetInnerHTML` in v1.
- CSP: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' (only for tailwind generated); img-src 'self' data: https:; connect-src 'self' https://api.anthropic.com https://api.stripe.com ...`
- All HTML email templated and pre-escaped.

### 13.2 SQL injection

- Drizzle parameterises all queries.
- Raw SQL only in migrations and a small list of analytic helpers; reviewed.

### 13.3 SSRF

- No user-supplied URLs are fetched server-side in v1.
- When voice arrives (roadmap), uploads go through pre-signed URLs only; we never fetch arbitrary URLs.

### 13.4 Authorization bypass

- The `db.forUser` wrapper covers every read and write path.
- Tests assert: a user A request for chat owned by B returns 404 (not 403, to avoid existence leaks).

### 13.5 Webhook security

- Stripe and Resend webhooks verify signatures on every call.
- Event IDs deduplicated against `webhook_events` table; replay attempts logged.

### 13.6 Supply chain

- Lockfile committed; CI verifies integrity.
- Renovate / Dependabot for security updates.
- Internal review before merging dependency upgrades that touch auth, crypto, or DB layers.

### 13.7 Browser security headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: ...
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
X-Content-Type-Options: nosniff
X-Frame-Options: DENY (or CSP frame-ancestors 'none')
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
```

## 14. Open questions (security)

All previously listed security open questions have been resolved (AWS KMS in `ap-northeast-1`, RLS on day one, MFA paid-only at v1, Cloudflare Turnstile, bug-bounty post-launch). See [`./questions.md`](./questions.md) for any remaining cross-cutting TODOs.
