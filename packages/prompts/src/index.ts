// @nuansu/prompts — versioned LLM system-prompt templates.
//
// Each version (v1, v2, ...) lives in its own folder and exports a
// `buildPromptV{N}(input)` function that returns the cached prefix
// (byte-stable for caching) and the per-call suffix.
//
// The cache key on the LLM provider is keyed by prompt version + cached
// prefix bytes. Bumping the version is the only safe way to change the
// prefix; in-place edits would silently invalidate cache entries and
// break replay tests.

export const PROMPTS_PACKAGE_VERSION = "0.2.0" as const;

export * from "./v1/index.js";
