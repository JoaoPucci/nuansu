# DPIA — Data Protection Impact Assessment, Nuansu v1

> **Starter outline.** This document is structured as a GDPR Article 35 DPIA. Sections marked with `[FOUNDER:]` need values filled in before launch; sections marked `[COUNSEL:]` need legal review. Keep this doc up to date as the product changes; archive each version with a date.

| Field                 | Value                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| Project               | Nuansu — cross-language messaging copilot                                      |
| Controller            | `[FOUNDER: legal name + address — e.g., 個人事業主 of <name> at <JP address>]` |
| DPO / privacy contact | `privacy@nuansu.app` (`privacy-jp@nuansu.app` for Japanese)                    |
| Scope                 | v1 product as described in `requirements.md`, `architecture.md`                |
| Date drafted          | `[FOUNDER: YYYY-MM-DD]`                                                        |
| Reviewers             | `[COUNSEL: name + qualification]`                                              |
| Version               | 0.1 (draft)                                                                    |

## 1. Description of processing

### 1.1 Nature

Nuansu is a SaaS that translates personal messages from one language to another, preserving names, register, and meaning. The user pastes or types messages; the system uses an LLM (Anthropic Claude) to produce literal + natural translations and explanatory metadata; messages and their version history are stored in the user's account.

### 1.2 Purposes

1. Provide the translation copilot service the user signed up for (lawful basis: contract performance — GDPR Art. 6(1)(b)).
2. Bill subscribers (lawful basis: contract).
3. Keep the service running, secure, and abuse-free (lawful basis: legitimate interest — Art. 6(1)(f)).
4. Optionally collect usage analytics (lawful basis: consent for EU/UK users — Art. 6(1)(a); legitimate-interest opt-out elsewhere).

### 1.3 Categories of personal data

| Category                              | Examples                                                               | Sensitivity                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Identifiers                           | email, OAuth IDs (Google/Apple/LINE), session cookies                  | High                                                                                                                         |
| Account metadata                      | display name, locale, source language, preferences                     | Medium                                                                                                                       |
| **Message content (source + target)** | The actual translated messages and their history                       | **Critical** — by nature contains personal communication; may contain special-category data depending on what the user types |
| Audit metadata                        | gloss, register flags, dialect flags, audit-point rationales           | Medium                                                                                                                       |
| Billing                               | Stripe customer ID, subscription state, payment status                 | High (Stripe holds card data; we hold IDs only)                                                                              |
| Usage events                          | translation counts, model used, token totals, cost (no message bodies) | Low                                                                                                                          |
| Logs                                  | request IDs, IP, user agent (redacted)                                 | Medium                                                                                                                       |

### 1.4 Categories of data subjects

