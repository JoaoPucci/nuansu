import { describe, expect, it } from "vitest";
import {
  NameLockRefSchema,
  PrefsSnapshotSchema,
  RecentThreadTurnSchema,
  UuidV7Schema,
} from "./common.js";

describe("RecentThreadTurnSchema", () => {
  it("accepts a well-formed turn", () => {
    expect(
      RecentThreadTurnSchema.parse({
        author: "mine",
        source: "Hello",
        target: "こんにちは",
      }),
    ).toEqual({ author: "mine", source: "Hello", target: "こんにちは" });
  });

  it("rejects an unknown author", () => {
    expect(() =>
      RecentThreadTurnSchema.parse({ author: "system", source: "x", target: "y" }),
    ).toThrow();
  });

  it("requires both source and target (empty strings allowed)", () => {
    // Empty strings are permissible — represents 'no content yet' in early-stream
    // turns. Per docs/back_end_architecture.md §5.1.1 the LLM gets bilingual
    // ground truth, so absence is meaningful but emptiness is allowed.
    expect(() => RecentThreadTurnSchema.parse({ author: "mine", source: "" })).toThrow();
    expect(() => RecentThreadTurnSchema.parse({ author: "mine", target: "y" })).toThrow();
  });
});

describe("PrefsSnapshotSchema", () => {
  const valid = {
    source_lang: "en",
    target_lang: "ja",
    register: "casual",
    naturalness: 50,
    my_nickname: null,
    contact_name_src: "Aiko",
    contact_name_tgt: "あいこ",
    notes: null,
    explain_verbosity: "standard",
  } as const;

  it("accepts a complete snapshot", () => {
    expect(PrefsSnapshotSchema.parse(valid)).toEqual(valid);
  });

  it("allows null register/nickname/notes", () => {
    expect(
      PrefsSnapshotSchema.parse({
        ...valid,
        register: null,
        my_nickname: null,
        contact_name_src: null,
        contact_name_tgt: null,
        notes: null,
      }),
    ).toBeTruthy();
  });

  it("rejects naturalness outside 0–100", () => {
    expect(() => PrefsSnapshotSchema.parse({ ...valid, naturalness: -1 })).toThrow();
    expect(() => PrefsSnapshotSchema.parse({ ...valid, naturalness: 101 })).toThrow();
  });

  it("rejects non-integer naturalness", () => {
    expect(() => PrefsSnapshotSchema.parse({ ...valid, naturalness: 50.5 })).toThrow();
  });

  it("rejects unknown explain_verbosity values", () => {
    expect(() => PrefsSnapshotSchema.parse({ ...valid, explain_verbosity: "chatty" })).toThrow();
  });

  it("rejects single-character source_lang (must be ≥2 chars)", () => {
    expect(() => PrefsSnapshotSchema.parse({ ...valid, source_lang: "e" })).toThrow();
  });
});

describe("NameLockRefSchema", () => {
  it("accepts source-only", () => {
    expect(NameLockRefSchema.parse({ source_form: "Joao" })).toEqual({
      source_form: "Joao",
    });
  });

  it("accepts source + target_form", () => {
    expect(NameLockRefSchema.parse({ source_form: "Joao", target_form: "ジョアン" })).toEqual({
      source_form: "Joao",
      target_form: "ジョアン",
    });
  });

  it("rejects empty source_form", () => {
    expect(() => NameLockRefSchema.parse({ source_form: "" })).toThrow();
  });

  it("rejects empty target_form when present", () => {
    expect(() => NameLockRefSchema.parse({ source_form: "Joao", target_form: "" })).toThrow();
  });
});

describe("UuidV7Schema", () => {
  it("accepts a valid UUIDv7", () => {
    // Real UUIDv7 example: version nibble = 7, variant nibble = 8|9|a|b
    expect(UuidV7Schema.parse("018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5061")).toBe(
      "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5061",
    );
  });

  it("rejects a UUIDv4 (wrong version digit)", () => {
    expect(() => UuidV7Schema.parse("018f7c9a-3b4c-4d8e-9a0b-1c2d3e4f5061")).toThrow();
  });

  it("rejects a malformed UUID (missing hyphen)", () => {
    expect(() => UuidV7Schema.parse("018f7c9a3b4c-7d8e-9a0b-1c2d3e4f5061")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => UuidV7Schema.parse("")).toThrow();
  });
});
