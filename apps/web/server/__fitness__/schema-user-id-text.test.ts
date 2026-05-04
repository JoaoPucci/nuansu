// Fitness: every `user_id` column in any application table is `text`,
// so it matches `users.id` and `auth_users.id` (Better Auth issues
// string IDs). A type mismatch silently breaks foreign-key enforcement
// AND the RLS predicate `user_id = nuansu.current_user_id()` (which
// returns text — comparison would always be false on a uuid column).
//
// Authority: docs/back_end_architecture.md §3.1, "All user_id columns are text".

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { makeMigrateClient, readTestEnvOrSkip } from "../db/__test_helpers__/test-db.js";

const env = readTestEnvOrSkip();
const describeFitness = env ? describe : describe.skip;
let close: (() => Promise<void>) | null = null;

afterAll(async () => {
  if (close) await close();
});

describeFitness("schema fitness — user_id columns are text", () => {
  it("every public.* table that has a user_id column types it as text", async () => {
    if (!env) return;
    const client = makeMigrateClient(env);
    close = client.close;

    // Read information_schema.columns for the public schema; any
    // user_id whose data_type isn't 'text' fails the assertion.
    const rows = (await client.db.execute(sql`
      SELECT table_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'user_id'
      ORDER BY table_name
    `)) as unknown as { table_name: string; data_type: string }[];

    const offenders = rows.filter((r) => r.data_type !== "text");

    expect(offenders, `Tables with non-text user_id: ${JSON.stringify(offenders)}`).toEqual([]);
    // Sanity — the migration should have produced at least the documented
    // user_id-bearing tables. If the count drops to 0 the introspection is
    // broken (false-pass).
    expect(rows.length, "Expected several user_id columns").toBeGreaterThan(5);
  });
});
