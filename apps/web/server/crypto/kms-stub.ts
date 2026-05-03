// KMS stub for local development. Returns a deterministic 32-byte DEK
// derived from `seed + ":" + userId` via Web Crypto's SubtleCrypto.
// Same userId always returns the same DEK, so encrypted fields persist
// across server restarts in dev (matching prod behaviour where the
// real KMS-wrapped DEK lives in `users.dek_wrapped`).
//
// Production (KMS_PROVIDER=aws) will land as a separate file
// (kms-aws.ts) implementing the same `DekProvider` shape — it'll call
// kms.GenerateDataKey on first access and persist the wrapped form
// to users.dek_wrapped. The orchestrator (Phase 6) wires whichever
// provider matches `env.KMS_PROVIDER` once per request.

export type DekProvider = (userId: string) => Promise<Uint8Array>;

/**
 * Build a stub DEK provider with its own in-process cache.
 * Each call to the returned function for the same userId reuses the
 * same derived DEK; cache lives for the lifetime of the provider
 * (typically one request in workerd).
 */
export function createStubDekProvider(seed: string): DekProvider {
  if (seed.length < 8) {
    throw new Error("createStubDekProvider: seed must be ≥ 8 chars");
  }
  const cache = new Map<string, Uint8Array>();
  return async function stubDek(userId: string): Promise<Uint8Array> {
    const cached = cache.get(userId);
    if (cached) return cached;
    // Deterministic derivation: SHA-256(seed || ":" || userId) → 32 bytes.
    // Web Crypto's SubtleCrypto is workerd-native (no Node-crypto dep).
    const seedBytes = new TextEncoder().encode(`${seed}:${userId}`);
    const digest = await crypto.subtle.digest("SHA-256", seedBytes);
    const dek = new Uint8Array(digest);
    cache.set(userId, dek);
    return dek;
  };
}
