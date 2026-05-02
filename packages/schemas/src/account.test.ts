import { describe, expect, it } from "vitest";
import { CoachmarkIdSchema, SubscriptionSchema, UsageEventSchema, UserSchema } from "./account.js";

const VALID_UUIDV7 = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5061";
const VALID_ISO_TS = "2026-05-03T12:34:56.000Z";
// Postgres timestamptz columns serialize with explicit timezone offsets
// through most drivers (e.g., `2026-05-03T21:34:56+09:00` for JST).
// Schemas accept both Z and offset forms — see {offset:true} on z.iso.datetime.
const VALID_ISO_TS_OFFSET = "2026-05-03T21:34:56+09:00";

describe("UserSchema", () => {
  const valid = {
    id: "usr_abc",
    email: "user@example.com",
    email_verified: true,
    display_name: "Joao",
    source_language: "en",
    locale: "en" as const,
    region: "jp" as const,
    is_dogfood: false,
    onboarding_state: { dismissed_coachmarks: [] },
    created_at: VALID_ISO_TS,
    deleted_at: null,
  };

  it("accepts a complete user", () => {
    expect(UserSchema.parse(valid)).toBeTruthy();
  });

  it("accepts null display_name", () => {
    expect(UserSchema.parse({ ...valid, display_name: null })).toBeTruthy();
  });

  it("accepts a soft-deleted user (deleted_at present)", () => {
    expect(UserSchema.parse({ ...valid, deleted_at: VALID_ISO_TS })).toBeTruthy();
  });

  it("accepts onboarding_state with sample_chat_id and dismissed coachmarks", () => {
    expect(
      UserSchema.parse({
        ...valid,
        onboarding_state: {
          sample_chat_id: VALID_UUIDV7,
          dismissed_coachmarks: ["composer_first_translate", "audit_points_first"],
        },
      }),
    ).toBeTruthy();
  });

  it("rejects unknown coachmark IDs (typo / stale ID protection — back_end §3.4)", () => {
    expect(() =>
      UserSchema.parse({
        ...valid,
        onboarding_state: {
          dismissed_coachmarks: ["composer_frist_translate"], // typo of …first…
        },
      }),
    ).toThrow();
  });

  it("preserves onboarding_state.completed_at on round-trip (back_end §3.4 lifecycle step 4)", () => {
    const parsed = UserSchema.parse({
      ...valid,
      onboarding_state: {
        dismissed_coachmarks: [],
        completed_at: VALID_ISO_TS,
      },
    });
    expect(parsed.onboarding_state.completed_at).toBe(VALID_ISO_TS);
  });

  it("rejects non-ISO completed_at in onboarding_state", () => {
    expect(() =>
      UserSchema.parse({
        ...valid,
        onboarding_state: {
          dismissed_coachmarks: [],
          completed_at: "yesterday",
        },
      }),
    ).toThrow();
  });

  it("rejects malformed email", () => {
    expect(() => UserSchema.parse({ ...valid, email: "not-an-email" })).toThrow();
  });

  it("rejects unknown locale", () => {
    expect(() => UserSchema.parse({ ...valid, locale: "fr" })).toThrow();
  });

  it("rejects unknown region", () => {
    expect(() => UserSchema.parse({ ...valid, region: "ap" })).toThrow();
  });

  it("rejects non-ISO created_at", () => {
    expect(() => UserSchema.parse({ ...valid, created_at: "yesterday" })).toThrow();
  });

  it("accepts ISO timestamps with explicit timezone offsets (Postgres timestamptz)", () => {
    const parsed = UserSchema.parse({
      ...valid,
      created_at: VALID_ISO_TS_OFFSET,
      deleted_at: VALID_ISO_TS_OFFSET,
      onboarding_state: {
        dismissed_coachmarks: [],
        completed_at: VALID_ISO_TS_OFFSET,
      },
    });
    expect(parsed.created_at).toBe(VALID_ISO_TS_OFFSET);
    expect(parsed.deleted_at).toBe(VALID_ISO_TS_OFFSET);
    expect(parsed.onboarding_state.completed_at).toBe(VALID_ISO_TS_OFFSET);
  });
});

