import { describe, expect, it } from "vitest";
import {
  AuditPointCategorySchema,
  AuditPointSchema,
  PrefsSuggestionSchema,
  TranslationObjectSchema,
  TranslationStreamChunkSchema,
} from "./translation.js";

const VALID_UUIDV7 = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5061";
const VALID_UUIDV7_2 = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5062";

describe("AuditPointCategorySchema", () => {
  it("accepts each documented category", () => {
    for (const cat of ["name", "register", "idiom", "tone", "ambiguity", "omission", "other"]) {
      expect(AuditPointCategorySchema.parse(cat)).toBe(cat);
    }
  });

  it("rejects unknown categories", () => {
    expect(() => AuditPointCategorySchema.parse("vibes")).toThrow();
  });
});

describe("AuditPointSchema", () => {
  const valid = {
    id: VALID_UUIDV7,
    category: "name" as const,
    before_text: "Aiko",
    after_text: "アイコ",
    rationale: "Preserved as romaji per name-lock rule",
    accepted: null,
  };

  it("accepts a complete audit point", () => {
    expect(AuditPointSchema.parse(valid)).toEqual(valid);
  });

  it("accepts informational-only (accepted=null)", () => {
    expect(AuditPointSchema.parse({ ...valid, accepted: null })).toBeTruthy();
  });

  it("accepts user-accepted (accepted=true)", () => {
    expect(AuditPointSchema.parse({ ...valid, accepted: true }).accepted).toBe(true);
  });

  it("accepts user-rejected (accepted=false)", () => {
    expect(AuditPointSchema.parse({ ...valid, accepted: false }).accepted).toBe(false);
  });

  it("requires non-empty rationale", () => {
    expect(() => AuditPointSchema.parse({ ...valid, rationale: "" })).toThrow();
  });

  it("rejects unknown category", () => {
    expect(() => AuditPointSchema.parse({ ...valid, category: "vibes" })).toThrow();
  });
});

describe("PrefsSuggestionSchema", () => {
  const valid = {
    id: VALID_UUIDV7,
    field: "contact_name_src" as const,
    from: "Aiko",
    to: "Misaki",
    evidence: { message_id: VALID_UUIDV7_2, excerpt: "actually my name is Misaki" },
    confidence: "high" as const,
    reasoning: "She introduced a different name",
    category: "name_reveal" as const,
  };

  it("accepts a full suggestion", () => {
    expect(PrefsSuggestionSchema.parse(valid)).toEqual(valid);
  });

  it("allows from=null for additive operations (e.g. name_lock_add)", () => {
    expect(
      PrefsSuggestionSchema.parse({
        ...valid,
        field: "name_lock_add",
        from: null,
        to: { source_form: "Misaki" },
        category: "name_reveal",
      }),
    ).toBeTruthy();
  });

  it("rejects unknown confidence", () => {
    expect(() => PrefsSuggestionSchema.parse({ ...valid, confidence: "maybe" })).toThrow();
  });

  it("rejects unknown category", () => {
    expect(() => PrefsSuggestionSchema.parse({ ...valid, category: "weather_chat" })).toThrow();
  });

  it("rejects evidence excerpt over 200 chars", () => {
    expect(() =>
      PrefsSuggestionSchema.parse({
        ...valid,
        evidence: { message_id: VALID_UUIDV7_2, excerpt: "x".repeat(201) },
      }),
    ).toThrow();
  });
});

describe("TranslationObjectSchema", () => {
  it("accepts a minimal object (literal + natural only)", () => {
    const result = TranslationObjectSchema.parse({
      literal: "Hello",
      natural: "Hi",
    });
    expect(result.literal).toBe("Hello");
    expect(result.natural).toBe("Hi");
    // Defaults
    expect(result.name_checks).toEqual([]);
    expect(result.audit_points).toEqual([]);
    expect(result.prefs_suggestions).toEqual([]);
  });

  it("accepts a full object with all optional fields", () => {
    const result = TranslationObjectSchema.parse({
      literal: "I'll be late",
      natural: "ちょっと遅れます",
      gloss: "casual apologetic register",
      register: { detected: "casual", chosen: "casual", confidence: 0.9 },
      dialect: { flags: ["kanto-standard"] },
      name_checks: [{ name: "Aiko", preserved: true }],
      audit_points: [
        {
          id: VALID_UUIDV7,
          category: "register",
          before_text: "I will be late",
          after_text: "ちょっと遅れます",
          rationale: "Casual register matches contact context",
          accepted: null,
        },
      ],
      prefs_suggestions: [],
    });
    expect(result.audit_points).toHaveLength(1);
  });

  it("rejects register confidence outside 0–1", () => {
    expect(() =>
      TranslationObjectSchema.parse({
        literal: "x",
        natural: "y",
        register: { confidence: 1.5 },
      }),
    ).toThrow();
  });
});

describe("TranslationStreamChunkSchema", () => {
  it("accepts every chunk variant (each carrying its required `seq`)", () => {
    const chunks = [
      { seq: 0, type: "literal" as const, text_delta: "Hi" },
      { seq: 1, type: "natural" as const, text_delta: "Hi" },
      { seq: 2, type: "gloss" as const, text_delta: "casual greeting" },
      { seq: 3, type: "register" as const, detected: "casual", confidence: 0.9 },
      { seq: 4, type: "dialect" as const, flags: ["kanto"] },
      { seq: 5, type: "name_check" as const, name: "Aiko", preserved: true },
      {
        seq: 6,
        type: "audit_point" as const,
        point: {
          id: VALID_UUIDV7,
          category: "name" as const,
          before_text: "Aiko",
          after_text: "Aiko",
          rationale: "Preserved",
          accepted: null,
        },
      },
      { seq: 7, type: "done" as const },
      { seq: 8, type: "error" as const, code: "rate_limit", message: "Too many requests" },
    ];
    for (const chunk of chunks) {
      expect(() => TranslationStreamChunkSchema.parse(chunk)).not.toThrow();
    }
  });

  it("discriminates correctly on `type`", () => {
    // literal chunk shouldn't accept fields from another variant
    expect(() =>
      TranslationStreamChunkSchema.parse({ seq: 0, type: "literal", flags: ["x"] }),
    ).toThrow();
  });

  it("rejects unknown chunk type", () => {
    expect(() =>
      TranslationStreamChunkSchema.parse({ seq: 0, type: "vibes", text_delta: "x" }),
    ).toThrow();
  });

  it("requires `seq` on every variant (back_end §2.3 wire contract)", () => {
    expect(() => TranslationStreamChunkSchema.parse({ type: "done" })).toThrow();
    expect(() =>
      TranslationStreamChunkSchema.parse({ type: "literal", text_delta: "Hi" }),
    ).toThrow();
  });

  it("rejects negative `seq` (must be a non-negative integer per stream)", () => {
    expect(() => TranslationStreamChunkSchema.parse({ seq: -1, type: "done" })).toThrow();
  });

  it("rejects non-integer `seq`", () => {
    expect(() => TranslationStreamChunkSchema.parse({ seq: 1.5, type: "done" })).toThrow();
  });
});
