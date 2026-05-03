// Performance bench for envelope encryption.
//
// Per Phase 2 plan + docs/quality.md §4: encrypt/decrypt of a single field
// must run in well under 0.5 ms once the DEK is cached. The path is on
// every message commit + every read render, so a slow envelope kills the
// whole UX.
//
// Vitest's `bench` runner reports throughput; CI's regression gate
// (.github/workflows/ci.yml bench job) fails when a result drifts > 25%
// from baseline. Re-baseline only after a deliberate algorithm or library
// change.

import { bench, describe } from "vitest";
import { aadForField, decryptForUser, encryptForUser } from "./envelope.js";
import { createStubDekProvider } from "./kms-stub.js";

const USER = "usr_bench";
const ROW = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5061";
const AAD = aadForField(USER, "messages", "final_target_text", ROW);
const SEED = "bench-seed-do-not-use-in-prod";
const SHORT_PLAINTEXT = "hello";
const TYPICAL_PLAINTEXT = "ちょっと遅れます。Shibuyaの駅で待ち合わせ場所を変えませんか?";

describe("envelope encrypt/decrypt (DEK cached)", () => {
  const dek = createStubDekProvider(SEED);
  // Warm the cache by issuing one call; subsequent benches measure the
  // hot path (no SHA-256 derivation per call).
  // (Vitest runs setup-then-bench, so this top-level await is fine.)

  bench("encrypt — short ASCII (5 bytes)", async () => {
    await encryptForUser(dek, USER, SHORT_PLAINTEXT, AAD);
  });

  bench("encrypt — typical message (~50 chars, multibyte)", async () => {
    await encryptForUser(dek, USER, TYPICAL_PLAINTEXT, AAD);
  });

  bench("decrypt — typical message (round-trip)", async () => {
    const enc = await encryptForUser(dek, USER, TYPICAL_PLAINTEXT, AAD);
    await decryptForUser(dek, USER, enc, AAD);
  });
});

describe("envelope encrypt (DEK cache cold per call)", () => {
  // Worst case: first message of a session, before the cache is warm.
  // Slower than the hot path but should still be << 1 ms because the
  // stub derivation is a single SHA-256 of <100 bytes.
  bench("encrypt — DEK cache cold (fresh provider per call)", async () => {
    const dek = createStubDekProvider(SEED);
    await encryptForUser(dek, USER, TYPICAL_PLAINTEXT, AAD);
  });
});
