// Envelope-encryption tests covering the security.md §4.2 contract:
// round-trip integrity, AAD binds ciphertext to (user, table, column,
// row), fresh nonces, per-user DEK isolation, intra-row column-swap
// rejection.

import { beforeEach, describe, expect, it } from "vitest";
import { aadForField, decryptForUser, encryptForUser } from "./envelope.js";
import { createStubDekProvider, type DekProvider } from "./kms-stub.js";

const ROW_A = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5061";
const ROW_B = "018f7c9a-3b4c-7d8e-9a0b-1c2d3e4f5062";
const USER_A = "usr_alpha";
const USER_B = "usr_bravo";
const SEED = "test-seed-do-not-use-in-prod";
const TABLE = "messages";
const COL_TGT = "final_target_text";
const COL_SRC = "final_source_text";

let dek: DekProvider;
beforeEach(() => {
  dek = createStubDekProvider(SEED);
});

describe("envelope.encryptForUser / decryptForUser — round-trip", () => {
  it("decrypts what it encrypted (ASCII)", async () => {
    const aad = aadForField(USER_A, TABLE, COL_TGT, ROW_A);
    const enc = await encryptForUser(dek, USER_A, "hello world", aad);
    const dec = await decryptForUser(dek, USER_A, enc, aad);
    expect(dec).toBe("hello world");
  });

  it("decrypts what it encrypted (UTF-8 with multibyte glyphs)", async () => {
    const aad = aadForField(USER_A, TABLE, COL_TGT, ROW_A);
    const enc = await encryptForUser(dek, USER_A, "ちょっと遅れます 🚶", aad);
    const dec = await decryptForUser(dek, USER_A, enc, aad);
    expect(dec).toBe("ちょっと遅れます 🚶");
  });

  it("decrypts an empty string", async () => {
    const aad = aadForField(USER_A, TABLE, COL_TGT, ROW_A);
    const enc = await encryptForUser(dek, USER_A, "", aad);
    const dec = await decryptForUser(dek, USER_A, enc, aad);
    expect(dec).toBe("");
  });

  it("decrypts a long plaintext (10 KB)", async () => {
    const aad = aadForField(USER_A, TABLE, COL_TGT, ROW_A);
    const long = "x".repeat(10_000);
    const enc = await encryptForUser(dek, USER_A, long, aad);
    const dec = await decryptForUser(dek, USER_A, enc, aad);
    expect(dec).toBe(long);
  });
});

describe("envelope — AAD binds ciphertext to (user, table, column, row) (security.md §4.2)", () => {
  it("decryption fails when row_id changes (cross-row swap blocked)", async () => {
    const enc = await encryptForUser(
      dek,
      USER_A,
      "secret",
      aadForField(USER_A, TABLE, COL_TGT, ROW_A),
    );
    await expect(
      decryptForUser(dek, USER_A, enc, aadForField(USER_A, TABLE, COL_TGT, ROW_B)),
    ).rejects.toThrow();
  });

  it("decryption fails when column changes (intra-row column-swap blocked)", async () => {
    // Attack: an actor with DB write access swaps the
    // `final_source_text` and `final_target_text` ciphertext+nonce
    // pairs within the same row. Without column in AAD, AEAD
    // authenticates successfully and the swap is undetectable.
    const enc = await encryptForUser(
      dek,
      USER_A,
      "real source text",
      aadForField(USER_A, TABLE, COL_SRC, ROW_A),
    );
    await expect(
      decryptForUser(dek, USER_A, enc, aadForField(USER_A, TABLE, COL_TGT, ROW_A)),
    ).rejects.toThrow();
  });

  it("decryption fails when table changes (cross-table swap blocked)", async () => {
    const enc = await encryptForUser(
      dek,
      USER_A,
      "secret",
      aadForField(USER_A, "messages", COL_TGT, ROW_A),
    );
    await expect(
      decryptForUser(dek, USER_A, enc, aadForField(USER_A, "message_versions", COL_TGT, ROW_A)),
    ).rejects.toThrow();
  });

  it("decryption fails when user_id in AAD changes (defence-in-depth on top of per-user DEK)", async () => {
    const enc = await encryptForUser(
      dek,
      USER_A,
      "secret",
      aadForField(USER_A, TABLE, COL_TGT, ROW_A),
    );
    // Same DEK provider, but tamper with the user_id component of AAD
    await expect(
      decryptForUser(dek, USER_A, enc, aadForField(USER_B, TABLE, COL_TGT, ROW_A)),
    ).rejects.toThrow();
  });

  it("decryption fails when AAD is empty but encryption used a real AAD", async () => {
    const enc = await encryptForUser(
      dek,
      USER_A,
      "secret",
      aadForField(USER_A, TABLE, COL_TGT, ROW_A),
    );
    await expect(decryptForUser(dek, USER_A, enc, new Uint8Array(0))).rejects.toThrow();
  });
});

