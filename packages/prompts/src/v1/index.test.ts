// Builder integration tests — `buildPromptV1` returns the prompt as an
// ordered array of cache layers and a `full` convenience field. The layer
// shape maps 1:1 to Anthropic's `system: [{ type: "text", text, cache_control? }]`
// content blocks; the orchestrator (Phase 6) translates `cache_after: true`
// into a `cache_control: { type: "ephemeral" }` marker.

import { describe, expect, it } from "vitest";
import { CACHED_PREFIX_V1, PROMPT_VERSION_V1, buildPromptV1 } from "./index.js";

const VALID_PREFS = {
  source_lang: "en",
  target_lang: "ja",
  register: "casual",
  naturalness: 50,
  my_nickname: null,
  contact_name_src: "Aiko",
  contact_name_tgt: null,
  notes: null,
  explain_verbosity: "standard" as const,
};

const baseInput = {
  prefs: VALID_PREFS,
  name_locks: [],
  recent_thread: [],
  task: { kind: "translate" as const, draft_source_text: "I'll be late" },
};

describe("buildPromptV1 — version + shape", () => {
  it("returns version 'v1'", () => {
    expect(buildPromptV1(baseInput).version).toBe(PROMPT_VERSION_V1);
    expect(buildPromptV1(baseInput).version).toBe("v1");
  });

  it("returns exactly 3 layers in the documented order", () => {
    const { layers } = buildPromptV1(baseInput);
    expect(layers).toHaveLength(3);
    expect(layers.map((l) => l.label)).toEqual(["universal_v1", "chat_prefs", "per_call"]);
  });

  it("`full` concatenates layers with a blank-line separator", () => {
    const built = buildPromptV1(baseInput);
    expect(built.full).toBe(built.layers.map((l) => l.text).join("\n\n"));
  });

  it("`full` starts with the universal_v1 layer (cache match requires prefix at byte 0)", () => {
    const built = buildPromptV1(baseInput);
    expect(built.full.startsWith(built.layers[0]!.text)).toBe(true);
  });
});

describe("buildPromptV1 — cache_after flags (back_end §5.3)", () => {
  it("universal_v1 layer has cache_after: true", () => {
    const { layers } = buildPromptV1(baseInput);
    expect(layers.find((l) => l.label === "universal_v1")?.cache_after).toBe(true);
  });

  it("chat_prefs layer has cache_after: true", () => {
    const { layers } = buildPromptV1(baseInput);
    expect(layers.find((l) => l.label === "chat_prefs")?.cache_after).toBe(true);
  });

  it("per_call layer has cache_after: false (never cached)", () => {
    const { layers } = buildPromptV1(baseInput);
    expect(layers.find((l) => l.label === "per_call")?.cache_after).toBe(false);
  });
});

describe("buildPromptV1 — universal_v1 layer (cross-chat cache)", () => {
  it("text equals CACHED_PREFIX_V1 exactly", () => {
    const { layers } = buildPromptV1(baseInput);
    const universal = layers.find((l) => l.label === "universal_v1")!;
    expect(universal.text).toBe(CACHED_PREFIX_V1);
  });

  it("text is byte-stable across input variation (cache prerequisite)", () => {
    const a = buildPromptV1(baseInput);
    const b = buildPromptV1({
      ...baseInput,
      prefs: { ...VALID_PREFS, naturalness: 99 },
      task: { kind: "inbound", pasted_target_text: "別のメッセージ" },
    });
    const aUni = a.layers.find((l) => l.label === "universal_v1")!;
    const bUni = b.layers.find((l) => l.label === "universal_v1")!;
    expect(aUni.text).toBe(bUni.text);
  });
});

describe("buildPromptV1 — chat_prefs layer (per-chat cache)", () => {
  it("text is byte-stable when prefs are identical (cache prerequisite)", () => {
    const a = buildPromptV1(baseInput);
    const b = buildPromptV1({
      ...baseInput,
      task: { kind: "translate", draft_source_text: "different draft" },
    });
    const aChat = a.layers.find((l) => l.label === "chat_prefs")!;
    const bChat = b.layers.find((l) => l.label === "chat_prefs")!;
    expect(aChat.text).toBe(bChat.text);
  });

  it("text changes when any pref value changes (cache invalidation surface)", () => {
    const a = buildPromptV1(baseInput);
    const b = buildPromptV1({
      ...baseInput,
      prefs: { ...VALID_PREFS, naturalness: 51 },
    });
    const aChat = a.layers.find((l) => l.label === "chat_prefs")!;
    const bChat = b.layers.find((l) => l.label === "chat_prefs")!;
    expect(aChat.text).not.toBe(bChat.text);
  });
});

describe("buildPromptV1 — per_call layer (never cached)", () => {
  it("text varies with task content", () => {
    const a = buildPromptV1(baseInput);
    const b = buildPromptV1({
      ...baseInput,
      task: { kind: "translate", draft_source_text: "Different text" },
    });
    const aCall = a.layers.find((l) => l.label === "per_call")!;
    const bCall = b.layers.find((l) => l.label === "per_call")!;
    expect(aCall.text).not.toBe(bCall.text);
  });

  it("text varies with recent_thread changes", () => {
    const a = buildPromptV1(baseInput);
    const b = buildPromptV1({
      ...baseInput,
      recent_thread: [{ author: "mine", source: "hi", target: "やあ" }],
    });
    const aCall = a.layers.find((l) => l.label === "per_call")!;
    const bCall = b.layers.find((l) => l.label === "per_call")!;
    expect(aCall.text).not.toBe(bCall.text);
  });

  it("includes the chat-specific draft_source_text", () => {
    const built = buildPromptV1(baseInput);
    const perCall = built.layers.find((l) => l.label === "per_call")!;
    expect(perCall.text).toContain("I'll be late");
  });
});
