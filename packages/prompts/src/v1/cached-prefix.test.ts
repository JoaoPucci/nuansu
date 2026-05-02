// Cache-discipline tests. The CACHED_PREFIX_V1 string is sent on every
// translate / inbound call, so it MUST be byte-stable across releases of v1.
// Any edit changes the byte length / SHA-256, which invalidates the LLM
// provider's prompt cache. These tests catch accidental edits AND force
// the reviewer to confirm any deliberate edit was intended (then bump to v2).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CACHED_PREFIX_V1, CACHED_PREFIX_V1_LENGTH } from "./cached-prefix.js";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

describe("CACHED_PREFIX_V1 — byte stability", () => {
  it("matches the recorded byte length", () => {
    expect(CACHED_PREFIX_V1.length).toBe(CACHED_PREFIX_V1_LENGTH);
  });

  it("has a stable SHA-256 (regression check)", () => {
    // If this hash changes, you edited the cached prefix. Either:
    // (a) revert the edit (the cache must stay byte-stable in v1), OR
    // (b) bump to v2 by adding a new packages/prompts/src/v2/ folder
    //     and registering a new prompt version key.
    // Don't update this hash without doing one or the other.
    const hash = sha256(CACHED_PREFIX_V1);
    expect(hash).toMatchSnapshot();
  });
});

describe("CACHED_PREFIX_V1 — section presence (back_end §5.3)", () => {
  it("contains Section 1: Role with anti-drift framing", () => {
    expect(CACHED_PREFIX_V1).toMatch(/^# Role/m);
    expect(CACHED_PREFIX_V1).toMatch(/anti-drift is the prime directive/i);
  });

  it("contains Section 2: Anti-drift rules", () => {
    expect(CACHED_PREFIX_V1).toMatch(/^# Anti-drift rules/m);
  });

  it("includes all 5 documented anti-drift rules (numbered 1–5)", () => {
    for (let n = 1; n <= 5; n++) {
      expect(CACHED_PREFIX_V1).toMatch(new RegExp(`^${n}\\. \\*\\*`, "m"));
    }
  });

  it("rule 1 is name preservation (verbatim)", () => {
    expect(CACHED_PREFIX_V1).toMatch(/Reproduce proper names verbatim/i);
  });

  it("rule 2 forbids editing the source", () => {
    expect(CACHED_PREFIX_V1).toMatch(/Never edit the user's source draft/i);
  });

  it("rule 3 requires both passes", () => {
    expect(CACHED_PREFIX_V1).toMatch(/both a literal pass and a natural pass/i);
  });

  it("contains Section 5: Output schema", () => {
    expect(CACHED_PREFIX_V1).toMatch(/^# Output schema/m);
  });

  it("documents the seq field as a per-stream non-negative integer", () => {
    expect(CACHED_PREFIX_V1).toMatch(/seq.+non-negative integer/i);
  });

  it("lists every TranslationStreamChunk variant from back_end §5.2", () => {
    for (const variant of [
      "literal",
      "natural",
      "gloss",
      "register",
      "dialect",
      "name_check",
      "audit_point",
      "prefs_suggestion",
      "done",
      "error",
    ]) {
      expect(CACHED_PREFIX_V1).toMatch(new RegExp(`type:\\s*"${variant}"`));
    }
  });

  it("contains Section 7: Drift detection rules", () => {
    expect(CACHED_PREFIX_V1).toMatch(/^# Drift detection rules/m);
  });

  it("documents all 4 drift categories from back_end §5.4", () => {
    for (const cat of ["name_reveal", "nickname_offer", "register_shift", "context_update"]) {
      expect(CACHED_PREFIX_V1).toMatch(new RegExp(`\`${cat}\``));
    }
  });

  it("documents the 3 confidence tiers from back_end §5.4", () => {
    for (const tier of ["high", "med", "low"]) {
      expect(CACHED_PREFIX_V1).toMatch(new RegExp(`\`${tier}\``));
    }
  });

  it("enforces the one-suggestion-per-call cap (back_end §5.4 emission rules)", () => {
    expect(CACHED_PREFIX_V1).toMatch(/[Oo]ne per call,?\s*max/);
  });

  it("requires evidence (message_id + excerpt) on every suggestion", () => {
    expect(CACHED_PREFIX_V1).toMatch(/[Ee]vidence required/);
    expect(CACHED_PREFIX_V1).toMatch(/message_id/);
    expect(CACHED_PREFIX_V1).toMatch(/excerpt/);
  });

  it("calls out always-additive name discipline (back_end §5.4)", () => {
    expect(CACHED_PREFIX_V1).toMatch(/[Aa]lways[- ]additive/);
  });

  it("contains Section 8: Few-shot examples", () => {
    expect(CACHED_PREFIX_V1).toMatch(/^# Few-shot examples/m);
  });

  it("includes ≥3 translation few-shots and ≥2 drift few-shots (5 total per back_end §5.3)", () => {
    // Each example uses an "## Example N — …" header. Count them.
    const examples = CACHED_PREFIX_V1.match(/^## Example \d+/gm) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(5);

    const driftExamples = CACHED_PREFIX_V1.match(/## Example \d+ — drift detection/g) ?? [];
    expect(driftExamples.length).toBeGreaterThanOrEqual(2);
  });

  it("first three examples cover the documented anti-drift mechanics", () => {
    expect(CACHED_PREFIX_V1).toMatch(/Example 1 — name preservation/);
    expect(CACHED_PREFIX_V1).toMatch(/Example 2 — register match/);
    expect(CACHED_PREFIX_V1).toMatch(/Example 3 — idiom adaptation/);
  });

  it("drift few-shots cover at least name_reveal and register_shift (back_end §5.3)", () => {
    expect(CACHED_PREFIX_V1).toMatch(/drift detection: name_reveal/);
    expect(CACHED_PREFIX_V1).toMatch(/drift detection: register_shift/);
  });
});