describe("envelope — per-user DEK isolation", () => {
  it("user B cannot decrypt user A's ciphertext (different DEKs)", async () => {
    const aad = aadForField(USER_A, TABLE, COL_TGT, ROW_A);
    const enc = await encryptForUser(dek, USER_A, "alpha-only", aad);
    // Try to decrypt as user B (different DEK derives from kms-stub).
    // We pass user A's AAD too — the failure must be DEK mismatch, not AAD.
    await expect(decryptForUser(dek, USER_B, enc, aad)).rejects.toThrow();
  });

  it("same user, same input → different ciphertext (fresh nonce)", async () => {
    const aad = aadForField(USER_A, TABLE, COL_TGT, ROW_A);
    const a = await encryptForUser(dek, USER_A, "same plaintext", aad);
    const b = await encryptForUser(dek, USER_A, "same plaintext", aad);
    // Nonces must differ; ciphertexts therefore differ.
    expect(Array.from(a.nonce)).not.toEqual(Array.from(b.nonce));
    expect(Array.from(a.ciphertext)).not.toEqual(Array.from(b.ciphertext));
  });
});

describe("envelope — nonce + ciphertext shape", () => {
  it("nonce is 24 bytes (XChaCha20)", async () => {
    const enc = await encryptForUser(dek, USER_A, "x", aadForField(USER_A, TABLE, COL_TGT, ROW_A));
    expect(enc.nonce.byteLength).toBe(24);
  });

  it("ciphertext is plaintext bytes + 16 (Poly1305 auth tag)", async () => {
    const plaintext = "hello";
    const enc = await encryptForUser(
      dek,
      USER_A,
      plaintext,
      aadForField(USER_A, TABLE, COL_TGT, ROW_A),
    );
    expect(enc.ciphertext.byteLength).toBe(new TextEncoder().encode(plaintext).byteLength + 16);
  });
});

describe("aadForField — encoding shape", () => {
  it("uses 0x1f Unit Separator between components", () => {
    const aad = aadForField("u", "t", "c", "r");
    // Expected: u 0x1f t 0x1f c 0x1f r
    expect(Array.from(aad)).toEqual([
      "u".charCodeAt(0),
      0x1f,
      "t".charCodeAt(0),
      0x1f,
      "c".charCodeAt(0),
      0x1f,
      "r".charCodeAt(0),
    ]);
  });

  it("changing any single component changes the AAD bytes", () => {
    const base = aadForField(USER_A, TABLE, COL_TGT, ROW_A);
    expect(Array.from(aadForField(USER_B, TABLE, COL_TGT, ROW_A))).not.toEqual(Array.from(base));
    expect(Array.from(aadForField(USER_A, "other_table", COL_TGT, ROW_A))).not.toEqual(
      Array.from(base),
    );
    expect(Array.from(aadForField(USER_A, TABLE, COL_SRC, ROW_A))).not.toEqual(Array.from(base));
    expect(Array.from(aadForField(USER_A, TABLE, COL_TGT, ROW_B))).not.toEqual(Array.from(base));
  });
});

describe("createStubDekProvider — deterministic derivation (stub mode)", () => {
  it("same userId yields the same DEK across cache-cold provider instances", async () => {
    const aad = aadForField(USER_A, TABLE, COL_TGT, ROW_A);
    const enc = await encryptForUser(dek, USER_A, "hello", aad);
    // Build a fresh provider to simulate cache-cold (e.g., new request).
    const freshDek = createStubDekProvider(SEED);
    const decoded = await decryptForUser(freshDek, USER_A, enc, aad);
    expect(decoded).toBe("hello");
  });

  it("different seeds yield different DEKs (re-key isolation)", async () => {
    const enc = await encryptForUser(
      dek,
      USER_A,
      "hello",
      aadForField(USER_A, TABLE, COL_TGT, ROW_A),
    );
    const otherDek = createStubDekProvider("totally-different-seed");
    await expect(
      decryptForUser(otherDek, USER_A, enc, aadForField(USER_A, TABLE, COL_TGT, ROW_A)),
    ).rejects.toThrow();
  });

  it("rejects seeds shorter than 8 chars", () => {
    expect(() => createStubDekProvider("short")).toThrow();
  });
});
