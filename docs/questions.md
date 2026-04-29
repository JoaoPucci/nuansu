# Open Questions & Remaining TODOs — Nuansu v1

The 43-item open-questions list from the planning round has been resolved. This doc is now a short index of decisions and a punch list of work items the founder must execute outside the codebase.

## Resolved decisions (single source of truth lives in the linked doc-section)

| Decision                                                                                                                                                                                                                                                                                                                | Pointer                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Vendor stack: **Cloudflare Pages (Tokyo PoPs)** for hosting + **Supabase Postgres + Storage (Tokyo)** + **Better Auth** in our Worker (no auth vendor) + Anthropic Claude + Stripe USD + Upstash Redis (Tokyo) + Resend + Sentry + PostHog EU + AWS KMS `ap-northeast-1` + Cloudflare WAF/DDoS/Turnstile + Better Stack | [`architecture.md §7`](./architecture.md), [`deployment.md §2`](./deployment.md)                           |
| Frontend stack: **Vite + React 18 + TanStack Router + Tailwind + shadcn/ui**; marketing prerendered via vite-react-ssg; PWA via vite-plugin-pwa                                                                                                                                                                         | [`front_end_architecture.md §1`](./front_end_architecture.md)                                              |
| API stack: **Hono on Cloudflare Pages Functions (Workers runtime)**; SSE streaming via Web Streams                                                                                                                                                                                                                      | [`back_end_architecture.md §1`](./back_end_architecture.md)                                                |
| Auth: **Better Auth** library in our Hono Worker; auth tables in our Postgres; email magic link + Google + Apple + LINE Login (LINE via generic OAuth provider plugin)                                                                                                                                                  | [`back_end_architecture.md §4`](./back_end_architecture.md), [`security.md §3`](./security.md)             |
| Pricing: Free + Pro $12/month USD only; 14-day no-card trial; Stripe Tax handles JP consumption tax + FX                                                                                                                                                                                                                | [`requirements.md §5.8`](./requirements.md), [`deployment.md §5.5`](./deployment.md)                       |
| Free-tier model: Sonnet 4.6 for everyone, gated by 10/day rolling-24h quota                                                                                                                                                                                                                                             | [`back_end_architecture.md §5.4`](./back_end_architecture.md)                                              |
| Marketing posture: globally-shaped product, broad surface; dating dogfood story OK in long-form only                                                                                                                                                                                                                    | [`compliance.md §4`](./compliance.md), [`design_system.md §3`](./design_system.md)                         |
| Marketing site: bilingual EN + JP at launch (`/[locale]/...`); app UI EN-only at v1                                                                                                                                                                                                                                     | [`front_end_architecture.md §2`](./front_end_architecture.md), [`requirements.md §6.6`](./requirements.md) |
| JP user trust: `support-jp@`, `privacy-jp@` with JP-language acknowledgement template                                                                                                                                                                                                                                   | [`compliance.md §3.1`](./compliance.md)                                                                    |
| Founder entity: 個人事業主 (Japan sole proprietor) at v1; revisit incorporation around ¥1M ARR                                                                                                                                                                                                                          | [`compliance.md §1.4`](./compliance.md)                                                                    |
| Tenancy: B2C only (no orgs); RLS + app-layer wrapper as defence-in-depth                                                                                                                                                                                                                                                | [`back_end_architecture.md §3.3`](./back_end_architecture.md)                                              |
| ID format: UUIDv7 app-side                                                                                                                                                                                                                                                                                              | [`back_end_architecture.md §3`](./back_end_architecture.md)                                                |
| Encryption: AWS KMS root key, per-user DEK, XChaCha20-Poly1305 fields                                                                                                                                                                                                                                                   | [`security.md §4`](./security.md)                                                                          |
| Minimum age: 16+ globally                                                                                                                                                                                                                                                                                               | [`compliance.md §1.5`](./compliance.md)                                                                    |
| EU representative: appoint Prighter (or equivalent) when first EU sign-up arrives                                                                                                                                                                                                                                       | [`compliance.md §1.1`](./compliance.md)                                                                    |
| Roadmap parking: voice, date mode, sticker semantics, red-flag banner, auto-flashcards, keyboard extension, BYO-API-key/E2E                                                                                                                                                                                             | [`requirements.md §3`](./requirements.md), [`architecture.md §11`](./architecture.md)                      |
| Post-MVP feature order: cultural footnotes → reference-check surfacing → auto-flashcards                                                                                                                                                                                                                                | (this doc, below)                                                                                          |
| Domain: `nuansu.app`                                                                                                                                                                                                                                                                                                    | All docs                                                                                                   |
| Repo: public from day 1 (root `README.md` + `LICENSE` (AGPL-3.0) + `.gitignore`); inception brainstorm gitignored, not published                                                                                                                                                                                        | Repo root                                                                                                  |
| JP marketing copy: AI-translated for v1; commission a JP marketer post-launch for tone                                                                                                                                                                                                                                  | (this doc, "Remaining TODOs")                                                                              |
| JP-qualified counsel: template-based privacy/ToS at v1; counsel review post-launch (or pre-launch if budget permits)                                                                                                                                                                                                    | [`compliance.md §11`](./compliance.md), [`dpia.md`](./dpia.md)                                             |
| Brand wordmark: AI-generated typographic wordmark for v1; commission a designer post-launch                                                                                                                                                                                                                             | (this doc, "Remaining TODOs")                                                                              |
| Colour palette: **Aizome (`#3D5A80`)** with full light + dark token sets locked                                                                                                                                                                                                                                         | [`design_system.md §4`](./design_system.md)                                                                |
| DPIA: starter outline drafted ([`dpia.md`](./dpia.md)); founder fills `[FOUNDER:]` markers; counsel reviews `[COUNSEL:]` markers                                                                                                                                                                                        | [`dpia.md`](./dpia.md)                                                                                     |
| Anthropic ZDR + DPA timing: request after first prototype works, not pre-build                                                                                                                                                                                                                                          | (Remaining TODOs §post-prototype)                                                                          |

