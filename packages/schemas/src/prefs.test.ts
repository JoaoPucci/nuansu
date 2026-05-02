import { describe, expect, it } from "vitest";
import { ChatPrefsSchema, GlobalPrefsSchema, NameLockSchema } from "./prefs.js";

const VALID_UUIDV7 = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5061";

describe("GlobalPrefsSchema", () => {
  const valid = {
    user_id: "usr_abc",
    default_target_lang: "ja",
    default_register: "casual",
    default_naturalness: 50,
    names_are_sacred: true,
    explain_verbosity: "standard" as const,
    preferred_model_tier: "standard" as const,
  };

  it("accepts a complete record", () => {
    expect(GlobalPrefsSchema.parse(valid)).toEqual(valid);
  });

  it("allows null default_register (no preference)", () => {
    expect(GlobalPrefsSchema.parse({ ...valid, default_register: null })).toBeTruthy();
  });

  it("rejects naturalness 101 (off-scale)", () => {
    expect(() => GlobalPrefsSchema.parse({ ...valid, default_naturalness: 101 })).toThrow();
  });

  it("rejects unknown model tier", () => {
    expect(() => GlobalPrefsSchema.parse({ ...valid, preferred_model_tier: "premium" })).toThrow();
  });

  it("rejects unknown verbosity", () => {
    expect(() => GlobalPrefsSchema.parse({ ...valid, explain_verbosity: "chatty" })).toThrow();
  });
});

describe("ChatPrefsSchema", () => {
  const valid = {
    chat_id: VALID_UUIDV7,
    target_language: "ja",
    register: "casual",
    naturalness: 60,
    my_nickname: "Joao",
    contact_name_src: "Aiko",
    contact_name_tgt: "あいこ",
    notes: "She prefers no emoji",
  };

  it("accepts a complete record", () => {
    expect(ChatPrefsSchema.parse(valid)).toEqual(valid);
  });

  it("allows every override to be null (full inheritance from global)", () => {
    expect(
      ChatPrefsSchema.parse({
        chat_id: VALID_UUIDV7,
        target_language: null,
        register: null,
        naturalness: null,
        my_nickname: null,
        contact_name_src: null,
        contact_name_tgt: null,
        notes: null,
      }),
    ).toBeTruthy();
  });

  it("rejects an invalid chat_id (not UUIDv7)", () => {
    expect(() => ChatPrefsSchema.parse({ ...valid, chat_id: "not-a-uuid" })).toThrow();
  });

  it("rejects naturalness 101 even when overridable", () => {
    expect(() => ChatPrefsSchema.parse({ ...valid, naturalness: 101 })).toThrow();
  });
});

describe("NameLockSchema", () => {
  const valid = {
    id: VALID_UUIDV7,
    user_id: "usr_abc",
    chat_id: VALID_UUIDV7,
    source_form: "Aiko",
    target_form: "あいこ",
    notes: "Prefers hiragana",
    prior_canonical: false,
  };

  it("accepts a complete chat-scoped lock", () => {
    expect(NameLockSchema.parse(valid)).toEqual(valid);
  });

  it("accepts a global lock (chat_id null)", () => {
    expect(NameLockSchema.parse({ ...valid, chat_id: null })).toBeTruthy();
  });

  it("accepts a lock without target_form", () => {
    expect(NameLockSchema.parse({ ...valid, target_form: null })).toBeTruthy();
  });

  it("flags a prior-canonical lock (drift-suggestion replacement)", () => {
    const lock = NameLockSchema.parse({ ...valid, prior_canonical: true });
    expect(lock.prior_canonical).toBe(true);
  });

  it("rejects empty source_form", () => {
    expect(() => NameLockSchema.parse({ ...valid, source_form: "" })).toThrow();
  });
});
