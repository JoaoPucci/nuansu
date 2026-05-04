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
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "./migrate.js";
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

describeIntegration("ensureRoleSearchPath — DB-scoped takes precedence over role-global", () => {
  // Restore the migrate-driven state after the precedence test mutates
  // it directly via SQL, so subsequent test files start clean.
  afterEach(async () => {
    if (env) {
      await runMigrations({
        migrateUrl: env.migrateUrl,
        appPassword: env.appPassword,
        authPassword: env.authPassword,
        migratePassword: env.migratePassword,
        sessionProofSecret: env.sessionProofSecret,
      });
    }
  });

  it("re-applying migrate corrects a stale DB-scoped search_path even when the role-global one matches", async () => {
    if (!env) return;
    const raw = postgres(env.migrateUrl, { max: 1 });
    try {
      // Inject an INTENTIONALLY STALE DB-scoped search_path on
      // nuansu_auth that's CLEARLY DIFFERENT from desired (no
      // `public`, only `pg_temp`). The role-global value was set
      // correctly by globalSetup's migrate run. Without the
      // precedence detection, ensureRoleSearchPath would read the
      // matching global row first and return early — runtime
      // sessions would still see the stale DB-scoped value (no
      // public schema → user-scoped tables unreachable).
      //
      // Database name is read from the connection (dev: "nuansu",
      // CI: "nuansu_test"), then quoted as a SQL identifier.
      const dbRows = (await raw`SELECT current_database() AS db`) as unknown as { db: string }[];
      const dbName = dbRows[0]?.db ?? "";
      const dbIdent = `"${dbName.replace(/"/g, '""')}"`;
      await raw.unsafe(`ALTER ROLE nuansu_auth IN DATABASE ${dbIdent} SET search_path = 'pg_temp'`);

      const before = await raw<{ setconfig: string[] | null }[]>`
          SELECT setconfig
          FROM pg_catalog.pg_db_role_setting s
          JOIN pg_catalog.pg_roles r ON r.oid = s.setrole
          WHERE r.rolname = 'nuansu_auth'
            AND s.setdatabase = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
        `;
      expect(before).toHaveLength(1);
      expect(before[0]?.setconfig?.[0]).toBe("search_path=pg_temp");

      // Re-run migrations. The precedence-aware check detects the
      // stale DB-scoped value, RESETs the DB-scoped search_path
      // entry, then re-writes the role-global with the desired
      // value.
      await runMigrations({
        migrateUrl: env.migrateUrl,
        appPassword: env.appPassword,
        authPassword: env.authPassword,
        migratePassword: env.migratePassword,
        sessionProofSecret: env.sessionProofSecret,
      });

      // After: DB-scoped row's search_path entry is gone (RESET
      // dropped just that setting; the row itself may stay if other
      // DB-scoped settings exist, but search_path entry is removed),
      // and the role-global one has `public`.
      const dbScoped = await raw<{ setconfig: string[] | null }[]>`
          SELECT setconfig
          FROM pg_catalog.pg_db_role_setting s
          JOIN pg_catalog.pg_roles r ON r.oid = s.setrole
          WHERE r.rolname = 'nuansu_auth'
            AND s.setdatabase = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
        `;
      const dbScopedSearchPath = dbScoped[0]?.setconfig?.find((c) => c.startsWith("search_path="));
      // Either the DB-scoped row is gone entirely (RESET on the only
      // setting drops the row), or it survives without search_path.
      expect(dbScopedSearchPath).toBeUndefined();

      // Effective lookup (DB-scoped first, then global). Without the
      // stale DB-scoped row in the way, the global wins and now
      // contains `public`.
      const effective = await raw<{ setconfig: string[] | null }[]>`
          SELECT setconfig
          FROM pg_catalog.pg_db_role_setting s
          JOIN pg_catalog.pg_roles r ON r.oid = s.setrole
          WHERE r.rolname = 'nuansu_auth'
            AND (s.setdatabase = 0
                 OR s.setdatabase = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()))
          ORDER BY s.setdatabase DESC
          LIMIT 1
        `;
      const effectiveSearchPath = effective[0]?.setconfig?.find((c) =>
        c.startsWith("search_path="),
      );
      expect(effectiveSearchPath).toBeDefined();
      expect(effectiveSearchPath).toMatch(/\bpublic\b/);
    } finally {
      await raw.end({ timeout: 1 });
    }
  }, 20_000);
});
