# Nuansu — Planning Docs

Nuansu is a cross-language chat copilot. It helps a non-speaker write faithful, tone-correct messages in another language without losing nuance, names, or meaning to the LLM's authorial drift.

This folder is the planning set that drives implementation. It describes the **narrowed v1 product** plus the architecture and operations needed to ship it as a polished SaaS. (An earlier private brainstorm exists outside the public repo.)

## Index

| Doc                                                      | Purpose                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| [requirements.md](./requirements.md)                     | What v1 does, who it's for, definition of done, happy paths, edge cases |
| [architecture.md](./architecture.md)                     | High-level system architecture, components, data flows, key decisions   |
| [design_system.md](./design_system.md)                   | Design language, brand voice, component patterns, mobile-first guidance |
| [front_end_architecture.md](./front_end_architecture.md) | Frontend stack, routing, state, streaming UX, performance               |
| [back_end_architecture.md](./back_end_architecture.md)   | API surface, database schema, LLM integration, jobs, rate limits        |
| [quality.md](./quality.md)                               | TDD discipline, complexity gates, fitness functions, AI guardrails      |
| [security.md](./security.md)                             | Threat model, controls, encryption, vendor risk, abuse prevention       |
| [compliance.md](./compliance.md)                         | GDPR, LGPD, CCPA/CPRA, APPI, marketing/positioning posture              |
| [dpia.md](./dpia.md)                                     | GDPR Art. 35 starter outline; founder + counsel fill in markers         |
| [deployment.md](./deployment.md)                         | Public-repo-safe deploy guide: services, env vars, CI/CD, regions       |
| [questions.md](./questions.md)                           | Resolved decisions index + remaining work-item TODOs                    |

## Reading order

If you're new to the project, read in this order:

1. **requirements.md** to learn the product.
2. **architecture.md** to learn the shape of the system.
3. **design_system.md** to feel the UX bar.
4. **front_end_architecture.md** + **back_end_architecture.md** in parallel — they describe the two halves of the same machine.
5. **quality.md** to understand the testing discipline, complexity gates, and AI guardrails that wrap both halves.
6. **security.md** + **compliance.md** to understand non-negotiables baked into the design.
7. **deployment.md** when you're ready to provision.
8. **questions.md** to see what's still pending founder input.

## Status

- Date: 2026-05-02
- Phase: Phase 1 (scaffolding + tooling) shipped; Phase 2 (foundation modules + DB) next
- Owner: solo founder (dogfood user), Japan-resident, launching as 個人事業主 (sole proprietor)
- Domain: `nuansu.app`
- Vendor stack: Cloudflare Pages (Tokyo PoPs) + Supabase Postgres+Storage (Tokyo / Northeast Asia 1) + Better Auth (in our Worker, no auth vendor) + Anthropic Claude Sonnet 4.6 + Stripe (USD) + AWS KMS
- Positioning: globally-shaped product, JP-primary user base, broad marketing surface
- Repo: public from day 1, AGPL-3.0 licensed
