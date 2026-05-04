// Fitness: every user-scoped table has RLS enabled. Catches the
// most likely failure mode — a new table added to schema.ts without
// the matching `ALTER TABLE … ENABLE ROW LEVEL SECURITY` in rls.sql.
//
// `RLS_DISABLED_OK` lists the cross-user infra tables (webhook_events,
// waitlist, audit_log) where the data is intentionally cross-user.
// Auth_* tables are RLS-enabled but role-conditional (full for
// nuansu_auth, self-only for nuansu_app); they pass the same check.
//
// Authority: docs/back_end_architecture.md §3.3 + docs/security.md §4.

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { makeMigrateClient, readTestEnvOrSkip } from "../db/__test_helpers__/test-db.js";

const env = readTestEnvOrSkip();
const describeFitness = env ? describe : describe.skip;
let close: (() => Promise<void>) | null = null;

const RLS_DISABLED_OK: ReadonlySet<string> = new Set([
  "webhook_events", // cross-user idempotency log
  "waitlist", // pre-signup
]);

afterAll(async () => {
  if (close) await close();
});

describeFitness("schema fitness — RLS enabled on user-scoped tables", () => {
  it("every public.* table has RLS enabled (or is in RLS_DISABLED_OK)", async () => {
    if (!env) return;
    const client = makeMigrateClient(env);
    close = client.close;

    const rows = (await client.db.execute(sql`
      SELECT relname, relrowsecurity
      FROM pg_catalog.pg_class
      WHERE relkind = 'r'
        AND relnamespace = 'public'::regnamespace
        AND relname NOT LIKE '\\_\\_%' ESCAPE '\\'
      ORDER BY relname
    `)) as unknown as { relname: string; relrowsecurity: boolean }[];

    const offenders = rows.filter((r) => !r.relrowsecurity && !RLS_DISABLED_OK.has(r.relname));

    expect(
      offenders,
      `Tables without RLS that aren't in RLS_DISABLED_OK: ${offenders.map((o) => o.relname).join(", ")}`,
    ).toEqual([]);
    // Sanity — too few tables means the introspection is broken.
    expect(rows.length).toBeGreaterThan(15);
  });

  it("audit_log has RLS enabled (system + user rows can coexist safely)", async () => {
    if (!env) return;
    // Pulled out as its own assertion because audit_log is borderline:
    // it carries cross-user system entries (user_id NULL) AND per-user
    // entries. RLS must be ON; the policy lets the app role see only
    // its own user_id rows.
    const client = makeMigrateClient(env);
    close = client.close;

    const [row] = (await client.db.execute(sql`
      SELECT relrowsecurity FROM pg_catalog.pg_class
      WHERE relkind = 'r' AND oid = 'public.audit_log'::regclass
    `)) as unknown as { relrowsecurity: boolean }[];
    expect(row?.relrowsecurity).toBe(true);
  });

  it("RLS-enabled table has at least one policy", async () => {
    if (!env) return;
    const client = makeMigrateClient(env);
    close = client.close;

    const rows = (await client.db.execute(sql`
      SELECT c.relname,
             (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS policy_count
      FROM pg_catalog.pg_class c
      WHERE c.relkind = 'r'
        AND c.relnamespace = 'public'::regnamespace
        AND c.relrowsecurity = true
      ORDER BY c.relname
    `)) as unknown as { relname: string; policy_count: string }[];

    const noPolicy = rows.filter((r) => Number(r.policy_count) === 0);
    expect(
      noPolicy,
      `Tables with RLS enabled but zero policies (effectively block-all): ${noPolicy.map((r) => r.relname).join(", ")}`,
    ).toEqual([]);
  });
});
