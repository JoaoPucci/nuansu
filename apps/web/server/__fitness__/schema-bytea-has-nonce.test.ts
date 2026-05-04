// Fitness: every envelope-encrypted bytea column has a paired
// `<col>_nonce` bytea sibling — XChaCha20-Poly1305 needs the nonce
// to decrypt, and the AAD construction in security.md §4.2 binds
// ciphertext to (user_id ‖ table_name ‖ column_name ‖ row_id).
//
// Some bytea columns are NOT envelope-encrypted (dek_wrapped is a
// KMS-wrapped key; payload_hash is a SHA digest; to_value_dedup_key
// is a deterministic HMAC). They live in `BYTEA_NOT_ENCRYPTED` and
// are exempt from the pairing rule.
//
// Authority: docs/back_end_architecture.md §3.1
// "Encrypted-fields catalogue" + "every encrypted bytea has a
// matching `*_nonce` sibling".

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { makeMigrateClient, readTestEnvOrSkip } from "../db/__test_helpers__/test-db.js";

const env = readTestEnvOrSkip();
const describeFitness = env ? describe : describe.skip;
let close: (() => Promise<void>) | null = null;

// Bytea columns that are intentionally NOT envelope-encrypted. Each
// entry is `<table>.<column>`. Adding a new bytea column requires
// either pairing it with a `*_nonce` column OR adding it here with a
// reviewer comment.
const BYTEA_NOT_ENCRYPTED: ReadonlySet<string> = new Set([
  "users.dek_wrapped", // KMS-wrapped DEK, not ciphertext
  "webhook_events.payload_hash", // SHA-256 of the request body
  "pref_suggestions.to_value_dedup_key", // HMAC-SHA256 deterministic dedup key
  "config.value", // nuansu.config server-side HMAC secret blob
]);

afterAll(async () => {
  if (close) await close();
});

describeFitness("schema fitness — bytea columns are paired with nonces", () => {
  it("every encrypted bytea has a sibling *_nonce bytea", async () => {
    if (!env) return;
    const client = makeMigrateClient(env);
    close = client.close;

    const rows = (await client.db.execute(sql`
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema IN ('public', 'nuansu')
        AND data_type = 'bytea'
      ORDER BY table_schema, table_name, column_name
    `)) as unknown as {
      table_schema: string;
      table_name: string;
      column_name: string;
    }[];

    const byTable = new Map<string, Set<string>>();
    for (const r of rows) {
      const key = `${r.table_schema}.${r.table_name}`;
      const set = byTable.get(key) ?? new Set<string>();
      set.add(r.column_name);
      byTable.set(key, set);
    }

    const offenders: string[] = [];
    for (const r of rows) {
      const fqColumn = `${r.table_name}.${r.column_name}`;
      const fqWithSchema = `${r.table_schema}.${r.table_name}.${r.column_name}`;
      if (r.column_name.endsWith("_nonce")) continue;
      if (BYTEA_NOT_ENCRYPTED.has(fqColumn) || BYTEA_NOT_ENCRYPTED.has(fqWithSchema)) continue;

      const siblings = byTable.get(`${r.table_schema}.${r.table_name}`);
      if (!siblings?.has(`${r.column_name}_nonce`)) {
        offenders.push(fqColumn);
      }
    }

    expect(
      offenders,
      `Bytea columns missing a *_nonce sibling (or add to BYTEA_NOT_ENCRYPTED with rationale): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("every *_nonce bytea has a sibling without the suffix", async () => {
    if (!env) return;
    const client = makeMigrateClient(env);
    close = client.close;

    const rows = (await client.db.execute(sql`
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema IN ('public', 'nuansu')
        AND data_type = 'bytea'
        AND column_name LIKE '%_nonce'
    `)) as unknown as {
      table_schema: string;
      table_name: string;
      column_name: string;
    }[];

    const all = (await client.db.execute(sql`
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema IN ('public', 'nuansu')
        AND data_type = 'bytea'
    `)) as unknown as {
      table_schema: string;
      table_name: string;
      column_name: string;
    }[];

    const present = new Set(all.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`));

    const orphans = rows.filter((r) => {
      const baseName = r.column_name.replace(/_nonce$/, "");
      return !present.has(`${r.table_schema}.${r.table_name}.${baseName}`);
    });

    expect(
      orphans,
      `Orphan *_nonce columns with no sibling: ${orphans.map((o) => `${o.table_name}.${o.column_name}`).join(", ")}`,
    ).toEqual([]);
  });
});
