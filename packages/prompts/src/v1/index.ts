// v1 prompt builder. Returns the prompt as an ordered array of cache layers
// so the orchestrator (Phase 6) can map them 1:1 to Anthropic's
// `system: [{ type: "text", text, cache_control? }, ...]` content blocks.
//
// Cache strategy (per back_end §5.3):
//   1. universal_v1   — sections 1, 2, 5, 7, 8. Identical across all calls
//                       in v1. cache_after: true.
//   2. chat_prefs     — section 3 (Context). Stable within a chat session.
//                       cache_after: true.
//   3. per_call       — sections 4, 6, current task. Varies per call.
//                       cache_after: false.
//
// To bump the prompt version (v1 → v2), add `packages/prompts/src/v2/` with
// the same shape and a new PROMPT_VERSION_V2 const. The cache key on the
// provider is a function of (version, layer text), so a version bump
// invalidates cleanly without touching this file.

import { CACHED_PREFIX_V1, CACHED_PREFIX_V1_LENGTH } from "./cached-prefix.js";
import { buildChatPrefsLayer, buildPerCallLayer, type PerCallInput } from "./per-call.js";

export const PROMPT_VERSION_V1 = "v1" as const;

export type PromptVersion = typeof PROMPT_VERSION_V1;

export type PromptLayerLabel = "universal_v1" | "chat_prefs" | "per_call";

export interface PromptLayer {
  label: PromptLayerLabel;
  text: string;
  /** Orchestrator sets `cache_control: { type: "ephemeral" }` after this layer when true. */
  cache_after: boolean;
}

export interface BuiltPrompt {
  version: PromptVersion;
  /** Ordered layers. Concatenate with "\n\n" to produce the full system prompt. */
  layers: readonly PromptLayer[];
  /** Convenience for tests / stubs: full = layers.map(l => l.text).join("\n\n"). */
  full: string;
}

export function buildPromptV1(input: PerCallInput): BuiltPrompt {
  const layers: PromptLayer[] = [
    { label: "universal_v1", text: CACHED_PREFIX_V1, cache_after: true },
    { label: "chat_prefs", text: buildChatPrefsLayer(input.prefs), cache_after: true },
    { label: "per_call", text: buildPerCallLayer(input), cache_after: false },
  ];
  return {
    version: PROMPT_VERSION_V1,
    layers,
    full: layers.map((l) => l.text).join("\n\n"),
  };
}

export { CACHED_PREFIX_V1, CACHED_PREFIX_V1_LENGTH };
export type { PerCallInput };
