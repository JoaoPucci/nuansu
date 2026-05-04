import { describe, it, expect } from "vitest";
import { signSessionProof, verifySessionProof, timingSafeEqualBytes } from "./hmac.js";

const SECRET = "x".repeat(64);

describe("signSessionProof", () => {
  it("returns user_id:hmac_hex with 64-hex-char HMAC", () => {
    const proof = signSessionProof("01HQRZP5K8YAEXAMPLE", SECRET);
    const parts = proof.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("01HQRZP5K8YAEXAMPLE");
    expect(parts[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same (userId, secret) pair", () => {
    const a = signSessionProof("user_a", SECRET);
    const b = signSessionProof("user_a", SECRET);
    expect(a).toBe(b);
  });

  it("differs for different userIds with the same secret", () => {
    const a = signSessionProof("user_a", SECRET);
    const b = signSessionProof("user_b", SECRET);
    expect(a).not.toBe(b);
  });

  it("differs for the same userId with a different secret", () => {
    const a = signSessionProof("user_a", SECRET);
    const b = signSessionProof("user_a", "y".repeat(64));
    expect(a).not.toBe(b);
  });

  it("rejects userIds containing a colon (would break SQL parsing)", () => {
    expect(() => signSessionProof("user:a", SECRET)).toThrow(/alphanumeric/);
  });

  it("rejects empty userIds", () => {
    expect(() => signSessionProof("", SECRET)).toThrow(/alphanumeric/);
  });

  it("rejects too-short secrets", () => {
    expect(() => signSessionProof("user_a", "short")).toThrow(/32/);
  });
});

describe("verifySessionProof", () => {
  it("accepts a freshly signed proof", () => {
    const proof = signSessionProof("user_a", SECRET);
    expect(verifySessionProof(proof, "user_a", SECRET)).toBe(true);
  });

  it("rejects a proof with the wrong userId", () => {
    const proof = signSessionProof("user_a", SECRET);
    expect(verifySessionProof(proof, "user_b", SECRET)).toBe(false);
  });

  it("rejects a proof signed with a different secret", () => {
    const proof = signSessionProof("user_a", SECRET);
    expect(verifySessionProof(proof, "user_a", "z".repeat(64))).toBe(false);
  });

  it("rejects a tampered HMAC", () => {
    const proof = signSessionProof("user_a", SECRET);
    const [uid, hmac] = proof.split(":") as [string, string];
    // Flip one nibble.
    const flipped = `${hmac.slice(0, -1)}${hmac.endsWith("0") ? "1" : "0"}`;
    expect(verifySessionProof(`${uid}:${flipped}`, "user_a", SECRET)).toBe(false);
  });

  it("rejects malformed proofs (no colon)", () => {
    expect(verifySessionProof("user_a-no-colon", "user_a", SECRET)).toBe(false);
  });

  it("rejects malformed proofs (extra colon)", () => {
    expect(verifySessionProof("user_a:abc:def", "user_a", SECRET)).toBe(false);
  });

  it("rejects non-hex HMAC", () => {
    expect(verifySessionProof("user_a:zzz", "user_a", SECRET)).toBe(false);
  });
});

describe("timingSafeEqualBytes", () => {
  it("returns true for identical byte arrays", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4, 5]);
    expect(timingSafeEqualBytes(a, b)).toBe(true);
  });

  it("returns false for differing same-length arrays without throwing", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4, 6]);
    expect(timingSafeEqualBytes(a, b)).toBe(false);
  });

  it("returns false for length-mismatched arrays without throwing", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(timingSafeEqualBytes(a, b)).toBe(false);
  });
});
