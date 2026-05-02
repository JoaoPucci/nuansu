// Translation domain: the assembled TranslationObject the LLM produces +
// the streaming chunks the orchestrator emits over SSE. Sourced from
// docs/back_end_architecture.md §5.2.

import { z } from "zod";
import { UuidV7Schema } from "./common.js";

// ─── AuditPoint ────────────────────────────────────────────────────────────
// One auditable change between literal and natural passes. `accepted` is
// tri-state: true / false (user decision), null (informational only).
// Categories per the audit_points table check constraint (back_end §3.1).

export const AuditPointCategorySchema = z.enum([
  "name",
  "register",
  "idiom",
  "tone",
  "ambiguity",
  "omission",
  "other",
]);

export type AuditPointCategory = z.infer<typeof AuditPointCategorySchema>;

export const AuditPointSchema = z.object({
  id: UuidV7Schema,
  category: AuditPointCategorySchema,
  before_text: z.string().nullable(),
  after_text: z.string().nullable(),
  rationale: z.string().min(1),
  accepted: z.boolean().nullable(),
});

export type AuditPoint = z.infer<typeof AuditPointSchema>;

// ─── PrefsSuggestion ───────────────────────────────────────────────────────
// In-flow drift detection output (back_end §5.4). Persisted to
// pref_suggestions table; surfaced as inline UI cards.

export const PrefsSuggestionFieldSchema = z.enum([
  "contact_name_src",
  "contact_name_tgt",
  "my_nickname",
  "register",
  "naturalness",
  "notes",
  "name_lock_add",
]);

export const PrefsSuggestionCategorySchema = z.enum([
  "name_reveal",
  "nickname_offer",
  "register_shift",
  "context_update",
]);

export const PrefsSuggestionSchema = z.object({
  id: UuidV7Schema,
  field: PrefsSuggestionFieldSchema,
  // `from` is `unknown | null` per the doc — current value, null for additive ops.
  // We model as nullable unknown; consumers narrow per field.
  from: z.unknown().nullable(),
  to: z.unknown(),
  evidence: z.object({
    message_id: UuidV7Schema,
    excerpt: z.string().min(1).max(200),
  }),
  confidence: z.enum(["low", "med", "high"]),
  reasoning: z.string().min(1),
  category: PrefsSuggestionCategorySchema,
});

export type PrefsSuggestion = z.infer<typeof PrefsSuggestionSchema>;

// ─── TranslationObject ─────────────────────────────────────────────────────
// The assembled output the LLM produces (the resolved form of all stream
// chunks combined). Persisted to messages.* columns after `done` arrives.

export const TranslationObjectSchema = z.object({
  literal: z.string(),
  natural: z.string(),
  gloss: z.string().optional(),
  register: z
    .object({
      detected: z.string().optional(),
      chosen: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
  dialect: z
    .object({
      flags: z.array(z.string()),
    })
    .optional(),
  name_checks: z
    .array(
      z.object({
        name: z.string().min(1),
        preserved: z.boolean(),
      }),
    )
    .default([]),
  audit_points: z.array(AuditPointSchema).default([]),
  prefs_suggestions: z.array(PrefsSuggestionSchema).default([]),
});

export type TranslationObject = z.infer<typeof TranslationObjectSchema>;

// ─── TranslationStreamChunk ────────────────────────────────────────────────
// Discriminated union on `type`. The orchestrator emits these over SSE as
// the LLM's structured tokens stabilise. See docs/back_end_architecture.md §5.2.
//
// Every variant carries a `seq` field per back_end §2.3 ("each event is
// `data: <json>` where <json> is one fragment of the partial Translation
// Object plus a `seq` field"). Clients use `seq` for out-of-order detection,
// gap recovery, and replay safety. Strictly increasing per stream, starts
// at 0.

const SeqField = { seq: z.number().int().nonnegative() } as const;

export const TranslationStreamChunkSchema = z.discriminatedUnion("type", [
  z.object({ ...SeqField, type: z.literal("literal"), text_delta: z.string() }),
  z.object({ ...SeqField, type: z.literal("natural"), text_delta: z.string() }),
  z.object({ ...SeqField, type: z.literal("gloss"), text_delta: z.string() }),
  z.object({
    ...SeqField,
    type: z.literal("register"),
    detected: z.string().optional(),
    chosen: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  z.object({ ...SeqField, type: z.literal("dialect"), flags: z.array(z.string()) }),
  z.object({
    ...SeqField,
    type: z.literal("name_check"),
    name: z.string().min(1),
    preserved: z.boolean(),
  }),
  z.object({ ...SeqField, type: z.literal("audit_point"), point: AuditPointSchema }),
  z.object({
    ...SeqField,
    type: z.literal("prefs_suggestion"),
    suggestion: PrefsSuggestionSchema,
  }),
  z.object({ ...SeqField, type: z.literal("done") }),
  z.object({ ...SeqField, type: z.literal("error"), code: z.string(), message: z.string() }),
]);

export type TranslationStreamChunk = z.infer<typeof TranslationStreamChunkSchema>;
