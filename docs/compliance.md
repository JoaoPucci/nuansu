# Compliance & Positioning — Nuansu v1

This doc covers regulatory exposure (GDPR, LGPD, CCPA/CPRA, Japan APPI), data-subject rights, and the deliberate marketing posture that keeps Nuansu positioned as a **general-purpose translation copilot** rather than a dating-specific product.

> **This doc is product/engineering guidance, not legal advice.** Before public launch, the founder must engage counsel for:
>
> - Privacy policy and Terms of Service review.
> - Data Protection Impact Assessment (GDPR Art. 35) sign-off.
> - DPA template for vendors and customers if B2B emerges.

## 1. Regulatory landscape Nuansu must comply with

### 1.1 GDPR (EU + UK)

Triggered by: any EU/UK-resident user. Likely from day one.

- **Lawful basis for processing.** Performance of a contract (the user's account); consent for analytics and any non-essential cookies.
- **Data minimisation.** Collect only what's needed: email, optional display name, OAuth identifiers, the messages and prefs the user explicitly creates.
- **Storage limitation.** Soft-deleted content purged in 30 days; account deletion within 30 days; usage events aggregated and pruned after 13 months.
- **Data subject rights.**
  - Right to access (export endpoint per `requirements.md §5.9`).
  - Right to rectification (settings).
  - Right to erasure (account deletion).
  - Right to restrict processing.
  - Right to data portability (export is JSON; rights satisfied).
  - Right to object (opt-out of analytics; no automated decision-making with legal effects).
- **DPIA required.** Messages are sensitive personal data; a DPIA must be completed pre-launch.
- **International transfers.** EU users' data flows to **JP (Supabase Tokyo)** at v1 — Japan has an EU adequacy decision (2019), so EU → JP transfers do not require SCCs or supplementary measures for the primary data store. Transfers to US sub-processors (Stripe, Anthropic, Sentry) still require SCCs + transfer impact assessment + ZDR. Mitigations:
  - DB region: Tokyo at v1; EU read replica scheduled when EU traffic > 25% (architecture.md §10).
  - Anthropic APAC endpoint where available; SCCs + ZDR otherwise.
  - **EU representative** (Prighter or equivalent) appointed when the first EU sign-up arrives — GDPR Art. 27.
  - Vendor list disclosed in privacy policy and at `/sub-processors`.
- **Breach notification.** Authorities within 72 hours; affected users without undue delay.
- **DPO.** Not strictly required for a small SaaS unless processing is large-scale and systematic monitoring; a designated privacy contact is sufficient.

### 1.2 LGPD (Brazil)

Triggered by: any Brazilian-resident user. Mirrors GDPR closely.

- Lawful bases largely match GDPR (art. 7).
- Data subject rights: access, correction, anonymisation, portability, deletion, information about sharing, revocation of consent.
- Breach notification: 2 working days to ANPD and affected users.
- DPO ("Encarregado") nominally required; can be a contracted role.

### 1.3 CCPA / CPRA (California)

Triggered by: California residents (and the threshold tests effectively apply to any consumer-facing SaaS aiming for scale).

- Right to know, delete, correct, opt out of sale/sharing, limit use of sensitive PI.
- "Do Not Sell or Share My Personal Information" link in footer (we don't sell, but the link is required).
- Sensitive Personal Information includes account credentials and content of communications — handle with the same care as GDPR's "special category" data.

### 1.4 Japan APPI

Two distinct touch-points:

- **Many Nuansu users will be Japanese residents.** As a JP-resident sole proprietor (個人事業主) operating a service that handles personal data of JP users, the founder is a JP-domiciled controller — APPI applies directly. This is _simpler_ than a foreign-controller scenario: no need to appoint a JP representative under APPI Art. 5(2); no foreign-business special rules.
- **Conversation partners** of Nuansu users (the people they're translating to/from) are not Nuansu users, but their messages flow through us. Their data is incidental: the Nuansu user is treated as the data controller of that pasted content; Nuansu is a processor for it.
- ToS requires the user to ensure they have the right to translate the content they paste.
- 2022 amendment: cross-border transfers require disclosure of recipient country, recipient country's data-protection regime, equivalent rights status, and safeguards in place. We disclose in the privacy policy:

  | Recipient country / region | Recipients                                                                               | Data-protection regime + safeguards (JP-locale text [COUNSEL] for final wording)                                                                                                                                                                                                                                                                               |
  | -------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Japan                      | Supabase Tokyo (Postgres + Storage); Cloudflare Tokyo PoPs; Upstash Tokyo; AWS KMS Tokyo | Domestic processing under APPI itself; no cross-border transfer                                                                                                                                                                                                                                                                                                |
  | United States              | Anthropic, Stripe, Sentry, Resend, Google OAuth, Apple OAuth                             | No comprehensive federal data-protection law; sectoral regimes (HIPAA, COPPA, etc. — none apply directly to Nuansu data). EU-US Data Privacy Framework where vendor is certified; SCCs (2021/914 Module 2) where not. List of executed SCCs maintained at `private/legal/transfers/`. APPI 2022 disclosure shows "(USA — no equivalent regime; SCCs in place)" |
  | European Union             | PostHog                                                                                  | GDPR adequate per APPI Cabinet Order; full equivalence to JP-resident protections. APPI 2022 disclosure shows "(EU — adequate per Cabinet Order)"                                                                                                                                                                                                              |
  | Global edge (Cloudflare)   | Cloudflare WAF + Pages content delivery                                                  | Request metadata only; ciphertext bodies in transit. SCCs in place per Cloudflare DPA                                                                                                                                                                                                                                                                          |

- **SCC modules in use**: 2021/914 Module 2 (controller-to-processor) for US sub-processors; UK International Data Transfer Addendum applies for any UK user (trigger: first sign-up from a UK IP). Per-vendor SCC PDFs archived at `private/legal/transfers/<vendor>-<date>.pdf`. `[COUNSEL]` to confirm SCC module per vendor before signing.
- **Transfer Impact Assessments (TIA)** completed and archived for each US transfer post-Schrems II. Outcome documented in the same `private/legal/transfers/<vendor>-tia.md`.
- 2023 amendment (incident reporting): data breaches affecting JP residents must be reported to the Personal Information Protection Commission (PPC) without delay; covered in `private/runbooks/incident-response.md` (referenced from §6.2 below).

### 1.5 Other notable regimes (lighter posture)

- **PIPEDA (Canada)** — general best-practice handling satisfies it.
- **PIPL (China)** — block users from China by region-gating; Chinese partner messages flowing through is a separate question.
- **Children's privacy (COPPA, GDPR-K)** — minimum age 16+ in the EU, 13+ globally; enforced in signup. Self-attested in v1.

## 2. Data classification

| Class        | Examples                                                    | Handling                                                                    |
| ------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Critical** | Message content (source + target), gloss, notes, name locks | Field-level encrypted; never logged; minimal LLM context; ZDR with provider |
| **High**     | Email, OAuth IDs, IP, device info                           | TLS only; encrypted at rest; minimised in logs                              |
| **Medium**   | Display name, avatar, preferences                           | Standard PII handling                                                       |
| **Low**      | Usage events (counts, token totals), feature flags          | Aggregated; no message bodies                                               |

## 3. Data subject rights — implementation

### 3.1 Right of access / portability

- Settings → "Export my data". A background job builds a JSON archive containing:
  - `user.json` (profile, prefs, name locks).
  - `chats.jsonl` (one chat per line).
  - `messages.jsonl` (one message per line, with full version history and audit points; decrypted for the user).
  - `pref_suggestions.jsonl` (drift-detection history + user resolutions).
  - `audit_log.jsonl` (the user's own actions: logins, MFA setups, email changes, exports, deletions). Required for GDPR Art. 15 — users have the right to know what we know about them, including derived/operational data.
  - `usage.csv` (counts only; no content).
  - `manifest.json` (export timestamp, data scope, `format_version` semver).
- **Schema versioning.** The export shape is defined in `packages/export/schema.ts` with versioned interfaces. `format_version` follows semver: minor bumps add fields (consumers should ignore unknowns); major bumps change shape (consumers must update to consume). Old format versions remain documented for at least 12 months so external consumers (e.g., a self-hosted Obsidian importer) have time to adapt.
- **Delivery.** The user receives an email containing a signed app-local URL of the form `/exports/<job_id>?token=<signed>`. The URL is **not** a direct storage URL — direct storage URLs are bearer credentials that survive any inbox compromise (phishing, SIM swap, residual access in a recycled email). The app-local URL requires a re-authenticated session (within the last 10 min) and proxies the storage object via a one-time-use server-side fetch. URL expires after the first download or 24 hours, whichever comes first; bound to the requesting user-agent + IP family. Outbound `Referrer-Policy: no-referrer` header strips the URL from any subsequent navigation.
- Request rate-limited to 1 per 24 hours per account.
- DSAR contact addresses: `privacy@nuansu.app` (English, primary) and `privacy-jp@nuansu.app` (Japanese, with JP-language acknowledgement template). JP users receive auto-acknowledgement in JP within 24h; full response within the regulatory window for their jurisdiction. Inbound mailbox provisioning documented in `deployment.md §5.6`.

### 3.2 Right of rectification

- All user-editable fields are settings-editable. Profile rectification (display name, locale, region, source language) is logged to `audit_log` with rate-limit (≤ 1 email-change request / 24h per account; region change requires re-verification because it drives multi-region routing).
- Messages themselves are immutable (committed). To "correct" a message, the user posts a new one; the original remains for audit.
- **AI-generated derived data** (audit points, `pref_suggestions.reasoning`) is covered by GDPR Art. 16 as inferred personal data. Mechanisms:
  - Per-audit-point dismissal in the message history view; dismissed audit points are excluded from any further inference and from data export reasoning (preserved as an anonymised entry showing only category + dismissed status).
  - Per-suggestion `dismiss` action excludes that field from drift-detection re-emission for 30 days (already documented in `back_end_architecture.md §5.4`).
  - "Report wrong audit point" affordance — surfaces a one-click feedback channel that flags the audit point for retraining/prompt-tuning consideration.

### 3.3 Right to erasure

- Settings → "Delete my account". Two-step confirmation, requires re-auth.
- Soft-deleted immediately; user is logged out; account cannot be re-opened.
- Hard-deletion runs at scheduled time (max 30 days).
- **Hard-deletion sequence** — ordered to be transactional-where-possible and to put the irreversible step last so a partial-failure replay can re-attempt every other step idempotently. KMS DEK destruction is the cryptographic point of no return; everything else can run again.
  1. **Flag the user as deleting.** Set `users.deleted_at`. The session-middleware rejects all new authenticated requests for this user with a `410 Gone` immediately.
  2. **Drain in-flight.** Wait ~30 s for any concurrent translate/inbound stream to complete or time out. Avoids racing the deletion against a write that lands after `messages` is purged.
  3. **Postgres transaction** (single transaction, all-or-nothing). `users`, `auth_users`, and `deletion_requests` rows are intentionally retained at this step — they get anonymised (NULLed PII) in step 6 and the lifecycle record stays for the step-7 completion update. Each DELETE is its own statement; per-table because Postgres does not allow multi-table DELETE in a single statement, and because some tables (`message_versions`, `audit_points`, `preferences_chat`) carry no `user_id` column and rely on CASCADE from their parent. Order respects FK dependencies (children would CASCADE anyway, but we DELETE explicitly for traceable ordering and so retries are predictable):

     ```sql
     -- Direct user-content tables (cascade to message_versions + audit_points via messages)
     DELETE FROM messages           WHERE user_id = $1;  -- cascades: message_versions, audit_points
     DELETE FROM chats              WHERE user_id = $1;  -- cascades: preferences_chat, plus any chat-scoped name_locks/pref_suggestions
     DELETE FROM name_locks         WHERE user_id = $1;  -- catches global name_locks (chat_id IS NULL)
     DELETE FROM pref_suggestions   WHERE user_id = $1;  -- defensive: also cascades from chats
     DELETE FROM preferences_global WHERE user_id = $1;
     DELETE FROM usage_events       WHERE user_id = $1;
     DELETE FROM export_jobs        WHERE user_id = $1;
     DELETE FROM subscriptions      WHERE user_id = $1;

     -- Audit log: anonymised, not deleted (operational record of past actions)
     UPDATE audit_log SET user_id = NULL, ip = NULL, user_agent = NULL, metadata = '{}' WHERE user_id = $1;

     -- Better Auth tables
     DELETE FROM auth_sessions       WHERE user_id = $1;
     DELETE FROM auth_accounts       WHERE user_id = $1;
     DELETE FROM auth_verification_tokens
       WHERE identifier IN (SELECT email FROM auth_users WHERE id = $1);
     -- ↑ auth_verification_tokens has no user_id column (Better Auth's schema; see back_end_architecture.md §3).
     -- The `identifier` column holds the email magic-link tokens were issued to. The subquery executes
     -- inside the transaction before any update to auth_users, so the email is still resolvable.
     -- Tokens not matched here expire by their 15-minute TTL anyway (security.md §3.2), but explicit
     -- deletion eliminates the small race-window with an in-flight magic-link request.
     ```

  4. **Stripe**: call `customer.delete` (or `customer.update` to anonymise per Stripe's retention rules — Stripe keeps payment-record traces by law). Idempotent; retried by the hourly `process_deletion_queue` job if 5xx.
  5. **Resend**: add the email address to the suppression list. Idempotent.
  6. **DEK destruction + final PII anonymisation (LAST — irreversible).** Single transaction:

     ```sql
     BEGIN;
     UPDATE users
       SET dek_wrapped = NULL, display_name = NULL
       WHERE id = $1;
     UPDATE auth_users
       SET email = id || '@deleted.invalid',  -- placeholder satisfies NOT NULL + UNIQUE; .invalid is reserved (RFC 2606)
           name  = NULL,
           image = NULL
       WHERE id = $1;
     COMMIT;
     ```

     This is the irreversible crypto-erasure (NULL `dek_wrapped` makes the per-user DEK impossible to unwrap, so all user-encrypted ciphertext is mathematically unreadable from the live DB and from any restored backup as the wrapped DEK ages out per `deployment.md §8`) AND the final PII drop in one atomic step. **Do not `DELETE FROM users` or `DELETE FROM auth_users`**: `deletion_requests.user_id` is `REFERENCES users(id) ON DELETE CASCADE` and `users.id REFERENCES auth_users(id) ON DELETE CASCADE` (per `back_end_architecture.md §3`), so either DELETE would cascade-remove the lifecycle record step 7 needs to update, recreating the bug step 3's exclusion was designed to avoid. The user/auth_users rows stay as anonymised tombstones — no PII remains; the row itself is the durable compliance record of "we deleted this account on date X" for audit. The KMS CMK is shared across the environment and is **never** scheduled for deletion as part of a single-user erasure — it stays alive to unwrap every other user's DEK.

  7. `UPDATE deletion_requests SET completed_at = now() WHERE user_id = $1` only after step 6 commits. The hourly `process_deletion_queue` job (per `back_end_architecture.md §7`) retries any incomplete deletion (`completed_at IS NULL AND scheduled_for < now()`). Step 6 is idempotent — re-running on already-anonymised rows is a no-op (NULL = NULL, placeholder email already set) — so retries between step 6 and step 7 are safe. Once step 7 commits, the deletion is durably complete.

- **Confirmation email** to the user from a generic system address before step 6 (so it's still sendable; after step 6 the user's data including email is gone).
- **Backups + crypto-erasure.** The wrapped DEK lives in `users.dek_wrapped` (the Postgres `users` table); this row is included in PITR + daily/weekly backups. Privacy policy discloses: deletion is immediately effective on the live database; full crypto-erasure completes when the last backup containing the wrapped DEK ages out — **≤ 35 days post-deletion** (the maximum backup retention per `deployment.md §8`). Until that window closes, an attacker with both backup access AND KMS access could in principle restore. Both are tightly controlled (backup access requires Supabase admin; KMS access requires the dedicated AWS sub-account); separately auditable.

### 3.4 Right to restrict processing

- Settings toggle: "Pause processing — your account stays, but no new translations are run." Useful as a halfway step before deletion. v1 implementation: account flag, blocks all LLM endpoints with a clear banner.

### 3.5 Right to opt out of analytics

- Settings toggle: "Send anonymous usage analytics" (opt-in by default for non-EU; opt-in _required_ for EU users to fire).

## 4. Marketing & positioning constraints

The founder's intent: keep Nuansu positioned as a general-purpose translation copilot. Two reasons:

1. **TAM expansion.** "Cross-language messaging" is a bigger market than "dating-app translation".
2. **Regulatory simplification.** A dating-companion product can attract:
   - Increased age-verification scrutiny in some jurisdictions.
   - Specific dating-app regulations (FOSTA-SESTA-style debates, JP "exchange-dating" laws, regional age-of-majority interactions).
   - App store policy categories that bring tighter content moderation expectations.
   - More aggressive payment-processor risk treatment.

Keeping the product framed broadly avoids most of this without changing the actual feature set.

### 4.1 Copy guidelines

| Use                                                                                | Avoid                                                           |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| "Translate the message"                                                            | "Translate your match's message"                                |
| "Conversations across languages"                                                   | "Dating across languages"                                       |
| "Your contacts"                                                                    | "Your matches", "your dates"                                    |
| "Personal messages, business chat, marketplace, fan replies"                       | "For dating-app users"                                          |
| Examples of use cases include conversations, marketplace chat, and fan replies     | "Pairs / Tinder / Bumble" — never name dating apps in marketing |
| Screenshots show generic chat names ("Aiko", "Hiroshi")                            | Real names; brand names of dating apps                          |
| Social posts: "I built this because I lost an hour a day translating personal DMs" | "...DMs on Tinder"                                              |

The dogfood story is genuine and allowed in long-form content (founder essays, podcast interviews) — there's authenticity capital in saying "I built this for my own conversations". The constraint applies to the _product surface, paid ads, and app-store metadata_ where regulatory and platform policies are matched against the literal words.

### 4.2 In-product copy

- Onboarding asks "Who do you message most?" with broad options: Friend / Family / Coworker / Marketplace / Other. Never "Date" or "Match".
- Default chat name placeholders are first names, not "match".
- The product never asks the user to disclose the _relationship_ with the contact; only the language and tone preferences.

### 4.3 App store metadata (when iOS/Android ships)

- Category: Productivity or Utilities, not Lifestyle/Dating.
- Description focuses on translation fidelity; no dating-app screenshots; no romantic imagery.
- Age rating: 12+ (or per platform rules around chat input). Confirm at submission.

### 4.4 Risk if positioning slips

If marketing or product begins clearly addressing "people on dating apps", these issues become live:

- App store review may re-categorise.
- Stripe and other payment processors may apply higher-risk MCC.
- AdSense / Meta Ads may restrict campaigns.
- Some EU member states require additional safeguards for dating services.

The fix is to keep the product general; the dating use case is an example among many, not the brand identity.

## 5. Cookie & analytics policy

- **No tracking on marketing pages by default.** The first time a visitor consents to analytics or visits the app, a cookie/localStorage flag is set.
- **Cookie banner** appears for EU/UK and California IPs. It explains essential cookies (no choice) vs analytics (opt-in for EU, opt-out for US).
- **Categories:**
  - Essential: session cookie, CSRF token. No banner consent needed.
  - Analytics: PostHog. Off until consent (EU) or opt-out flag (US).
  - Marketing: none in v1.
- Detection of jurisdiction by IP via `request.geo` from the platform.

## 6. Notice templates

### 6.1 Breach notification email (data-subject)

```
Subject: Important: a security incident affecting your Nuansu account

[date] we detected [brief summary]. The data potentially affected includes [scope]. We have taken these steps: [actions]. The risk to you: [assessment]. We recommend you [actions, e.g., review recent sign-ins, rotate session]. If you have questions, contact privacy@nuansu.app.

We are required to inform you under [applicable regulation, e.g., GDPR Art. 34 / LGPD Art. 48].
```

### 6.2 Authority notification (GDPR Art. 33)

Drafted from a template; submitted within 72h of awareness via the lead supervisory authority's portal. APPI 2023 amendment requires notification to the Personal Information Protection Commission "without delay" for breaches affecting JP residents (no fixed clock; precedent suggests within days). LGPD (Brazil) requires notification within 2 working days.

**Runbook location.** The full incident-response runbook lives at `private/runbooks/incident-response.md` (gitignored — contains the founder's contact info, alerting channel tokens, on-call procedures). Public reference here so the file's existence is discoverable. Expected sections in the runbook:

- Severity definitions (P0/P1/P2/P3) with examples + time-to-mitigate targets.
- Alerting wire-up: Sentry rule → email (`alerts@nuansu.app`) + Pushover/Telegram → founder phone. Tested quarterly via a dry-run alert.
- First-30-minutes checklist (acknowledge → mitigate → capture state).
- Notification timing matrix per regulation: GDPR 72h to authority + "without undue delay" to data subjects; APPI "without delay" to PPC + affected JP users; LGPD 2 working days; CCPA reasonable time per AG guidance.
- Postmortem template + 7-day SLA.
- Disclosure-template index pointing back to this section's §6.1 + the authority-notification template form.

The runbook is exercised in quarterly DR drills (see `deployment.md §8`) — including the crypto-erasure verification drill (delete a test user, restore backup from before deletion, confirm ciphertext present but un-decryptable).

## 7. Records of processing activities (ROPA — GDPR Art. 30)

Maintained as a separate sheet (Notion / a private repo file). For each processing activity:

- Purpose (e.g., "translate user-pasted messages").
- Categories of data subjects (Nuansu users; conversation partners — incidental).
- Categories of personal data (free-text content; identifiers).
- Recipients (Anthropic, DB host, etc.).
- Retention period.
- Cross-border transfer mechanism.
- Security measures.

The current ROPA template ships in a private location, not the public repo.

## 8. Vendor sub-processors

**Single source of truth.** The list below is the authoritative version. The public `/sub-processors` page (rendered from `apps/web/src/routes/$locale/sub-processors.tsx`), the privacy-policy "who we share with" section, the ROPA recipient list, and `security.md §9` Vendor risk all consume the same source: a typed registry at `packages/legal/sub-processors.ts`. Keeping all four downstream consumers in sync requires a single source — drift is otherwise inevitable, and a stale `/sub-processors` page is a regulatory finding waiting to happen.

| Sub-processor              | Purpose                                                                       | Region                             | Transfer mechanism + SCC module                                             |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| Anthropic (Claude)         | LLM inference                                                                 | US (APAC endpoint where available) | DPA + SCCs (2021/914 Module 2) + ZDR. UK addendum applies for UK transfers. |
| Cloudflare                 | Hosting (Pages + Functions), DNS, WAF, DDoS, Turnstile captcha                | Tokyo PoPs (primary), global edge  | DPA + SCCs (Module 2). UK addendum.                                         |
| Supabase                   | Postgres + Storage **only** (no auth)                                         | Northeast Asia 1 (Tokyo)           | DPA + SCCs (Module 2 for any EU/UK transfer; primary store is JP)           |
| Google (OAuth)             | Sign-in identity provider — `email profile` scope only                        | US/global                          | DPA + EU-US DPF (Google certified)                                          |
| Apple (Sign in with Apple) | Sign-in identity provider — `email name` scope only                           | US/global                          | DPA                                                                         |
| LINE                       | LINE Login OAuth — `profile openid` scope only                                | JP                                 | DPA (domestic JP, no cross-border)                                          |
| Stripe                     | Payments + Stripe Tax                                                         | US/EU                              | DPA + SCCs (Module 2) + EU-US DPF (Stripe certified)                        |
| Resend                     | Transactional email (Better Auth magic links + Stripe receipts + system mail) | US                                 | DPA + SCCs (Module 2)                                                       |
| Sentry                     | Error monitoring                                                              | US (EU plan available)             | DPA + SCCs (Module 2)                                                       |
| PostHog                    | Product analytics (opt-in for EU; opt-out for JP per §3.5)                    | EU                                 | DPA (EU-resident data; APPI 2022 disclosure for JP-user analytics — §1.4)   |
| Upstash                    | Rate limit / cache                                                            | Tokyo region                       | DPA + SCCs (Module 2 for EU/UK transfers; primary is JP)                    |
| AWS                        | KMS root key only                                                             | `ap-northeast-1` (Tokyo)           | DPA + SCCs (Module 2 for EU/UK; primary is JP)                              |

**Adding or changing a sub-processor**: 30-day advance notice to existing users (standard DPA expectation). Notification mechanism: an opt-in email-list `sub-processor-changes@nuansu.app` exposed on the `/sub-processors` page; subscribers receive the notice 30 days before any change takes effect. The list is hosted in Resend; **the Resend list membership is itself the consent record** — opt-in via the page submits the email to the Resend list, opt-out is the standard one-click unsubscribe link in every email. No separate `users` schema column is needed for the consent state, and there is none planned (avoids the source-of-truth split between the Resend list and a Postgres flag). The Resend webhook for unsubscribe events updates an audit-log entry but does not mirror state into `users`.

**Executed SCCs + TIAs** archived per vendor at `private/legal/transfers/<vendor>-scc-<yyyy-mm>.pdf` and `private/legal/transfers/<vendor>-tia-<yyyy-mm>.md`. `[COUNSEL]` to confirm SCC module choice per vendor before signing.

## 9. Privacy policy structure

Sections (write with counsel review before launch):

1. Who we are.
2. What we collect (account, content, usage, device).
3. Why we collect it (basis under GDPR).
4. How long we keep it.
5. Who we share with (sub-processors).
6. International transfers.
7. Your rights (export, delete, restrict, object, complain).
8. Cookies.
9. Children's privacy.
10. Security measures.
11. Changes to this policy.
12. Contact.

## 10. Terms of Service highlights

- Acceptable use: no scraping, no automated access, no resale of translations as a service.
- Content responsibility: the user warrants they have the right to translate the content they paste; they grant us a limited licence to process it for the purpose of providing translation.
- No personal data of third parties beyond what's reasonably needed.
- No use for political-actor profiling or other prohibited categories under platform AUPs.
- Liability cap: standard SaaS limits; full disclosure that Nuansu is not a substitute for professional translation.
- Termination: by either party; data export available for 30 days post-termination.
- Governing law: TBD (likely founder's jurisdiction; counsel decides).

### 10.1 AGPL-3.0 exposure obligations

Nuansu's source is licensed AGPL-3.0. AGPL §13 requires that any user interacting with a modified version over a network be offered access to the corresponding source. To satisfy this:

- The application footer links to a `/source` page that publishes (a) the canonical GitHub repository URL and (b) the deployed commit SHA (matches the Sentry release tag). For a self-hosted modified version, the operator is responsible for exposing their own source.
- Contributions are accepted under the existing AGPL-3.0 license. PRs require a Developer Certificate of Origin (DCO) sign-off in the commit message (`Signed-off-by: Name <email>`). Documented in `AGENTS.md §3.5`.
- The `LICENSE` file is referenced from the repo footer + the `/source` page.

### 10.2 Content moderation + platform-cooperation stance

Nuansu is a translation copilot — we facilitate communication, we don't generate content de novo. Posture:

- **Outputs are bound by Anthropic's content policy** (the LLM provider's safety filtering applies to all translations).
- **No proactive moderation** of user-typed source content; Nuansu doesn't read messages for policy compliance.
- **Third-party platform reports.** If a platform (LINE, Tinder, Meta, etc.) traces a user complaint back to a translation produced by Nuansu and asks for our cooperation: we require a JP-court order or MLAT request for content disclosure. We can produce ciphertext + envelope-encryption metadata; without the user's DEK (which is destroyed on account deletion), the ciphertext is mathematically unreadable by us.
- **Law enforcement requests** — formal legal process required. We publish an annual transparency report (post-launch) summarising the volume + jurisdictions of requests received and outcomes (`compliance.md §13` once the first report ships).
- `[COUNSEL]` for the formal language; this section is the founder-level position, not the legally-reviewed text.

## 11. Pre-launch compliance checklist

- [ ] DPIA drafted and reviewed.
- [ ] Privacy policy and ToS **drafted (EN + JP v0)** in-repo before any signup is opened, even pre-counsel — without a published policy, signup cannot lawfully process EU/JP/CA users. Counsel review is the next gate.
- [ ] Privacy policy and ToS reviewed by counsel — **JP-language versions reviewed by JP-qualified counsel** (APPI + consumer protection).
- [ ] DPIA filled in by founder (controller block, JP address, draft date) and signed off by EU + JP counsel — placeholders resolved.
- [ ] Anthropic ZDR contract countersigned + PDF archived. **No production traffic until done.** Until then: privacy policy must disclose 30-day retention OR all paid-LLM calls hit a ZDR-confirmed account.
- [ ] Sub-processor list published at `/sub-processors` (EN + JP) — generated from the single source `packages/legal/sub-processors.ts`.
- [ ] Sub-processor 30-day notice mechanism live (Resend list + opt-in form on `/sub-processors`).
- [ ] DPAs with all sub-processors (Anthropic, Cloudflare, Supabase, Google, Apple, LINE, Stripe, Resend, Sentry, PostHog, Upstash, AWS).
- [ ] Executed SCCs + TIAs archived per US sub-processor at `private/legal/transfers/`. UK addendum executed for any UK-user-touching vendor.
- [ ] Cookie banner active in required regions; consent state machine wired with PostHog + Sentry init gated on consent.
- [ ] Data export tested end-to-end; signed app-local URL flow (not direct storage URL) verified; `audit_log.jsonl` in archive; `format_version` semver in `manifest.json`.
- [ ] Account deletion path tested end-to-end including the transactional sequence per §3.3, with KMS DEK destruction LAST. Deletion-queue retry job verified.
- [ ] First DR drill executed and documented at `private/runbooks/dr-drills.md` — including the crypto-erasure verification (delete test user, restore backup from before deletion, confirm ciphertext present but un-decryptable).
- [ ] Incident response runbook (`private/runbooks/incident-response.md`) drafted; alerting wire-up tested with a dry-run alert (Sentry → email + Pushover/Telegram → founder phone).
- [ ] Breach response runbook on file (covers GDPR 72h, LGPD 2-day, APPI PPC "without delay" reporting).
- [ ] Lead EU supervisory authority identified.
- [ ] Records of processing activities (ROPA) established.
- [ ] Contact addresses live: `privacy@` (English), `privacy-jp@` (Japanese), `support@`, `support-jp@`. **Inbound mailbox provisioning verified** (MX records, forwarding rules, JP auto-acknowledgement template at `packages/i18n/ja/dsar-ack.json`) per `deployment.md §5.6`.
- [ ] Marketing copy audit against §4 — **both EN and JP locales**.
- [ ] EU representative (Prighter or equivalent) under contract once first EU sign-up arrives.
- [ ] AGPL `/source` page live, linking to GitHub repo + deployed commit SHA.

## 12. Open questions (compliance)

Resolved at planning stage:

- Founder entity: 個人事業主 (Japan sole proprietor) at v1; governing law = Japan; revisit incorporation at ~¥1M ARR.
- EU representative: appoint Prighter (or equivalent) when the first EU sign-up arrives — no in-region presence required.
- DSAR: email-only at v1 (`privacy@`, `privacy-jp@`); build a dedicated portal post-launch if volume warrants.
- Minimum age: 16+ globally — avoids GDPR-K parental-consent complexity.
- SOC 2: defer until first B2B-curious enterprise asks.

Remaining TODOs surfaced as work items, not unresolved decisions — see [`./questions.md`](./questions.md).
