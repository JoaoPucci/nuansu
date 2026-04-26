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
- 2022 amendment: cross-border transfers require disclosure. We disclose in the privacy policy that data is processed in:
  - Japan (Supabase Tokyo primary store; Cloudflare Tokyo PoPs; Upstash Tokyo; AWS KMS Tokyo).
  - United States (Anthropic, Stripe, Sentry, Resend, Google OAuth, Apple OAuth).
  - European Union (PostHog).
  - Global edge (Cloudflare).
- 2023 amendment (incident reporting): data breaches affecting JP residents must be reported to the Personal Information Protection Commission (PPC) without delay; covered in the incident-response runbook.

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
  - `usage.csv` (counts only; no content).
  - `manifest.json` (export timestamp, data scope, format version).
- Delivered via a signed download URL emailed to the user; URL expires in 7 days.
- Request rate-limited to 1 per 24 hours.
- DSAR contact addresses: `privacy@nuansu.app` (English, primary) and `privacy-jp@nuansu.app` (Japanese, with JP-language acknowledgement template). JP users receive auto-acknowledgement in JP within 24h; full response within the regulatory window for their jurisdiction.

### 3.2 Right of rectification

- All user-editable fields are settings-editable.
- Messages themselves are immutable (committed). To "correct" a message, the user posts a new one; the original remains for audit.

### 3.3 Right to erasure

- Settings → "Delete my account". Two-step confirmation, requires re-auth.
- Soft-deleted immediately; user is logged out; account cannot be re-opened.
- Hard-deletion runs at scheduled time (max 30 days).
- Hard-deletion sequence:
  1. Delete user's DEK from the wrapped key store → all field-encrypted content is now cryptographically erased.
  2. Delete `messages`, `message_versions`, `audit_points`, `chats`, `preferences_*`, `name_locks`, `usage_events`, `subscriptions` rows.
  3. Anonymise audit_log entries: `user_id` set to NULL, ip nulled, `metadata` redacted.
  4. Notify Stripe to delete the customer (or anonymise per Stripe's retention rules).
  5. Notify Resend to suppress further mail.
  6. Confirmation email to the user from a generic system address.
- Backups: deletion eventually propagates as backups age out. Privacy policy states that backups retain data up to 35 days post-deletion.

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

Drafted from a template; submitted within 72h of awareness via the lead supervisory authority's portal. Template lives in an internal `/runbooks/incident-response.md` (not in this repo).

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

Public sub-processor list maintained at `/sub-processors` on the marketing site:

| Sub-processor              | Purpose                                                                       | Region                             | Transfer mechanism |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- | ------------------ |
| Anthropic (Claude)         | LLM inference                                                                 | US (APAC endpoint where available) | DPA + SCCs + ZDR   |
| Cloudflare                 | Hosting (Pages + Functions), DNS, WAF, DDoS, Turnstile captcha                | Tokyo PoPs (primary), global edge  | DPA + SCCs         |
| Supabase                   | Postgres + Storage **only** (no auth)                                         | Northeast Asia 1 (Tokyo)           | DPA + SCCs         |
| Google (OAuth)             | Sign-in identity provider — `email profile` scope only                        | US/global                          | DPA                |
| Apple (Sign in with Apple) | Sign-in identity provider — `email name` scope only                           | US/global                          | DPA                |
| LINE                       | LINE Login OAuth — `profile openid` scope only                                | JP                                 | DPA                |
| Stripe                     | Payments + Stripe Tax                                                         | US/EU                              | DPA + SCCs         |
| Resend                     | Transactional email (Better Auth magic links + Stripe receipts + system mail) | US                                 | DPA + SCCs         |
| Sentry                     | Error monitoring                                                              | US (EU plan available)             | DPA + SCCs         |
| PostHog                    | Product analytics (opt-in for EU)                                             | EU                                 | DPA                |
| Upstash                    | Rate limit / cache                                                            | Tokyo region                       | DPA + SCCs         |
| AWS                        | KMS root key only                                                             | `ap-northeast-1` (Tokyo)           | DPA + SCCs         |

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

## 11. Pre-launch compliance checklist

- [ ] DPIA drafted and reviewed.
- [ ] Privacy policy and ToS reviewed by counsel — **JP-language versions reviewed by JP-qualified counsel** (APPI + consumer protection).
- [ ] Sub-processor list published at `/sub-processors` (EN + JP).
- [ ] DPAs with all sub-processors (Anthropic, Cloudflare, Supabase, Google, Apple, LINE, Stripe, Resend, Sentry, PostHog, Upstash, AWS).
- [ ] Cookie banner active in required regions.
- [ ] Data export and deletion paths tested; JP-language acknowledgement template verified.
- [ ] Breach response runbook on file (covers GDPR 72h, LGPD 2-day, APPI PPC reporting).
- [ ] Lead EU supervisory authority identified.
- [ ] Records of processing activities (ROPA) established.
- [ ] Contact addresses live: `privacy@` (English), `privacy-jp@` (Japanese), `support@`, `support-jp@`.
- [ ] Marketing copy audit against §4 — **both EN and JP locales**.
- [ ] EU representative (Prighter or equivalent) under contract once first EU sign-up arrives.

## 12. Open questions (compliance)

Resolved at planning stage:

- Founder entity: 個人事業主 (Japan sole proprietor) at v1; governing law = Japan; revisit incorporation at ~¥1M ARR.
- EU representative: appoint Prighter (or equivalent) when the first EU sign-up arrives — no in-region presence required.
- DSAR: email-only at v1 (`privacy@`, `privacy-jp@`); build a dedicated portal post-launch if volume warrants.
- Minimum age: 16+ globally — avoids GDPR-K parental-consent complexity.
- SOC 2: defer until first B2B-curious enterprise asks.

Remaining TODOs surfaced as work items, not unresolved decisions — see [`./questions.md`](./questions.md).
