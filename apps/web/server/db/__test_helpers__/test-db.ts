// Test-DB harness shared across integration + fitness tests.
//
// Reads connection URLs and the session-proof secret from env (the same
// values CI sets in `.github/workflows/ci.yml`'s `test` job and a local
// dev sets via `.env.local` / docker-compose). Runs the full migration
// pipeline once per test run; truncate helpers reset user data between
// individual tests so each suite starts from a deterministic empty state.

import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { uuidv7 } from "uuidv7";

import { runMigrations } from "../migrate.js";
import * as schema from "../schema.js";

export interface TestEnv {
  databaseUrl: string;
  authDatabaseUrl: string;
  migrateUrl: string;
  appPassword: string;
  authPassword: string;
  migratePassword: string;
  sessionProofSecret: string;
}

/**
 * Returns the test-DB env if all required vars are set, or null
 * otherwise. Callers (integration / fitness suites) use this with
 * `describe.skipIf(!env)` so the lefthook pre-commit step (which
 * runs `vitest --changed` without the DB env) skips integration
 * suites cleanly instead of crashing on module load.
 *
 * **Hard-fails when CI is true.** Silently skipping these suites in
 * CI would mask the only end-to-end coverage of the data-plane RLS
 * + role-isolation guarantees — exactly the security tests CI must
 * never let a config drift drop. GitHub Actions, GitLab CI, CircleCI,
 * Buildkite and basically every other runner set `CI=true`; the
 * env-missing path therefore throws when that signal is present.
 * Local pre-commit + pure-unit-test runs (where `CI` is unset) keep
 * the silent-skip behaviour so they don't require a Postgres.
 */
export function readTestEnvOrSkip(): TestEnv | null {
  const databaseUrl = process.env.DATABASE_URL;
  const authDatabaseUrl = process.env.AUTH_DATABASE_URL;
  const migrateUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
  const sessionProofSecret = process.env.NUANSU_DB_SESSION_PROOF_SECRET;

  if (!databaseUrl || !authDatabaseUrl || !migrateUrl || !sessionProofSecret) {
    if (isCi()) {
      throw new Error(
        "Test DB env missing in CI context. Required: DATABASE_URL, " +
          "AUTH_DATABASE_URL, MIGRATE_DATABASE_URL (or DIRECT_DATABASE_URL), " +
          "NUANSU_DB_SESSION_PROOF_SECRET. Refusing to skip integration / " +
          "fitness suites — these are the data-plane RLS + role-isolation " +
          "security proofs and CI must run them. Fix the workflow env.",
      );
    }
    return null;
  }
  return {
    databaseUrl,
    authDatabaseUrl,
    migrateUrl,
    appPassword: extractPassword(databaseUrl, "DATABASE_URL"),
    authPassword: extractPassword(authDatabaseUrl, "AUTH_DATABASE_URL"),
    migratePassword: extractPassword(migrateUrl, "MIGRATE_DATABASE_URL"),
    sessionProofSecret,
  };
}

/**
 * Detect a CI runner. GitHub Actions / GitLab CI / CircleCI /
 * Buildkite / Travis all export `CI=true`; some legacy systems use
 * `CI=1`. Anything else (local shell, lefthook pre-commit) is
 * treated as non-CI.
 */
function isCi(): boolean {
  const ci = process.env.CI;
  return ci === "true" || ci === "1";
}

/**
 * Same as readTestEnvOrSkip, but throws when the env is missing.
 * Used by globalSetup which needs to fail loudly if the test env
 * is partially configured.
 */
export function readTestEnv(): TestEnv {
  const env = readTestEnvOrSkip();
  if (!env) {
    throw new Error(
      "Test DB env missing. Required: DATABASE_URL, AUTH_DATABASE_URL, " +
        "MIGRATE_DATABASE_URL (or DIRECT_DATABASE_URL), NUANSU_DB_SESSION_PROOF_SECRET.",
    );
  }
  return env;
}

function extractPassword(url: string, label: string): string {
  const u = new URL(url);
  if (!u.password) {
    throw new Error(`${label} must include a password component`);
  }
  return decodeURIComponent(u.password);
}

/**
 * Kept for tests that want an explicit re-migration step (e.g., when
 * a destructive earlier test wiped the schema). The actual migration
 * runs once via `test/setup/global-db.ts`'s globalSetup hook before any
 * test file is loaded; this remains for parity with the historical API.
 */
export async function migrateOnce(env: TestEnv): Promise<void> {
  await runMigrations({
    migrateUrl: env.migrateUrl,
    appPassword: env.appPassword,
    authPassword: env.authPassword,
    migratePassword: env.migratePassword,
    sessionProofSecret: env.sessionProofSecret,
  });
}

/**
 * Seed a Better Auth user (the trigger creates the companion users row).
 * Returns the new user id (UUID-shaped text). Uses the auth role.
 */
export async function seedAuthUser(
  env: TestEnv,
  attrs: { email: string; locale?: string } = { email: "" },
): Promise<string> {
  const userId = uuidv7();
  const sql = postgres(env.authDatabaseUrl, { max: 1 });
  try {
    await sql`
      INSERT INTO auth_users (id, email)
      VALUES (${userId}, ${attrs.email || `${userId}@test.invalid`})
    `;
  } finally {
    await sql.end({ timeout: 1 });
  }
  return userId;
}

/**
 * Wipe all user-data + auth tables. Run this in `beforeEach` of any
 * suite that mutates data so the next test starts from empty. Uses
 * the migrate role so it can TRUNCATE across role-restricted tables
 * in one statement.
 */
export async function truncateAppData(env: TestEnv): Promise<void> {
  const sql = postgres(env.migrateUrl, { max: 1 });
  try {
    await sql.unsafe(`
      TRUNCATE TABLE
        public.audit_log,
        public.audit_points,
        public.message_versions,
        public.messages,
        public.pref_suggestions,
        public.preferences_chat,
        public.preferences_global,
        public.usage_events,
        public.export_jobs,
        public.deletion_requests,
        public.subscriptions,
        public.name_locks,
        public.chats,
        public.users,
        public.auth_verification_tokens,
        public.auth_sessions,
        public.auth_accounts,
        public.auth_users,
        public.webhook_events,
        public.waitlist
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

/**
 * Returns a Drizzle client connected as the migrate role. Used by
 * fitness tests that need to read pg_catalog views regardless of RLS.
 */
export function makeMigrateClient(env: TestEnv): {
  db: PostgresJsDatabase<typeof schema>;
  close: () => Promise<void>;
} {
  const sql = postgres(env.migrateUrl, { max: 1 });
  const db = drizzle(sql, { schema });
  return { db, close: () => sql.end({ timeout: 1 }) };
}
