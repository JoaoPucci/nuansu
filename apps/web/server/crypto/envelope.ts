// Field-level envelope encryption per security.md §4.2.
//
// Each sensitive field (message bodies, glosses, notes, name-lock entries)
// is encrypted with XChaCha20-Poly1305 using a per-user DEK fetched via a
// `DekProvider` (the stub in dev, AWS KMS in prod). The nonce is fresh
// 24 random bytes per encryption call. AAD includes the row's primary
// key so ciphertext can't be swapped between rows of the same user.
//
// Why XChaCha20-Poly1305:
//   - 24-byte nonces — random nonces are safe at any volume (no birthday
//     bound to worry about, unlike 12-byte AES-GCM at >2^32 messages).
//   - AEAD: authenticated; AAD prevents row-swap attacks.
//   - Pure-JS implementation in `@noble/ciphers/chacha.js` works in workerd
//     (no Node-crypto, no native bindings).

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import type { DekProvider } from "./kms-stub.js";

const NONCE_BYTES = 24;

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
 * Build AAD from a row's primary key. Row PKs are UUIDv7 strings, so
 * encoding to UTF-8 bytes is sufficient — no hex/base64 ambiguity.
 * Callers should pass `aadFromRowId(messageId)` etc. to ensure ciphertext
 * can't be swapped between rows of the same user.
 */
export function aadFromRowId(rowId: string): Uint8Array {
  return new TextEncoder().encode(rowId);
}
