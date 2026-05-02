import { describe, expect, it } from "vitest";
import { InboundRequestSchema, TranslateRequestSchema } from "./requests.js";

const VALID_PREFS = {
  source_lang: "en",
  target_lang: "ja",
  register: "casual",
  naturalness: 50,
  my_nickname: null,
  contact_name_src: "Aiko",
  contact_name_tgt: "あいこ",
  notes: null,
  explain_verbosity: "standard" as const,
};

const VALID_TURN = { author: "mine" as const, source: "Hi", target: "やあ" };

const baseTranslateBody = {
  draft_source_text: "I'll be late",
  prefs_snapshot: VALID_PREFS,
  name_locks: [{ source_form: "Aiko" }],
  recent_thread: [VALID_TURN],
  idempotency_key: "abc123",
  user_id: "usr_018f7c9a",
};

describe("TranslateRequestSchema", () => {
  it("accepts a minimal valid body", () => {
    expect(() => TranslateRequestSchema.parse(baseTranslateBody)).not.toThrow();
  });

  it("accepts an empty name_locks array", () => {
    expect(TranslateRequestSchema.parse({ ...baseTranslateBody, name_locks: [] })).toBeTruthy();
  });

  it("accepts an empty recent_thread (first message in chat)", () => {
    expect(TranslateRequestSchema.parse({ ...baseTranslateBody, recent_thread: [] })).toBeTruthy();
  });

  it("rejects empty draft_source_text", () => {
    expect(() =>
      TranslateRequestSchema.parse({ ...baseTranslateBody, draft_source_text: "" }),
    ).toThrow();
  });

  it("rejects more than 10 recent_thread turns (the per-call cap, §5.1.1)", () => {
    const eleven = Array.from({ length: 11 }, () => VALID_TURN);
    expect(() =>
      TranslateRequestSchema.parse({ ...baseTranslateBody, recent_thread: eleven }),
    ).toThrow();
  });

  it("accepts exactly 10 recent_thread turns (boundary)", () => {
    const ten = Array.from({ length: 10 }, () => VALID_TURN);
    expect(TranslateRequestSchema.parse({ ...baseTranslateBody, recent_thread: ten })).toBeTruthy();
  });

  it("accepts an optional prior_translation when refining", () => {
    expect(
      TranslateRequestSchema.parse({
        ...baseTranslateBody,
        refine_instruction: "more casual please",
        prior_translation: { literal: "I will be late", natural: "遅れます" },
      }),
    ).toBeTruthy();
  });

  it("rejects empty idempotency_key", () => {
    expect(() =>
      TranslateRequestSchema.parse({ ...baseTranslateBody, idempotency_key: "" }),
    ).toThrow();
  });
});

describe("InboundRequestSchema", () => {
  const baseInboundBody = {
    pasted_target_text: "ちょっと遅れます",
    prefs_snapshot: VALID_PREFS,
    name_locks: [],
    recent_thread: [VALID_TURN],
    idempotency_key: "xyz789",
    user_id: "usr_018f7c9a",
  };

  it("accepts a minimal valid body", () => {
    expect(() => InboundRequestSchema.parse(baseInboundBody)).not.toThrow();
  });

  it("rejects empty pasted_target_text", () => {
    expect(() =>
      InboundRequestSchema.parse({ ...baseInboundBody, pasted_target_text: "" }),
    ).toThrow();
  });

  it("rejects draft_source_text (TranslateRequest field on Inbound — strict boundary)", () => {
    // Strict request schema: cross-endpoint field bleeding throws instead
    // of being silently stripped, so contract drift surfaces in CI/dev.
    expect(() =>
      InboundRequestSchema.parse({
        ...baseInboundBody,
        draft_source_text: "Should not be here",
      }),
    ).toThrow();
  });

  it("rejects arbitrary unknown fields", () => {
    expect(() =>
      InboundRequestSchema.parse({
        ...baseInboundBody,
        debug_flag: true,
      }),
    ).toThrow();
  });
});

describe("TranslateRequestSchema strict boundary", () => {
  it("rejects unknown fields on the request body", () => {
    expect(() =>
      TranslateRequestSchema.parse({
        ...baseTranslateBody,
        debug_flag: true,
      }),
    ).toThrow();
  });

  it("rejects pasted_target_text (InboundRequest field on Translate)", () => {
    expect(() =>
      TranslateRequestSchema.parse({
        ...baseTranslateBody,
        pasted_target_text: "wrong endpoint",
      }),
    ).toThrow();
  });
});