- **Nuansu users** (the founder's customers).
- **Conversation partners** of users — incidental data subjects when their messages are pasted in. The Nuansu user is the data controller of that pasted content; Nuansu is a processor for it.

### 1.5 Recipients (sub-processors)

Per `compliance.md §8` — Anthropic, Cloudflare, Supabase, Google, Apple, LINE, Stripe, Resend, Sentry, PostHog, Upstash, AWS.

### 1.6 Cross-border transfers

| Region          | Sub-processors there                                                      | Mechanism                                                   |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Japan (primary) | Supabase Tokyo, Cloudflare Tokyo PoPs, Upstash Tokyo, AWS KMS Tokyo, LINE | Controller is JP-domiciled — APPI direct                    |
| United States   | Anthropic, Stripe, Sentry, Resend, Google OAuth, Apple OAuth              | SCCs + transfer impact assessment + ZDR (Anthropic)         |
| European Union  | PostHog                                                                   | Adequate region for EU subjects; Japan ↔ EU adequate (2019) |
| Global edge     | Cloudflare (Pages, WAF, Turnstile)                                        | DPA + SCCs                                                  |

### 1.7 Retention

| Data                       | Retention             | Trigger            |
| -------------------------- | --------------------- | ------------------ |
| Account + content (active) | While account exists  | User keeps account |
| Soft-deleted content       | 30 days max           | Account deletion   |
| Backups                    | 35 days post-deletion | DB host PITR       |
| Logs                       | 30 days               | Rolling            |
| Usage events (aggregated)  | 13 months             | Rolling            |
| Audit log                  | 12 months             | Rolling            |

## 2. Necessity and proportionality

### 2.1 Lawful basis

For each purpose in §1.2, the lawful basis is identified. Special-category data (Art. 9) is _not_ an intended processing — but message content may incidentally contain it (health, sexual orientation, religious beliefs, etc.). Mitigation: we encrypt message content at the field level, do not log it, do not train on it, and treat it as Critical-class throughout.

### 2.2 Data minimisation

- We collect identifiers + the content the user explicitly creates.
- We do not request: phone number (unless future SMS feature), gender, age (beyond 16+ self-attestation), location.
- LLM prompts include only the snapshot needed for the current translation — not the full thread by default.

### 2.3 Storage limitation

Soft delete + 30-day hard purge with cryptographic erasure of the per-user DEK. Backups age out within 35 days of deletion.

### 2.4 Information rights

Privacy policy + sub-processor list disclose what we collect, why, and with whom we share. JP users get the same in JP at `privacy-jp@nuansu.app`.

### 2.5 User control rights (Art. 15–22)

| Right                                        | Implementation                                                     | Doc reference        |
| -------------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| Access (Art. 15)                             | Settings → Export my data                                          | `compliance.md §3.1` |
| Rectification (Art. 16)                      | Settings UI                                                        | `compliance.md §3.2` |
| Erasure (Art. 17)                            | Settings → Delete my account                                       | `compliance.md §3.3` |
| Restriction (Art. 18)                        | Settings → Pause processing                                        | `compliance.md §3.4` |
| Portability (Art. 20)                        | Same export, JSON format                                           | `compliance.md §3.1` |
| Object (Art. 21)                             | Analytics opt-out; no automated decision-making with legal effects | `compliance.md §3.5` |
| Not subject to automated decisions (Art. 22) | We do not use automated decisions producing legal effects          | n/a                  |

## 3. Risk assessment

For each risk: Source → What could go wrong → Who's affected → Severity (1–4) × Likelihood (1–4) = Score.

### 3.1 Risk inventory

| ID  | Risk                                                                                  | Severity | Likelihood | Score | Mitigations                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------- | -------- | ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Database breach exposes message content                                               | 4        | 2          | 8     | Field-level envelope encryption (security.md §4); RLS; least-privilege DB users                                                                |
| R2  | LLM provider retains and trains on prompts                                            | 4        | 1          | 4     | Anthropic ZDR contract + DPA; minimal context per call                                                                                         |
| R3  | Logging accidentally captures message content                                         | 3        | 2          | 6     | Logger redaction wrapper; CI lint banning raw `console.log`; Sentry scrubbing rules                                                            |
| R4  | Cross-tenant access bug exposes another user's chat                                   | 4        | 2          | 8     | App-layer ownership wrapper + Postgres RLS as defence-in-depth                                                                                 |
| R5  | Account takeover via phishing                                                         | 3        | 3          | 9     | Magic link / OAuth only (no passwords); MFA on paid tier; email-on-new-device alerts                                                           |
| R6  | Stale data in backups after deletion                                                  | 2        | 4          | 8     | 35-day retention disclosed; cryptographic erasure of DEK so backed-up ciphertext is useless                                                    |
| R7  | Sub-processor breach (Anthropic / Supabase / Stripe)                                  | 3        | 2          | 6     | DPAs + SOC2 attestations; vendor-risk monitoring; incident-response runbook                                                                    |
| R8  | DDoS / cost-exhaustion via LLM call flooding                                          | 2        | 3          | 6     | Per-IP and per-user rate limits; daily $ kill-switch per user                                                                                  |
| R9  | Misclassified data subject (a JP conversation partner whose messages flow through us) | 3        | 3          | 9     | ToS requires user warrants right to translate; pasted content treated as user-controlled; deletion of user account purges their pasted content |
| R10 | Children's data via under-16 sign-up                                                  | 3        | 2          | 6     | 16+ self-attestation; honour deletion requests from parents; no profiling features                                                             |

### 3.2 Specific concerns

- **Message content is sensitive by nature.** Even if the user doesn't paste explicit special-category data, intimate conversations can imply religious affiliation, sexual orientation, health status. We treat all message content as Critical-class.
- **Conversation partners do not consent to Nuansu.** They send a message to a Nuansu user; the user pastes it. The legal scaffolding: the user is the controller of that content; Nuansu is a processor. Mitigation in product: ToS; cryptographic erasure on user deletion (so partner content disappears too).
- **Voice / image / date-mode (roadmap)** will materially expand sensitivity. A second DPIA is required before any of those ship.

## 4. Risk treatment

### 4.1 Existing controls

Cross-referenced with `security.md` and `compliance.md`:

- TLS 1.3 in transit; HSTS; secure cookies.
- Field-level envelope encryption (XChaCha20-Poly1305 + per-user DEK + AWS KMS root).
- RLS + app-layer ownership.
- Logger redaction; Sentry PII scrubbing.
- Anthropic ZDR + DPA.
- Per-user daily $ cap and kill-switch.
- 16+ self-attestation; deletion + export self-serve.

### 4.2 Additional safeguards

- Quarterly third-party security review (light scope) post-launch.
- Annual penetration test once revenue justifies budget (~$10k).
- Bug-bounty programme via huntr.dev or HackerOne after first 100 paying users.

### 4.3 Residual risk

After mitigations, the residual risk is **acceptable** for a v1 launch given:

- The data sensitivity is bounded by what the user voluntarily inputs.
- Cryptographic erasure provides a clear delete story.
- No automated decision-making with legal effects.
- Sub-processor list and rights are fully disclosed.

`[COUNSEL:]` confirm residual risk acceptance and any additional mitigations required for JP / EU specifically.

## 5. Consultation

- **Internal**: founder (data controller).
- **External**: `[COUNSEL:]` JP-qualified counsel for APPI; EU-qualified counsel (or services like Prighter) for GDPR.
- **Data subjects**: not formally consulted at v1 (no representative bodies); privacy posture published transparently in privacy policy and at `/sub-processors`.

## 6. Sign-off

| Role                  | Name                                  | Date | Signature |
| --------------------- | ------------------------------------- | ---- | --------- |
| Controller            | `[FOUNDER:]`                          |      |           |
| Counsel (JP)          | `[COUNSEL:]`                          |      |           |
| Counsel (EU)          | `[COUNSEL:]` (Prighter or equivalent) |      |           |
| DPO / privacy contact | `[FOUNDER:]`                          |      |           |

## 7. Review schedule

- Every major feature release.
- Annually at minimum.
- Within 30 days of any in-scope incident.
- On any sub-processor change.

## 8. Version history

| Version | Date       | Author   | Change                                                                                                  |
| ------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-04-26 | Planning | Initial draft generated from `compliance.md` + `security.md`; awaiting founder values + counsel review. |
