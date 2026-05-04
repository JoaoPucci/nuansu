// Fitness: every SECURITY DEFINER function declares a pinned
// `search_path` on its CREATE statement. Without it, an attacker who
// controls any writable schema in the role's search_path can shadow
// unqualified built-ins (string_to_array, hmac, etc.) inside the
// function body and influence the authorisation decision —
// privilege escalation against the exact functions that gate RLS.
//
// Postgres records the function-level setting in `pg_proc.proconfig`
// as `'search_path=...'`. This test asserts every SECURITY DEFINER
// function in any schema we own has at least one search_path entry
// in proconfig.
//
// Authority: docs/security.md §13.2 (SECURITY DEFINER hardening).

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { makeMigrateClient, readTestEnvOrSkip } from "../db/__test_helpers__/test-db.js";

const env = readTestEnvOrSkip();
const describeFitness = env ? describe : describe.skip;
let close: (() => Promise<void>) | null = null;

afterAll(async () => {
  if (close) await close();
});

describeFitness("schema fitness — SECURITY DEFINER functions pin search_path", () => {
  it("every SECURITY DEFINER function in nuansu/public has a search_path setting", async () => {
    if (!env) return;
    const client = makeMigrateClient(env);
    close = client.close;

    // pg_proc.prosecdef = true → SECURITY DEFINER. proconfig is a
    // text[] of `key=value` strings; we look for any `search_path=…`
    // entry.
    const rows = (await client.db.execute(sql`
      SELECT
        n.nspname    AS schema_name,
        p.proname    AS function_name,
        p.proconfig  AS settings
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef = true
        AND n.nspname IN ('public', 'nuansu')
      ORDER BY n.nspname, p.proname
    `)) as unknown as {
      schema_name: string;
      function_name: string;
      settings: string[] | null;
    }[];

    expect(
      rows.length,
      "Expected at least 3 SECURITY DEFINER functions (verify_hmac, current_user_id, nuansu_auth_user_to_app_user)",
    ).toBeGreaterThanOrEqual(3);

    const offenders = rows.filter((r) => {
      const settings = r.settings ?? [];
      return !settings.some((s) => s.startsWith("search_path="));
    });

    expect(
      offenders,
      `SECURITY DEFINER functions without pinned search_path: ${offenders
        .map((o) => `${o.schema_name}.${o.function_name}`)
        .join(", ")}`,
    ).toEqual([]);
  });
});
