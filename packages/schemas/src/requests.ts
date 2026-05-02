// API request bodies for the streaming translation endpoints.
// docs/back_end_architecture.md §5.1 (TranslateRequest, InboundRequest)
// + §5.1.1 (recent_thread window).

import { z } from "zod";
import { NameLockRefSchema, PrefsSnapshotSchema, RecentThreadTurnSchema } from "./common.js";
import { TranslationObjectSchema } from "./translation.js";

// `idempotency_key` is opaque to the schema (Stripe-style: 64-char alphanumeric
// is the conventional client choice but server treats as a freeform key).
const IdempotencyKeySchema = z.string().min(1).max(255);

// `user_id` matches Better Auth's text IDs (UUID-shaped strings) — see
// back_end §3.1 note.
const UserIdSchema = z.string().min(1);

// `recent_thread` discipline (§5.1.1):
//   - at most 10 turns
//   - per-turn truncation handled server-side (we just validate count here)
const RecentThreadSchema = z.array(RecentThreadTurnSchema).max(10);

// `.strict()` on both request schemas: unknown keys produce a validation
// error rather than being silently stripped (zod default). At the API
// boundary, strict rejection catches client/server contract drift early
// and prevents cross-endpoint mistakes (e.g., sending TranslateRequest
// fields to /inbound) from being swallowed. Internal types and DB-shape
// schemas stay loose; only the wire-input boundary is strict.

export const TranslateRequestSchema = z
  .object({
    draft_source_text: z.string().min(1),
    prior_translation: TranslationObjectSchema.optional(),
    refine_instruction: z.string().optional(),
    prefs_snapshot: PrefsSnapshotSchema,
    name_locks: z.array(NameLockRefSchema),
    recent_thread: RecentThreadSchema,
    idempotency_key: IdempotencyKeySchema,
    user_id: UserIdSchema,
  })
  .strict();

export type TranslateRequest = z.infer<typeof TranslateRequestSchema>;

export const InboundRequestSchema = z
  .object({
    pasted_target_text: z.string().min(1),
    prefs_snapshot: PrefsSnapshotSchema,
    name_locks: z.array(NameLockRefSchema),
    recent_thread: RecentThreadSchema,
    idempotency_key: IdempotencyKeySchema,
    user_id: UserIdSchema,
  })
  .strict();

export type InboundRequest = z.infer<typeof InboundRequestSchema>;
