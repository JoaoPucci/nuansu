// Shared helper schemas reused across translation, requests, and prefs.
// Sourced from docs/back_end_architecture.md §5.1 (RecentThreadTurn,
// PrefsSnapshot) — these are the ground-truth shapes the LLM orchestrator
// and client both consume.

import { z } from "zod";

export const RecentThreadTurnSchema = z.object({
  author: z.enum(["mine", "theirs"]),
  source: z.string(),
  target: z.string(),
});

export type RecentThreadTurn = z.infer<typeof RecentThreadTurnSchema>;

export const PrefsSnapshotSchema = z.object({
  source_lang: z.string().min(2),
  target_lang: z.string().min(2),
  register: z.string().nullable(),
  naturalness: z.number().int().min(0).max(100),
  my_nickname: z.string().nullable(),
  contact_name_src: z.string().nullable(),
  contact_name_tgt: z.string().nullable(),
  notes: z.string().nullable(),
  explain_verbosity: z.enum(["terse", "standard", "verbose"]),
});

export type PrefsSnapshot = z.infer<typeof PrefsSnapshotSchema>;

export const NameLockRefSchema = z.object({
  source_form: z.string().min(1),
  target_form: z.string().min(1).optional(),
});

export type NameLockRef = z.infer<typeof NameLockRefSchema>;

// UUIDv7 strings (36 chars, time-ordered). Used everywhere we generate IDs
// app-side (chats, messages, audit_points, etc. — see docs/back_end_architecture.md §3 note).
export const UuidV7Schema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Must be a UUIDv7 string (version digit 7, RFC 4122 variant 8/9/a/b)",
  );
