// Integration: citext columns behave case-insensitively at runtime
// across both runtime roles (nuansu_app + nuansu_auth), regardless of
// where the citext extension is installed. This exercises the
// `setRuntimeSearchPath` wiring in migrate.ts — without that step, on
// installs where citext lives outside `public` (managed Postgres), the
// `=` operator would silently fall back to text equality and email
// lookups would suddenly become case-sensitive.
//
// We don't simulate a non-public install here (the test DB layout is a
// CI fixture; rebuilding it would race with other suites). Instead we
// query `pg_db_role_setting` and assert the role-level search_path was
// set to a value that includes either the citext extension's own
// schema or `public` (whichever is current). Then we exercise an
// actual case-insensitive INSERT + SELECT to lock in the user-visible
// behaviour.

import postgres from "postgres";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { readTestEnvOrSkip, truncateAppData } from "./__test_helpers__/test-db.js";

const env = readTestEnvOrSkip();
const describeIntegration = env ? describe : describe.skip;

beforeEach(async () => {
  if (env) await truncateAppData(env);
});

afterAll(async () => {
  /* per-test sql is closed inline; nothing to release here */
});

describeIntegration("citext — runtime case-insensitive comparison", () => {
  it("nuansu_app + nuansu_auth have a role-level default search_path", async () => {
    if (!env) return;
    const raw = postgres(env.migrateUrl, { max: 1 });
    try {
      // ALTER ROLE … SET search_path (without `IN DATABASE`) records
      // setdatabase = 0 — applies to every database the role logs into.
      // Include both database-scoped and role-global rows.
      const rows = await raw<{ rolname: string; setconfig: string[] | null }[]>`
        SELECT r.rolname, s.setconfig
        FROM pg_catalog.pg_db_role_setting s
        JOIN pg_catalog.pg_roles r ON r.oid = s.setrole
        WHERE r.rolname IN ('nuansu_app', 'nuansu_auth')
          AND (s.setdatabase = 0
               OR s.setdatabase = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()))
      `;
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.setconfig, `${row.rolname} has no setconfig`).not.toBeNull();
        const search = row.setconfig?.find((s) => s.startsWith("search_path="));
        expect(search, `${row.rolname} missing search_path`).toBeDefined();
        // Postgres normalizes the stored search_path: regular
        // identifiers like `public` lose their quotes; only quoted-only
        // identifiers (with a non-public schema name) keep them. And
        // Postgres trims trailing pg_catalog/pg_temp from the stored
        // role-level setting since they're added implicitly to every
        // session — so the regex only requires `public` at the start.
        expect(search).toMatch(/search_path=\s*"?public"?/);
      }
    } finally {
      await raw.end({ timeout: 1 });
    }
  });

  it("auth_users.email comparison via nuansu_auth is case-insensitive", async () => {
    if (!env) return;
    const userId = uuidv7();
    const auth = postgres(env.authDatabaseUrl, { max: 1 });
    try {
      await auth`
        INSERT INTO auth_users (id, email)
        VALUES (${userId}, 'Mariko@Example.Test')
      `;
      // Lookup in lowercase MUST match — this is the citext-vs-text
      // distinction. With a busted search_path the operator falls back
      // to text equality and the mixed-case stored value loses the
      // match, returning 0 rows.
      const found = await auth`
        SELECT id FROM auth_users WHERE email = 'mariko@example.test'
      `;
      expect(found).toHaveLength(1);
      expect((found[0] as { id: string }).id).toBe(userId);
    } finally {
      await auth.end({ timeout: 1 });
    }
  });

  it("waitlist.email INSERT via nuansu_app survives case-insensitive uniqueness", async () => {
    if (!env) return;
    // waitlist is INSERT-only for nuansu_app (it has no SELECT grant —
    // see rls.sql). The case-insensitivity behaviour we exercise here
    // is the PRIMARY KEY constraint on `email citext`: a duplicate
    // INSERT with different casing must collide. Without citext
    // operator resolution, the unique index would compare as text and
    // accept both rows.
    const app = postgres(env.databaseUrl, { max: 1 });
    try {
      await app.unsafe(`INSERT INTO waitlist (email) VALUES ('Founder@Nuansu.App')`);
      await expect(
        app.unsafe(`INSERT INTO waitlist (email) VALUES ('founder@nuansu.app')`),
      ).rejects.toThrow(/duplicate key|unique/);
    } finally {
      await app.end({ timeout: 1 });
    }
  });
});
