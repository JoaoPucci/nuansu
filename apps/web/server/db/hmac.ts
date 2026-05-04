// Session-proof signing for RLS scoping.
//
// Pairs with `nuansu.verify_hmac()` in bootstrap.sql. The wrapper
// `db.forUser` calls `signSessionProof(userId, secret)` and SET LOCAL
// nuansu.session_proof to the result; on every RLS evaluation the SQL
// function recomputes HMAC-SHA256(secret, userId) and compares.
//
// The format `<userId>:<hmac_hex>` is split by the SQL function on `:`
// so neither half can contain a literal colon. user_id is a UUID-shaped
// text from Better Auth (no colons), and the hmac hex is 64 lowercase
// hex chars. We assert both shapes here at the boundary.

import { createHmac, timingSafeEqual } from "node:crypto";

const HMAC_HEX_RE = /^[0-9a-f]{64}$/;
const USER_ID_RE = /^[A-Za-z0-9_-]+$/;

export function signSessionProof(userId: string, secret: string): string {
  if (!USER_ID_RE.test(userId)) {
    throw new Error(
      "signSessionProof: userId must be alphanumeric with underscore/dash only (no colon, no separator chars)",
    );
  }
  if (secret.length < 32) {
    throw new Error("signSessionProof: secret must be ≥ 32 chars");
  }
  const hmac = createHmac("sha256", secret);
  hmac.update(userId, "utf8");
  return `${userId}:${hmac.digest("hex")}`;
}

/**
 * Length-safe constant-time bytes comparison wrapper around Node's
 * `timingSafeEqual` (which throws on length mismatch). Pulled from
 * security.md §13.6 — used by anything that compares attacker-influenced
 * bytes to a server-side reference (HMACs, magic-link hashes, CSRF
 * tokens).
 */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify a session-proof against the provided secret and userId. Used
 * by tests and never on the hot path (the SQL function is the live
 * verifier). The Buffer-from-hex round-trip is intentional — it
 * exercises the same hex parsing the SQL function does.
 */
export function verifySessionProof(proof: string, expectedUserId: string, secret: string): boolean {
  const parts = proof.split(":");
  if (parts.length !== 2) return false;
  const [claimedUserId, claimedHmacHex] = parts as [string, string];
  if (claimedUserId !== expectedUserId) return false;
  if (!HMAC_HEX_RE.test(claimedHmacHex)) return false;

  const expected = createHmac("sha256", secret).update(expectedUserId, "utf8").digest();
  const claimed = Buffer.from(claimedHmacHex, "hex");
  return timingSafeEqualBytes(expected, claimed);
}
