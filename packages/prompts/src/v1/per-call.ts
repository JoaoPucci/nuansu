// Per-chat and per-call layer builders.
//
// `buildChatPrefsLayer` produces section 3 (Context) — the per-chat cache
// layer. Stable across consecutive calls in the same chat; varies between
// chats. The orchestrator caches it with `cache_control: { ephemeral }`.
//
// `buildPerCallLayer` produces sections 4 (Name locks), 6 (Recent thread),
// and the Current task — the not-cached layer that varies per call.

import type { NameLockRef, PrefsSnapshot, RecentThreadTurn } from "@nuansu/schemas";

export interface PerCallInput {
  prefs: PrefsSnapshot;
  name_locks: readonly NameLockRef[];
  recent_thread: readonly RecentThreadTurn[];
  task:
    | { kind: "translate"; draft_source_text: string; refine_instruction?: string }
    | { kind: "inbound"; pasted_target_text: string };
}

export function buildChatPrefsLayer(prefs: PrefsSnapshot): string {
  const lines: string[] = [
    `# Context`,
    ``,
    `- Source language: ${prefs.source_lang}`,
    `- Target language: ${prefs.target_lang}`,
    `- Register: ${prefs.register ?? "(not set; infer from naturalness)"}`,
    `- Naturalness: ${prefs.naturalness}/100`,
    `- Explain verbosity: ${prefs.explain_verbosity}`,
  ];
  if (prefs.contact_name_src) {
    const tgt = prefs.contact_name_tgt ? ` (target: ${prefs.contact_name_tgt})` : "";
    lines.push(`- Contact: ${prefs.contact_name_src}${tgt}`);
  }
  if (prefs.my_nickname) {
    lines.push(`- User's nickname: ${prefs.my_nickname}`);
  }
  if (prefs.notes) {
    lines.push(`- Notes: ${prefs.notes}`);
  }
  return lines.join("\n");
}

function buildNameLocksSection(locks: readonly NameLockRef[]): string {
  if (locks.length === 0) {
    return `# Name locks\n\n(none — apply anti-drift rule 1 to all proper names in the source)`;
  }
  const lines = [`# Name locks`, ``, `Preserve these source forms verbatim in the output:`];
  for (const lock of locks) {
    const target = lock.target_form ? ` → "${lock.target_form}"` : ` (preserve as-is)`;
    lines.push(`- "${lock.source_form}"${target}`);
  }
  return lines.join("\n");
}

function buildRecentThreadSection(turns: readonly RecentThreadTurn[]): string {
  if (turns.length === 0) {
    return `# Recent thread\n\n(empty — first turn in this chat)`;
  }
  const lines = [
    `# Recent thread`,
    ``,
    `Prior conversation turns, oldest first. Both sides bilingual (source / target). DO NOT re-translate these — they are context only.`,
    ``,
  ];
  turns.forEach((turn, i) => {
    lines.push(`${i + 1}. **${turn.author}**`);
    lines.push(`   - source: ${turn.source}`);
    lines.push(`   - target: ${turn.target}`);
  });
  return lines.join("\n");
}

function buildTaskSection(task: PerCallInput["task"]): string {
  if (task.kind === "translate") {
    const lines = [
      `# Current task`,
      ``,
      `Translate the user's draft (source → target). Emit literal + natural + audit points + (optionally) one prefs_suggestion if drift detected.`,
      ``,
      `Source draft:`,
      `\`\`\``,
      task.draft_source_text,
      `\`\`\``,
    ];
    if (task.refine_instruction) {
      lines.push(``, `Refinement instruction from user:`, `> ${task.refine_instruction}`);
    }
    return lines.join("\n");
  }
  // inbound
  return [
    `# Current task`,
    ``,
    `Decode an inbound message the user received in the target language. Emit literal back-translation + natural-back paraphrase + gloss + (optionally) one prefs_suggestion if drift detected. The literal pass is the user's primary tool for understanding what was actually said; do not smooth it.`,
    ``,
    `Pasted target-language message:`,
    `\`\`\``,
    task.pasted_target_text,
    `\`\`\``,
  ].join("\n");
}

export function buildPerCallLayer(
  input: Pick<PerCallInput, "name_locks" | "recent_thread" | "task">,
): string {
  return [
    buildNameLocksSection(input.name_locks),
    ``,
    buildRecentThreadSection(input.recent_thread),
    ``,
    buildTaskSection(input.task),
  ].join("\n");
}
