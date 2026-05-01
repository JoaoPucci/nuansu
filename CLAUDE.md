# CLAUDE.md

This project uses **`AGENTS.md`** as the single source of truth for AI-tool working agreements (TDD discipline, acceptance-test no-edit rule, design enforcement, documentation discipline, PR pre-flight checklist). The shared file captures everything Claude needs to know; nothing Claude-specific is layered on top.

The two imports below pull `AGENTS.md` and the founder-curated `private/BRIEFING.md` into the system context. They auto-load at session start and survive `/compact` (the harness re-reads them from disk and re-injects after compaction). This keeps both reliably "fresh" through long sessions without depending on Claude remembering to follow a prose pointer.

@AGENTS.md
@private/BRIEFING.md

If a Claude-specific rule emerges in the future (e.g., a Claude-only skill invocation pattern), add it above the imports as a thin top layer; the rule of thumb is that this file stays short and the substance lives in `AGENTS.md`.

**Note for editing:** changes to `AGENTS.md` or `private/BRIEFING.md` mid-session do not auto-reload — run `/compact` or restart `claude` to pick up edits.