describe("SubscriptionSchema", () => {
  const valid = {
    user_id: "usr_abc",
    stripe_customer_id: "cus_xxx",
    stripe_subscription_id: "sub_xxx",
    status: "active" as const,
    plan: "pro" as const,
    trial_ends_at: null,
    current_period_end: VALID_ISO_TS,
    cancel_at_period_end: false,
  };

  it("accepts an active paid subscription", () => {
    expect(SubscriptionSchema.parse(valid)).toBeTruthy();
  });

  it("accepts a free user with no subscription IDs", () => {
    expect(
      SubscriptionSchema.parse({
        ...valid,
        stripe_subscription_id: null,
        status: "none",
        plan: "free",
        trial_ends_at: null,
        current_period_end: null,
      }),
    ).toBeTruthy();
  });

  it("accepts a trialing user with trial_ends_at set", () => {
    expect(
      SubscriptionSchema.parse({ ...valid, status: "trialing", trial_ends_at: VALID_ISO_TS }),
    ).toBeTruthy();
  });

  it("rejects unknown status", () => {
    expect(() => SubscriptionSchema.parse({ ...valid, status: "expired" })).toThrow();
  });

  it("rejects unknown plan", () => {
    expect(() => SubscriptionSchema.parse({ ...valid, plan: "enterprise" })).toThrow();
  });

  it("accepts trial_ends_at and current_period_end with timezone offsets", () => {
    expect(
      SubscriptionSchema.parse({
        ...valid,
        trial_ends_at: VALID_ISO_TS_OFFSET,
        current_period_end: VALID_ISO_TS_OFFSET,
      }),
    ).toBeTruthy();
  });
});

describe("UsageEventSchema", () => {
  const valid = {
    id: VALID_UUIDV7,
    user_id: "usr_abc",
    chat_id: VALID_UUIDV7,
    kind: "translate_outbound" as const,
    model: "claude-sonnet-4-6",
    input_tokens: 1200,
    output_tokens: 380,
    cached_tokens: 800,
    cost_micro_usd: 4500,
    request_id: "req_xyz",
    created_at: VALID_ISO_TS,
  };

  it("accepts a complete usage event", () => {
    expect(UsageEventSchema.parse(valid)).toBeTruthy();
  });

  it("accepts chat_id null (e.g., system-level usage)", () => {
    expect(UsageEventSchema.parse({ ...valid, chat_id: null })).toBeTruthy();
  });

  it("rejects negative token counts", () => {
    expect(() => UsageEventSchema.parse({ ...valid, input_tokens: -1 })).toThrow();
    expect(() => UsageEventSchema.parse({ ...valid, output_tokens: -1 })).toThrow();
    expect(() => UsageEventSchema.parse({ ...valid, cached_tokens: -1 })).toThrow();
  });

  it("rejects negative cost", () => {
    expect(() => UsageEventSchema.parse({ ...valid, cost_micro_usd: -100 })).toThrow();
  });

  it("rejects non-integer tokens", () => {
    expect(() => UsageEventSchema.parse({ ...valid, input_tokens: 1.5 })).toThrow();
  });

  it("rejects unknown kind", () => {
    expect(() => UsageEventSchema.parse({ ...valid, kind: "back_translate" })).toThrow();
  });

  it("accepts created_at with timezone offset", () => {
    expect(UsageEventSchema.parse({ ...valid, created_at: VALID_ISO_TS_OFFSET })).toBeTruthy();
  });
});

describe("CoachmarkIdSchema", () => {
  it("accepts each documented coachmark ID (back_end §3.4)", () => {
    for (const id of [
      "composer_first_translate",
      "audit_points_first",
      "view_toggle_first",
      "refine_first",
    ]) {
      expect(CoachmarkIdSchema.parse(id)).toBe(id);
    }
  });

  it("rejects unknown coachmark IDs (typo / stale ID)", () => {
    expect(() => CoachmarkIdSchema.parse("composer_frist_translate")).toThrow();
    expect(() => CoachmarkIdSchema.parse("history_recovery_first")).toThrow();
    expect(() => CoachmarkIdSchema.parse("")).toThrow();
  });
});
