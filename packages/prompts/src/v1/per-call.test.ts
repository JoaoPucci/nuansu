import { describe, expect, it } from "vitest";
import { buildChatPrefsLayer, buildPerCallLayer } from "./per-call.js";

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

const baseTask = { kind: "translate" as const, draft_source_text: "I'll be late" };

describe("buildChatPrefsLayer — section 3 (Context, per-chat cache layer)", () => {
  it("renders all populated prefs fields", () => {
    const out = buildChatPrefsLayer(VALID_PREFS);
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
    const out = buildChatPrefsLayer({ ...VALID_PREFS, register: null });
    expect(out).toMatch(/Register:.+infer from naturalness/);
  });

  it("omits Contact, nickname, and Notes lines when those prefs are null", () => {
    const out = buildChatPrefsLayer({
      ...VALID_PREFS,
      contact_name_src: null,
      contact_name_tgt: null,
      my_nickname: null,
      notes: null,
    });
    expect(out).not.toContain("Contact:");
    expect(out).not.toContain("nickname:");
    expect(out).not.toContain("Notes:");
  });

  it("renders Contact without target when contact_name_tgt is null", () => {
    const out = buildChatPrefsLayer({ ...VALID_PREFS, contact_name_tgt: null });
    expect(out).toContain("Contact: Aiko");
    expect(out).not.toContain("Contact: Aiko (target:");
  });

  it("output is byte-stable for identical prefs (cache prerequisite)", () => {
    const a = buildChatPrefsLayer(VALID_PREFS);
    const b = buildChatPrefsLayer(VALID_PREFS);
    expect(a).toBe(b);
  });

  it("output differs when any pref value changes (cache invalidation surface)", () => {
    const a = buildChatPrefsLayer(VALID_PREFS);
    const b = buildChatPrefsLayer({ ...VALID_PREFS, naturalness: 51 });
    expect(a).not.toBe(b);
  });
});

describe("buildPerCallLayer — sections 4 + 6 + task (per-call, never cached)", () => {
  describe("Name locks section", () => {
    it("renders an empty-state notice when no locks present", () => {
      const out = buildPerCallLayer({ name_locks: [], recent_thread: [], task: baseTask });
      expect(out).toMatch(/# Name locks\n\n\(none/);
    });

    it("lists each lock with arrow notation when target_form is set", () => {
      const out = buildPerCallLayer({
        name_locks: [VALID_LOCK],
        recent_thread: [],
        task: baseTask,
      });
      expect(out).toContain('- "Aiko" → "あいこ"');
    });

    it("annotates locks without target_form as preserve-as-is", () => {
      const out = buildPerCallLayer({
        name_locks: [{ source_form: "Joao" }],
        recent_thread: [],
        task: baseTask,
      });
      expect(out).toContain('- "Joao" (preserve as-is)');
    });
  });

  describe("Recent thread section", () => {
    it("renders an empty-state notice when no turns present", () => {
      const out = buildPerCallLayer({ name_locks: [], recent_thread: [], task: baseTask });
      expect(out).toMatch(/# Recent thread\n\n\(empty/);
    });

    it("instructs the LLM not to re-translate prior turns", () => {
      const out = buildPerCallLayer({
        name_locks: [],
        recent_thread: [VALID_TURN(0)],
        task: baseTask,
      });
      expect(out).toMatch(/DO NOT re-translate/);
    });

    it("renders each turn with author + source + target", () => {
      const out = buildPerCallLayer({
        name_locks: [],
        recent_thread: [VALID_TURN(0), VALID_TURN(1)],
        task: baseTask,
      });
      expect(out).toMatch(/1\. \*\*mine\*\*/);
      expect(out).toContain("source: turn 0 source");
      expect(out).toContain("target: turn 0 target");
      expect(out).toMatch(/2\. \*\*theirs\*\*/);
    });
  });

  describe("Current task section (translate)", () => {
    it("frames the task as outbound translation", () => {
      const out = buildPerCallLayer({ name_locks: [], recent_thread: [], task: baseTask });
      expect(out).toMatch(/Translate the user's draft \(source → target\)/);
    });

    it("includes the draft source text in a code fence", () => {
      const out = buildPerCallLayer({ name_locks: [], recent_thread: [], task: baseTask });
      expect(out).toContain("```\nI'll be late\n```");
    });

    it("includes the refine_instruction when provided", () => {
      const out = buildPerCallLayer({
        name_locks: [],
        recent_thread: [],
        task: { ...baseTask, refine_instruction: "more casual please" },
      });
      expect(out).toContain("Refinement instruction from user:");
      expect(out).toContain("> more casual please");
    });

    it("omits the refine block when refine_instruction is absent", () => {
      const out = buildPerCallLayer({ name_locks: [], recent_thread: [], task: baseTask });
      expect(out).not.toContain("Refinement instruction from user:");
    });
  });

  describe("Current task section (inbound)", () => {
    it("frames the task as inbound decoding (do not smooth literal)", () => {
      const out = buildPerCallLayer({
        name_locks: [],
        recent_thread: [],
        task: { kind: "inbound", pasted_target_text: "ちょっと遅れます" },
      });
      expect(out).toMatch(/Decode an inbound message/);
      expect(out).toMatch(/do not smooth/i);
    });

    it("includes the pasted target text in a code fence", () => {
      const out = buildPerCallLayer({
        name_locks: [],
        recent_thread: [],
        task: { kind: "inbound", pasted_target_text: "ちょっと遅れます" },
      });
      expect(out).toContain("```\nちょっと遅れます\n```");
    });
  });
});
