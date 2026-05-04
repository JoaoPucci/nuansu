// Migration orchestrator — creates the three Postgres roles on first
// bootstrap, applies the static bootstrap SQL, runs Drizzle's migration
// suite, then applies the RLS policies + table grants. Run via
// `pnpm db:migrate`.
//
// Idempotent end-to-end. Safe to re-run on every deploy. Uses the
// MIGRATE_DATABASE_URL connection (which must have CREATE ROLE
// privilege on first bootstrap; in dev/CI this is the docker-compose
// superuser). Subsequent runs do NOT mutate role attributes — see
// ensureRole's docstring for why and what that means for password
// rotation.

import { migrate as drizzleMigrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

interface MigrateOptions {
  /** Connection URL for the role applying DDL (creates roles, runs migrations). */
  migrateUrl: string;
  /** Password used when CREATING the runtime nuansu_app role on first bootstrap (ignored on subsequent runs — rotation is an operator task). */
  appPassword: string;
  /** Password used when CREATING the Better Auth nuansu_auth role on first bootstrap (ignored on subsequent runs). */
  authPassword: string;
  /** Password used when CREATING the migration nuansu_migrate role itself on first bootstrap (ignored on subsequent runs). */
  migratePassword: string;
  /** HMAC secret stored in nuansu.config; matches NUANSU_DB_SESSION_PROOF_SECRET. */
  sessionProofSecret: string;
}

type RoleName = "nuansu_migrate" | "nuansu_auth" | "nuansu_app";

// Allowlist enforces role-name shape so the format() inlining below
// can't be coerced into running attacker SQL.
const ROLE_NAME_RE = /^nuansu_[a-z]+$/;

function noopNotice(): void {
  /* swallow Postgres NOTICE messages emitted by idempotent DDL */
}

/**
 * Build the SET search_path string to use for the Drizzle migration
 * step. Always starts with `public` (so unqualified CREATE TABLEs land
 * there rather than in the migrate-role's eponymous schema), then
 * includes the citext extension's actual schema if it differs from
 * public, then `pg_catalog` and `pg_temp` per security.md §13.2.
 *
 * Schema names from pg_namespace are validated by Postgres and safe to
 * inline; we still double-quote them to be explicit.
 */
async function buildMigrateSearchPath(sql: ReturnType<typeof postgres>): Promise<string> {
  const rows = await sql<{ extname: string; nspname: string }[]>`
    SELECT e.extname, n.nspname
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('citext', 'pgcrypto')
  `;
  const citext = rows.find((r) => r.extname === "citext");
  if (!citext) {
    throw new Error("citext extension not installed by bootstrap");
  }
  const parts = [`"public"`];
  if (citext.nspname !== "public") {
    parts.push(`"${citext.nspname.replace(/"/g, '""')}"`);
  }
  parts.push("pg_catalog", "pg_temp");
  return parts.join(", ");
}

function pgLiteral(value: string): string {
  // Postgres SQL literal: wrap in single quotes, double any embedded single quotes.
  return `'${value.replace(/'/g, "''")}'`;
}

function pgIdentifier(name: string): string {
  if (!ROLE_NAME_RE.test(name)) {
    throw new Error(`Refusing to use untrusted identifier in DDL: ${name}`);
  }
  return `"${name}"`;
}

/**
 * Create a role if it doesn't already exist. Subsequent runs (after the
 * role is created on first bootstrap) are no-ops by design.
 *
 * Why no ALTER on existing roles: in Postgres 16+, ALTER ROLE requires
 * the issuing role to hold ADMIN OPTION on the target role. A role does
 * NOT hold admin on itself by default, so the migration runner — which
 * connects as MIGRATE_DATABASE_URL's principal — would fail to ALTER
 * its own login on the second run if MIGRATE_DATABASE_URL points at
 * `nuansu_migrate`. The doc'd production posture (back_end_architecture.md
 * §3.3) is that role passwords are set ONCE during the first bootstrap
 * and rotated out-of-band by the operator (e.g., a one-shot psql or
 * cloud-console action), not on every deploy. The `password` argument
 * here is therefore only consulted when the role is being created.
 */
async function ensureRole(
  sql: ReturnType<typeof postgres>,
  role: RoleName,
  password: string,
): Promise<void> {
  const exists = await sql<{ rolname: string }[]>`
    SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ${role}
  `;
  if (exists.length > 0) return;
  await sql.unsafe(`CREATE ROLE ${pgIdentifier(role)} WITH LOGIN PASSWORD ${pgLiteral(password)}`);
}

function migrationsDir(): string {
  // server/db/migrate.ts → server/db/migrations
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
}

function bootstrapSqlPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "bootstrap.sql");
}

function rlsSqlPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "rls.sql");
}

async function applySqlFile(sql: ReturnType<typeof postgres>, file: string): Promise<void> {
  const body = await readFile(file, "utf8");
  await sql.unsafe(body);
}

async function setSessionProofSecret(
  sql: ReturnType<typeof postgres>,
  secret: string,
): Promise<void> {
  await sql`
    INSERT INTO nuansu.config (key, value, updated_at)
    VALUES ('session_proof_secret', ${Buffer.from(secret, "utf8")}, now())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
  `;
}

export async function runMigrations(opts: MigrateOptions): Promise<void> {
  // Pool size 1 — DDL is serial and we don't want statement-level
  // pool reuse to trip on transaction state from a prior step.
  // onnotice is a no-op so non-fatal Postgres NOTICE messages (e.g.,
  // "extension already exists, skipping") don't pollute stderr during
  // idempotent re-runs.
  const sql = postgres(opts.migrateUrl, { max: 1, onnotice: noopNotice });
  try {
    // 1. Roles first — bootstrap.sql references nuansu_app/nuansu_auth/
    //    nuansu_migrate via GRANT and AUTHORIZATION clauses, so they
    //    must already exist. ensureRole is CREATE-on-missing only;
    //    password rotation is not the migrate runner's job (Postgres
    //    16+ ADMIN-OPTION semantics make per-run ALTER fragile, and
    //    rotation is an operator task — see ensureRole's docstring
    //    for the rationale).
    await ensureRole(sql, "nuansu_migrate", opts.migratePassword);
    await ensureRole(sql, "nuansu_app", opts.appPassword);
    await ensureRole(sql, "nuansu_auth", opts.authPassword);

    // 2. Static bootstrap: extensions, nuansu schema, RLS function,
    //    trigger function, nuansu.config table.
    await applySqlFile(sql, bootstrapSqlPath());

    // 3. Application schema via Drizzle. Pin the session search_path
    //    so that:
    //      - unqualified `CREATE TABLE` lands in `public` (the default
    //        `"$user", public` would otherwise put tables in the
    //        migrate-role's eponymous schema, e.g. `nuansu`, and the
    //        cross-table FK constraints `REFERENCES "public"."users"`
    //        would fail);
    //      - unqualified `citext` type references in the generated
    //        migration resolve correctly even when the citext extension
    //        was pre-installed in a non-public schema (managed Postgres
    //        environments commonly install extensions in `extensions`).
    //    Both schemas are looked up dynamically — see citextSchema.
    const searchPath = await buildMigrateSearchPath(sql);
    await sql.unsafe(`SET search_path = ${searchPath}`);
    const migrateDb = drizzle(sql);
    await drizzleMigrate(migrateDb, { migrationsFolder: migrationsDir() });

    // 4. RLS policies + table-level grants + trigger creation. Done
    //    AFTER Drizzle so the tables exist.
    await applySqlFile(sql, rlsSqlPath());

    // 5. Persist the session-proof HMAC secret so nuansu.verify_hmac
    //    can recompute and compare on every RLS evaluation.
    await setSessionProofSecret(sql, opts.sessionProofSecret);
  } finally {
    await sql.end({ timeout: 1 });
  }
}
