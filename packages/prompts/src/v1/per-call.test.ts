import { describe, expect, it } from "vitest";
import { buildPerCall } from "./per-call.js";

const VALID_PREFS = {
  source_lang: "en",
  target_lang: "ja",
  register: "casual",
  naturalness: 50,
  my_nickname: "Joao",
  contact_name_src: "Aiko",
  contact_name_tgt: "あいこ",
  notes: "Prefers no emoji",
  explain_verbosity: "standard" as const,
};

const VALID_TURN = (i: number) => ({
  author: i % 2 === 0 ? ("mine" as const) : ("theirs" as const),
  source: `turn ${i} source`,
  target: `turn ${i} target`,
});

const VALID_LOCK = { source_form: "Aiko", target_form: "あいこ" };

const baseTranslateInput = {
  prefs: VALID_PREFS,
  name_locks: [VALID_LOCK],
  recent_thread: [VALID_TURN(0), VALID_TURN(1)],
  task: { kind: "translate" as const, draft_source_text: "I'll be late" },
};

describe("buildPerCall — Context section", () => {
  it("renders all populated prefs fields", () => {
    const out = buildPerCall(baseTranslateInput);
    expect(out).toContain("Source language: en");
    expect(out).toContain("Target language: ja");
    expect(out).toContain("Register: casual");
    expect(out).toContain("Naturalness: 50/100");
    expect(out).toContain("Contact: Aiko (target: あいこ)");
    expect(out).toContain("User's nickname: Joao");
    expect(out).toContain("Notes: Prefers no emoji");
    expect(out).toContain("Explain verbosity: standard");
  });

  it("annotates null register as 'infer from naturalness'", () => {
    const out = buildPerCall({
      ...baseTranslateInput,
      prefs: { ...VALID_PREFS, register: null },
    });
    expect(out).toMatch(/Register:.+infer from naturalness/);
  });

  it("omits Contact, nickname, and Notes lines when those prefs are null", () => {
    const out = buildPerCall({
      ...baseTranslateInput,
      prefs: {
        ...VALID_PREFS,
        contact_name_src: null,
        contact_name_tgt: null,
        my_nickname: null,
        notes: null,
      },
    });
    expect(out).not.toContain("Contact:");
    expect(out).not.toContain("nickname:");
    expect(out).not.toContain("Notes:");
  });

  it("renders Contact without target when contact_name_tgt is null", () => {
    const out = buildPerCall({
      ...baseTranslateInput,
      prefs: { ...VALID_PREFS, contact_name_tgt: null },
    });
    expect(out).toContain("Contact: Aiko\n");
    expect(out).not.toContain("Contact: Aiko (target:");
  });
});

describe("buildPerCall — Name locks section", () => {
  it("renders an empty-state notice when no locks present", () => {
    const out = buildPerCall({ ...baseTranslateInput, name_locks: [] });
    expect(out).toMatch(/# Name locks\n\n\(none/);
  });

  it("lists each lock with arrow notation when target_form is set", () => {
    const out = buildPerCall({
      ...baseTranslateInput,
      name_locks: [{ source_form: "Aiko", target_form: "あいこ" }],
    });
    expect(out).toContain('- "Aiko" → "あいこ"');
  });

  it("annotates locks without target_form as preserve-as-is", () => {
    const out = buildPerCall({
      ...baseTranslateInput,
      name_locks: [{ source_form: "Joao" }],
    });
    expect(out).toContain('- "Joao" (preserve as-is)');
  });
});

describe("buildPerCall — Recent thread section", () => {
  it("renders an empty-state notice when no turns present", () => {
    const out = buildPerCall({ ...baseTranslateInput, recent_thread: [] });
    expect(out).toMatch(/# Recent thread\n\n\(empty/);
  });

  it("instructs the LLM not to re-translate prior turns", () => {
    const out = buildPerCall(baseTranslateInput);
    expect(out).toMatch(/DO NOT re-translate/);
  });

  it("renders each turn with author + source + target", () => {
    const out = buildPerCall(baseTranslateInput);
    expect(out).toMatch(/1\. \*\*mine\*\*/);
    expect(out).toContain("source: turn 0 source");
    expect(out).toContain("target: turn 0 target");
    expect(out).toMatch(/2\. \*\*theirs\*\*/);
  });
});

describe("buildPerCall — Current task section (translate)", () => {
  it("frames the task as outbound translation", () => {
    const out = buildPerCall(baseTranslateInput);
    expect(out).toMatch(/Translate the user's draft \(source → target\)/);
  });

  it("includes the draft source text in a code fence", () => {
    const out = buildPerCall(baseTranslateInput);
    expect(out).toContain("```\nI'll be late\n```");
  });

  it("includes the refine_instruction when provided", () => {
    const out = buildPerCall({
      ...baseTranslateInput,
      task: {
        kind: "translate",
        draft_source_text: "I'll be late",
        refine_instruction: "more casual please",
      },
    });
    expect(out).toContain("Refinement instruction from user:");
    expect(out).toContain("> more casual please");
  });

  it("omits the refine block when refine_instruction is absent", () => {
    const out = buildPerCall(baseTranslateInput);
    expect(out).not.toContain("Refinement instruction from user:");
  });
});

describe("buildPerCall — Current task section (inbound)", () => {
  it("frames the task as inbound decoding (do not smooth literal)", () => {
    const out = buildPerCall({
      ...baseTranslateInput,
      task: { kind: "inbound", pasted_target_text: "ちょっと遅れます" },
    });
    expect(out).toMatch(/Decode an inbound message/);
    expect(out).toMatch(/do not smooth/i);
  });

  it("includes the pasted target text in a code fence", () => {
    const out = buildPerCall({
      ...baseTranslateInput,
      task: { kind: "inbound", pasted_target_text: "ちょっと遅れます" },
    });
    expect(out).toContain("```\nちょっと遅れます\n```");
  });
});
