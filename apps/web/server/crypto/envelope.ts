// Field-level envelope encryption per security.md §4.2.
//
// Each sensitive field (message bodies, glosses, notes, name-lock entries)
// is encrypted with XChaCha20-Poly1305 using a per-user DEK fetched via a
// `DekProvider` (the stub in dev, AWS KMS in prod). The nonce is fresh
// 24 random bytes per encryption call. AAD binds the ciphertext to its
// (user, table, column, row) — preventing cross-user, cross-table,
// cross-row, AND intra-row (column-swap) ciphertext substitution.
//
// Why XChaCha20-Poly1305:
//   - 24-byte nonces — random nonces are safe at any volume (no birthday
//     bound to worry about, unlike 12-byte AES-GCM at >2^32 messages).
//   - AEAD: authenticated; AAD prevents substitution attacks.
//   - Pure-JS implementation in `@noble/ciphers/chacha.js` works in workerd
//     (no Node-crypto, no native bindings).

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import type { DekProvider } from "./kms-stub.js";

const NONCE_BYTES = 24;

/**
 * AAD separator (Unit Separator, ASCII 0x1f). Never appears in any of
 * the four AAD components (user_id is text, table/column are identifiers,
 * row_id is a UUIDv7 hex string), so it's an unambiguous delimiter.
 */
const AAD_SEPARATOR = 0x1f;

export interface EncryptedField {
  /** XChaCha20-Poly1305 ciphertext, includes a trailing 16-byte auth tag. */
  ciphertext: Uint8Array;
  /** 24-byte nonce (per security.md §4.2). Fresh-random per call. */
  nonce: Uint8Array;
}

export async function encryptForUser(
  dek: DekProvider,
  userId: string,
  plaintext: string,
  aad: Uint8Array,
): Promise<EncryptedField> {
  const key = await dek(userId);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = xchacha20poly1305(key, nonce, aad).encrypt(
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext, nonce };
}

export async function decryptForUser(
  dek: DekProvider,
  userId: string,
  encrypted: EncryptedField,
  aad: Uint8Array,
): Promise<string> {
  const key = await dek(userId);
  const plaintext = xchacha20poly1305(key, encrypted.nonce, aad).decrypt(encrypted.ciphertext);
  return new TextDecoder().decode(plaintext);
}

/**
 * Build AAD bound to the (user, table, column, row) tuple per
 * `security.md §4.2`. Encoding:
 *
 *   utf8(userId) ‖ 0x1f ‖ utf8(table) ‖ 0x1f ‖ utf8(column) ‖ 0x1f ‖ utf8(rowId)
 *
 * Including `column` is what blocks intra-row swap — without it, an
 * attacker with DB write access could exchange `final_source_text` and
 * `final_target_text` ciphertext+nonce pairs of the same row and AEAD
 * authentication would still succeed (same key, same AAD). Including
 * `userId` and `table` adds defence against cross-user / cross-table
 * confusion under any future schema-replication scenario.
 *
 * Callers MUST pass all four components. The taint-style fitness test
 * (`docs/quality.md §3.1`) asserts every encrypted-column write traces
 * back to a call to `encryptForUser` whose AAD comes from this helper.
 */
export function aadForField(
  userId: string,
  table: string,
  column: string,
  rowId: string,
): Uint8Array {
  const enc = new TextEncoder();
  const u = enc.encode(userId);
  const t = enc.encode(table);
  const c = enc.encode(column);
  const r = enc.encode(rowId);
  // Result length: u + 1 + t + 1 + c + 1 + r
  const out = new Uint8Array(u.length + t.length + c.length + r.length + 3);
  let i = 0;
  out.set(u, i);
  i += u.length;
  out[i++] = AAD_SEPARATOR;
  out.set(t, i);
  i += t.length;
  out[i++] = AAD_SEPARATOR;
  out.set(c, i);
  i += c.length;
  out[i++] = AAD_SEPARATOR;
  out.set(r, i);
  return out;
}
