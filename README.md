# Nuansu

[![License: AGPL v3](https://img.shields.io/github/license/JoaoPucci/nuansu?style=flat-square)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/JoaoPucci/nuansu/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/JoaoPucci/nuansu/actions/workflows/ci.yml)

A translation copilot for personal messages across a language barrier.

Nuansu helps a non-speaker write faithful, tone-correct messages in another language without losing names, register, or meaning to an LLM's authorial drift. Two parallel translation passes (literal + natural), an explainable audit list of every change, per-chat preferences, and a chat-shaped UI keep the user in control of what gets sent.

> Status: Phase 1 scaffolding shipped (Vite + React + Hono on Cloudflare Pages, DB/Redis/MinIO/mailcrab via Docker, CI green); Phase 2 (foundation modules + DB) next. Built in public, dogfooded daily once Phase 6 (translation orchestrator) lands.

## Why this exists

LLMs are competent literal translators but bad writing partners for non-speakers. They naturalise under the guise of fluency — silently rewriting proper nouns, flipping politeness registers, dropping qualifiers, adapting idioms without explaining the delta. If you can't read the output, you can't audit the tone, can't catch mangled names, can't tell when the AI rewrote your meaning.

Nuansu's prime directive is **anti-drift**: the source is sacred, every change is shown and sourced, the original is always recoverable. The product is shaped around audit and control rather than fluency and one-shot magic.

## What's in this repo

```
.
├── apps/web/                          # Vite + React frontend + Hono backend (one Cloudflare Pages app)
├── packages/
│   ├── schemas/                       # zod schemas shared across server + client
│   ├── prompts/                       # versioned LLM system prompts
│   └── i18n/                          # en + ja locale files
├── scripts/                           # env loader, wrangler-vars sync, other glue
├── docs/                              # planning docs that drive implementation
│   ├── README.md                      # index
│   ├── requirements.md                # what v1 does
│   ├── architecture.md                # system shape
│   ├── design_system.md               # design language
│   ├── front_end_architecture.md      # frontend implementation
│   ├── back_end_architecture.md       # backend implementation
│   ├── quality.md                     # TDD, complexity gates, AI guardrails
│   ├── security.md                    # threat model + controls
│   ├── compliance.md                  # GDPR/LGPD/APPI + positioning
│   ├── deployment.md                  # generic deploy guide
│   ├── dpia.md                        # GDPR Art. 35 starter outline
│   └── questions.md                   # remaining TODOs
├── .github/workflows/ci.yml           # quality gates (typecheck, lint, test, lighthouse, size, bench)
├── .claude/agents/                    # project reviewer subagents (design / security / compliance / prompt-eval / schema)
├── docker-compose.yml                 # postgres + redis + minio + mailcrab for local dev
├── lefthook.yml                       # pre-commit + pre-push hooks
├── AGENTS.md                          # working agreements for any contributor (human or AI)
└── CLAUDE.md                          # Claude-specific routing → AGENTS.md
```

If you're new, start with [`docs/README.md`](./docs/README.md). Before touching code, read [`AGENTS.md`](./AGENTS.md) — it captures the working agreements (TDD discipline, design enforcement, doc rules, PR checklist) that apply to every contributor.

## Working agreements

- [`AGENTS.md`](./AGENTS.md) — entry point for any contributor (human or AI). TDD discipline, acceptance-test no-edit rule, frontend design enforcement, doc rules, PR pre-flight checklist, project reviewer subagents.
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code-specific routing; auto-loads `AGENTS.md` and `private/BRIEFING.md` at session start.
- [`docs/quality.md`](./docs/quality.md) — testing layers, complexity gates, fitness functions, AI guardrails (the discipline that makes AI-assisted development safe at this scope).

## Stack at a glance

- **Frontend**: Vite + React 18 + TanStack Router + TypeScript + Tailwind + shadcn/ui
- **Backend**: Hono on Cloudflare Pages Functions (Workers runtime); Supabase Postgres + Storage in Tokyo; auth via **Better Auth** library running in our Worker (no auth vendor)
- **LLM**: Anthropic Claude Sonnet 4.6 (with prompt caching + zero-data-retention)
- **Hosting**: Cloudflare Pages (Tokyo PoPs) + Supabase (Northeast Asia 1)
- **Encryption**: AWS KMS root key (`ap-northeast-1`) + per-user envelope encryption
- **Payments**: Stripe USD; Stripe Tax handles JP consumption tax + FX

Full rationale and rejected alternatives in [`docs/architecture.md`](./docs/architecture.md).

## Status

This repo is public from day one. Phase 1 (scaffolding + tooling baseline) shipped on `2026-05-02`; Phase 2 (foundation modules + DB schema) is next. The docs in `/docs/` describe what will be built and how; `AGENTS.md` describes the agreements under which it gets built.

## License

[GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0). Copyleft for SaaS — anyone running a modified version as a network service must release their changes.

## Contact

For questions about the project, the docs, or building something similar, see the contact page on [nuansu.app](https://nuansu.app) once it's live.
