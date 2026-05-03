// Envelope-encryption tests covering the security.md §4.2 contract:
// round-trip integrity, AAD binds ciphertext to its row, fresh nonces,
// per-user DEK isolation.

import { beforeEach, describe, expect, it } from "vitest";
import { aadFromRowId, decryptForUser, encryptForUser } from "./envelope.js";
import { createStubDekProvider, type DekProvider } from "./kms-stub.js";

const ROW_A = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5061";
const ROW_B = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5062";
const USER_A = "usr_alpha";
const USER_B = "usr_bravo";
const SEED = "test-seed-do-not-use-in-prod";

let dek: DekProvider;
beforeEach(() => {
  dek = createStubDekProvider(SEED);
});

describe("envelope.encryptForUser / decryptForUser — round-trip", () => {
  it("decrypts what it encrypted (ASCII)", async () => {
    const aad = aadFromRowId(ROW_A);
    const enc = await encryptForUser(dek, USER_A, "hello world", aad);
    const dec = await decryptForUser(dek, USER_A, enc, aad);
    expect(dec).toBe("hello world");
  });

  it("decrypts what it encrypted (UTF-8 with multibyte glyphs)", async () => {
    const aad = aadFromRowId(ROW_A);
    const enc = await encryptForUser(dek, USER_A, "ちょっと遅れます 🚶", aad);
    const dec = await decryptForUser(dek, USER_A, enc, aad);
    expect(dec).toBe("ちょっと遅れます 🚶");
  });

  it("decrypts an empty string", async () => {
    const aad = aadFromRowId(ROW_A);
    const enc = await encryptForUser(dek, USER_A, "", aad);
    const dec = await decryptForUser(dek, USER_A, enc, aad);
    expect(dec).toBe("");
  });

  it("decrypts a long plaintext (10 KB)", async () => {
    const aad = aadFromRowId(ROW_A);
    const long = "x".repeat(10_000);
    const enc = await encryptForUser(dek, USER_A, long, aad);
    const dec = await decryptForUser(dek, USER_A, enc, aad);
    expect(dec).toBe(long);
  });
});

describe("envelope — AAD binds ciphertext to its row (security.md §4.2)", () => {
  it("decryption fails when AAD doesn't match (row-swap protection)", async () => {
    const enc = await encryptForUser(dek, USER_A, "secret", aadFromRowId(ROW_A));
    await expect(decryptForUser(dek, USER_A, enc, aadFromRowId(ROW_B))).rejects.toThrow();
  });

  it("decryption fails when AAD is empty but encryption used a real AAD", async () => {
    const enc = await encryptForUser(dek, USER_A, "secret", aadFromRowId(ROW_A));
    await expect(decryptForUser(dek, USER_A, enc, new Uint8Array(0))).rejects.toThrow();
  });
});

describe("envelope — per-user DEK isolation", () => {
  it("user B cannot decrypt user A's ciphertext (different DEKs)", async () => {
    const aad = aadFromRowId(ROW_A);
    const enc = await encryptForUser(dek, USER_A, "alpha-only", aad);
    await expect(decryptForUser(dek, USER_B, enc, aad)).rejects.toThrow();
  });

  it("same user, same input → different ciphertext (fresh nonce)", async () => {
    const aad = aadFromRowId(ROW_A);
    const a = await encryptForUser(dek, USER_A, "same plaintext", aad);
    const b = await encryptForUser(dek, USER_A, "same plaintext", aad);
    // Nonces must differ; ciphertexts therefore differ.
    expect(Array.from(a.nonce)).not.toEqual(Array.from(b.nonce));
    expect(Array.from(a.ciphertext)).not.toEqual(Array.from(b.ciphertext));
  });
});

describe("envelope — nonce + ciphertext shape", () => {
  it("nonce is 24 bytes (XChaCha20)", async () => {
    const enc = await encryptForUser(dek, USER_A, "x", aadFromRowId(ROW_A));
    expect(enc.nonce.byteLength).toBe(24);
  });

  it("ciphertext is plaintext bytes + 16 (Poly1305 auth tag)", async () => {
    const plaintext = "hello";
    const enc = await encryptForUser(dek, USER_A, plaintext, aadFromRowId(ROW_A));
    expect(enc.ciphertext.byteLength).toBe(new TextEncoder().encode(plaintext).byteLength + 16);
  });
});

describe("createStubDekProvider — deterministic derivation (stub mode)", () => {
  it("same userId yields the same DEK across cache-cold provider instances", async () => {
    const enc = await encryptForUser(dek, USER_A, "hello", aadFromRowId(ROW_A));
    // Build a fresh provider to simulate cache-cold (e.g., new request).
    const freshDek = createStubDekProvider(SEED);
    const decoded = await decryptForUser(freshDek, USER_A, enc, aadFromRowId(ROW_A));
    expect(decoded).toBe("hello");
  });

  it("different seeds yield different DEKs (re-key isolation)", async () => {
    const enc = await encryptForUser(dek, USER_A, "hello", aadFromRowId(ROW_A));
    const otherDek = createStubDekProvider("totally-different-seed");
    await expect(decryptForUser(otherDek, USER_A, enc, aadFromRowId(ROW_A))).rejects.toThrow();
  });

  it("rejects seeds shorter than 8 chars", () => {
    expect(() => createStubDekProvider("short")).toThrow();
  });
});
