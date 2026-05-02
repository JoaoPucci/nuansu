// Account, billing, and usage schemas: User (users + auth_users projection),
// Subscription (subscriptions table), UsageEvent (usage_events table).
// docs/back_end_architecture.md §3.1.

import { z } from "zod";
import { UuidV7Schema } from "./common.js";

// ─── User ──────────────────────────────────────────────────────────────────
// Public-facing projection of `users` joined to `auth_users` (id, email,
// email_verified). Excludes secret fields (dek_wrapped). Used as the shape
// the client sees via `GET /api/me`.

export const LocaleSchema = z.enum(["en", "ja"]);
export const RegionSchema = z.enum(["jp", "us", "eu"]);

// Coachmark IDs — fixed set per back_end §3.4. Adding a new coachmark
// requires updating this enum AND the trigger that fires it (front_end
// §6.3); both land in the same PR. The strict enum rejects typos and
// stale IDs at the API boundary instead of silently persisting them
// (which would re-fire the coachmark on every session).
export const CoachmarkIdSchema = z.enum([
  "composer_first_translate",
  "audit_points_first",
  "view_toggle_first",
  "refine_first",
]);

export type CoachmarkId = z.infer<typeof CoachmarkIdSchema>;

export const OnboardingStateSchema = z.object({
  sample_chat_id: UuidV7Schema.optional(),
  dismissed_coachmarks: z.array(CoachmarkIdSchema),
  // ISO timestamp stamped when the user archives the sample chat or taps
  // "Use real chats" (back_end §3.4 lifecycle step 4). Absent until completion.
  completed_at: z.iso.datetime().optional(),
});

export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export const UserSchema = z.object({
  id: z.string().min(1), // text id from auth_users (UUID-shaped)
  email: z.email(),
  email_verified: z.boolean(),
  display_name: z.string().nullable(),
  source_language: z.string().min(2),
  locale: LocaleSchema,
  region: RegionSchema,
  is_dogfood: z.boolean(),
  onboarding_state: OnboardingStateSchema,
  created_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
});

export type User = z.infer<typeof UserSchema>;

// ─── Subscription ──────────────────────────────────────────────────────────
// Mirrors the subscriptions table. `status` per Stripe lifecycle.

export const SubscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "none",
]);

export const SubscriptionPlanSchema = z.enum(["free", "pro"]);

export const SubscriptionSchema = z.object({
  user_id: z.string().min(1),
  stripe_customer_id: z.string().min(1),
  stripe_subscription_id: z.string().nullable(),
  status: SubscriptionStatusSchema,
  plan: SubscriptionPlanSchema,
  trial_ends_at: z.iso.datetime().nullable(),
  current_period_end: z.iso.datetime().nullable(),
  cancel_at_period_end: z.boolean(),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;

// ─── UsageEvent ────────────────────────────────────────────────────────────
// One row per LLM call. Used for quota, billing reconciliation, observability.
// Cost is denominated in micro-USD (1 USD = 1_000_000) to keep integer math.

export const UsageEventKindSchema = z.enum(["translate_outbound", "translate_inbound", "refine"]);

export const UsageEventSchema = z.object({
  id: UuidV7Schema,
  user_id: z.string().min(1),
  chat_id: UuidV7Schema.nullable(),
  kind: UsageEventKindSchema,
  model: z.string().min(1),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cached_tokens: z.number().int().nonnegative(),
  cost_micro_usd: z.number().int().nonnegative(),
  request_id: z.string().min(1),
  created_at: z.iso.datetime(),
});

export type UsageEvent = z.infer<typeof UsageEventSchema>;
