// v1 prompt builder. Concatenates the cached prefix (byte-stable across calls)
// with the per-call suffix (chat context, name locks, recent thread, task).
//
// Cache discipline: the LLM provider's prompt cache matches by exact-prefix
// bytes. Anything that varies per call MUST live in the suffix; anything in
// the prefix MUST be byte-stable within v1. To change the prefix, bump the
// version (v1 → v2) so the cache key invalidates cleanly.

import { CACHED_PREFIX_V1, CACHED_PREFIX_V1_LENGTH } from "./cached-prefix.js";
import { buildPerCall, type PerCallInput } from "./per-call.js";

export const PROMPT_VERSION_V1 = "v1" as const;

export type PromptVersion = typeof PROMPT_VERSION_V1;

export interface BuiltPrompt {
  version: PromptVersion;
  /** Byte-stable prefix sent on every call. Eligible for provider-side caching. */
  cached_prefix: string;
  /** Per-call suffix; varies per chat / per request. */
  per_call: string;
  /** Convenience: full prompt = cached_prefix + "\n\n" + per_call. */
  full: string;
}

export function buildPromptV1(input: PerCallInput): BuiltPrompt {
  const per_call = buildPerCall(input);
  return {
    version: PROMPT_VERSION_V1,
    cached_prefix: CACHED_PREFIX_V1,
    per_call,
    full: `${CACHED_PREFIX_V1}\n\n${per_call}`,
  };
}

export { CACHED_PREFIX_V1, CACHED_PREFIX_V1_LENGTH };
export type { PerCallInput };
