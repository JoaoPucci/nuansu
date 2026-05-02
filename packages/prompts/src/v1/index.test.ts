// Builder integration tests — `buildPromptV1` returns the cached prefix and
// per-call suffix in the right shape, and the `full` field concatenates them
// in the order the LLM expects.

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

describe("buildPromptV1", () => {
  it("returns version v1", () => {
    expect(buildPromptV1(baseInput).version).toBe(PROMPT_VERSION_V1);
    expect(buildPromptV1(baseInput).version).toBe("v1");
  });

  it("returns the cached prefix unchanged regardless of input", () => {
    const a = buildPromptV1(baseInput);
    const b = buildPromptV1({
      ...baseInput,
      task: { kind: "inbound", pasted_target_text: "別のメッセージ" },
    });
    expect(a.cached_prefix).toBe(b.cached_prefix);
    expect(a.cached_prefix).toBe(CACHED_PREFIX_V1);
  });

  it("returns a per-call suffix that varies with input", () => {
    const a = buildPromptV1(baseInput);
    const b = buildPromptV1({
      ...baseInput,
      task: { kind: "translate", draft_source_text: "Different text" },
    });
    expect(a.per_call).not.toBe(b.per_call);
  });

  it("`full` concatenates cached_prefix and per_call with a blank line", () => {
    const built = buildPromptV1(baseInput);
    expect(built.full).toBe(`${built.cached_prefix}\n\n${built.per_call}`);
  });

  it("`full` puts the cached prefix first (cache match requires prefix at byte 0)", () => {
    const built = buildPromptV1(baseInput);
    expect(built.full.startsWith(built.cached_prefix)).toBe(true);
  });

  it("includes the chat-specific draft_source_text in `full`", () => {
    const built = buildPromptV1(baseInput);
    expect(built.full).toContain("I'll be late");
  });
});
