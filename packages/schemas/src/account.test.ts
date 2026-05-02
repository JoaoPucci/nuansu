import { describe, expect, it } from "vitest";
import { SubscriptionSchema, UsageEventSchema, UserSchema } from "./account.js";

const VALID_UUIDV7 = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5061";
const VALID_ISO_TS = "2026-05-03T12:34:56.000Z";

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
});
