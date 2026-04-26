# Nuansu

A translation copilot for personal messages across a language barrier.

Nuansu helps a non-speaker write faithful, tone-correct messages in another language without losing names, register, or meaning to an LLM's authorial drift. Two parallel translation passes (literal + natural), an explainable audit list of every change, per-chat preferences, and a chat-shaped UI keep the user in control of what gets sent.

> Status: pre-implementation. Planning is complete. Build starts soon. Built in public.

## Why this exists

LLMs are competent literal translators but bad writing partners for non-speakers. They naturalise under the guise of fluency — silently rewriting proper nouns, flipping politeness registers, dropping qualifiers, adapting idioms without explaining the delta. If you can't read the output, you can't audit the tone, can't catch mangled names, can't tell when the AI rewrote your meaning.

Nuansu's prime directive is **anti-drift**: the source is sacred, every change is shown and sourced, the original is always recoverable. The product is shaped around audit and control rather than fluency and one-shot magic.

## What's in this repo

```
.
└── docs/                              # planning docs that drive implementation
    ├── README.md                      # index
    ├── requirements.md                # what v1 does
    ├── architecture.md                # system shape
    ├── design_system.md               # design language
    ├── front_end_architecture.md      # frontend implementation
    ├── back_end_architecture.md       # backend implementation
    ├── security.md                    # threat model + controls
    ├── compliance.md                  # GDPR/LGPD/APPI + positioning
    ├── deployment.md                  # generic deploy guide
    ├── dpia.md                        # GDPR Art. 35 starter outline
    └── questions.md                   # remaining TODOs
```

If you're new, start with [`docs/README.md`](./docs/README.md).

## Stack at a glance

- **Frontend**: Vite + React 18 + TanStack Router + TypeScript + Tailwind + shadcn/ui
- **Backend**: Hono on Cloudflare Pages Functions (Workers runtime); Supabase Postgres + Storage in Tokyo; auth via **Better Auth** library running in our Worker (no auth vendor)
- **LLM**: Anthropic Claude Sonnet 4.6 (with prompt caching + zero-data-retention)
- **Hosting**: Cloudflare Pages (Tokyo PoPs) + Supabase (Northeast Asia 1)
- **Encryption**: AWS KMS root key (`ap-northeast-1`) + per-user envelope encryption
- **Payments**: Stripe USD; Stripe Tax handles JP consumption tax + FX

Full rationale and rejected alternatives in [`docs/architecture.md`](./docs/architecture.md).

## Status

This repo is public from day one. Implementation has not started. The docs in `/docs/` describe what will be built and how.

## License

[GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0). Copyleft for SaaS — anyone running a modified version as a network service must release their changes.

## Contact

For questions about the project, the docs, or building something similar, see the contact page on [nuansu.app](https://nuansu.app) once it's live.