## Remaining TODOs — work items, not unresolved decisions

These are real things to do, owned by the founder, that don't change the design but must happen before or shortly after public launch.

### Pre-launch — blocking

1. **Stripe Japan onboarding as 個人事業主.** Submit My Number, residence card, JP bank account. Default-enabled methods: Visa, MC, Apple Pay, Google Pay. Then request **JCB** approval (1–3 days). Confirm at least one live-mode purchase end-to-end before launch.
2. **DPIA (GDPR Art. 35).** Starter outline drafted at [`dpia.md`](./dpia.md). Fill in `[FOUNDER:]` markers (legal name + address, dates). Have counsel resolve `[COUNSEL:]` markers post-prototype.
3. **DPAs with sub-processors.** Cloudflare, Supabase, Google, Apple, LINE, Stripe, Resend, Sentry, PostHog, Upstash, AWS. (Anthropic moved to post-prototype.)
4. **Privacy Policy + ToS templates** drafted in EN and JP; AI-translated for JP at v1, with a "v1 — pending counsel review" notice in the footer. Counsel review post-launch.
5. **Wordmark for v1.** AI-generated typographic wordmark (e.g., set in a refined display face — Söhne, Inter Display, or Noto Serif JP for a literary feel). Commission a designer post-launch.
6. **JP-language email + UI templates** for Better Auth (magic link, email verification) and for `privacy-jp@` / `support-jp@` acknowledgements. AI-translated for v1; review by founder before send.
7. **Bilingual marketing copy authored.** Founder writes EN, AI-translates to JP, founder reviews JP. Commission a JP marketer for tone post-launch.

### Pre-launch — non-blocking but planned

8. **Status page** at `status.nuansu.app` (Better Stack) — provision and link from footer.
9. **Backups & restore drill.** Quarterly restore drill to staging; first one before public launch.

### Post-prototype (after the first translation flow works end-to-end)

10. **Anthropic ZDR + DPA.** Request via Anthropic support; sign and archive. Verify via probe call that ZDR is reflected. Doing this _after_ a working prototype means we know exactly what we're contracting on.
11. **JP-qualified counsel review** of Privacy Policy + ToS (EN and JP), DPIA, sub-processor list. APPI + JP consumer protection specifics. Budget guideline: ¥150–500k fixed-fee for a SaaS-experienced JP firm.
12. **Commission a designer** for a polished wordmark + brand application kit. Replace the AI/typographic v1 wordmark.
13. **Commission a JP marketer** for marketing-copy tone pass on the JP locale.

### Post-launch — scheduled

14. **EU representative appointment** (Prighter or equivalent) — trigger on first EU sign-up.
15. **Konbini payment-method follow-up** with Stripe — once revenue history is established or after 合同会社 incorporation.
16. **Bug-bounty programme** via huntr.dev or HackerOne managed — open after the first 100 paying users.
17. **Native iOS/Android apps** — target month 6.
18. **Korean language pair** as the second supported target language.
19. **合同会社 incorporation** — revisit at ~¥1M ARR or when:
    - A payment-method approval requires it.
    - External investment is on the table.
    - Liability concerns warrant it.
20. **SOC 2 Type I** — defer until first B2B-curious enterprise asks.

### Research items (informational, not decisions)

These don't block work. Verify when convenient.

21. **Anthropic prompt-cache hit rate** at the v1 system-prompt size and request cadence. Default assumption: ≥ 80%. Post-implementation measurement.
22. **Anthropic APAC inference endpoint availability** — currently US-primary; if APAC ships, point Tokyo Worker at it for lower RTT.
23. **Cold-start latency** of Cloudflare Worker → Supabase Tokyo for streaming routes — measure and tune connection pooling if needed.

## Adding new questions

If a new genuinely-unresolved question surfaces during implementation, add it under a "New open questions" heading at the bottom of this doc. Don't duplicate questions that already have an answer in another doc — just link to that doc instead.
