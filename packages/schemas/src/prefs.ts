// User preference schemas: GlobalPrefs (preferences_global table),
// ChatPrefs (preferences_chat table), NameLock (name_locks table).
// docs/back_end_architecture.md §3.1.

import { z } from "zod";
import { UuidV7Schema } from "./common.js";

// ─── GlobalPrefs (preferences_global) ──────────────────────────────────────

export const ExplainVerbositySchema = z.enum(["terse", "standard", "verbose"]);
export const ModelTierSchema = z.enum(["standard", "priority"]);

export const GlobalPrefsSchema = z.object({
  user_id: z.string().min(1),
  default_target_lang: z.string().min(2),
  default_register: z.string().nullable(),
  default_naturalness: z.number().int().min(0).max(100),
  names_are_sacred: z.boolean(),
  explain_verbosity: ExplainVerbositySchema,
  preferred_model_tier: ModelTierSchema,
});

export type GlobalPrefs = z.infer<typeof GlobalPrefsSchema>;

// ─── ChatPrefs (preferences_chat) ──────────────────────────────────────────
// All fields are nullable overrides — null means "fall back to GlobalPrefs".

export const ChatPrefsSchema = z.object({
  chat_id: UuidV7Schema,
  target_language: z.string().min(2).nullable(),
  register: z.string().nullable(),
  naturalness: z.number().int().min(0).max(100).nullable(),
  my_nickname: z.string().nullable(),
  contact_name_src: z.string().nullable(),
  contact_name_tgt: z.string().nullable(),
  notes: z.string().nullable(),
});

export type ChatPrefs = z.infer<typeof ChatPrefsSchema>;

// ─── NameLock (name_locks) ─────────────────────────────────────────────────
// chat_id null => global lock applied to every chat for this user.
// prior_canonical => true if this name was the chat's canonical contact name
// before being replaced via a drift suggestion (compose-time hint UX, §5.4).

export const NameLockSchema = z.object({
  id: UuidV7Schema,
  user_id: z.string().min(1),
  chat_id: UuidV7Schema.nullable(),
  source_form: z.string().min(1),
  target_form: z.string().min(1).nullable(),
  notes: z.string().nullable(),
  prior_canonical: z.boolean(),
});

export type NameLock = z.infer<typeof NameLockSchema>;
