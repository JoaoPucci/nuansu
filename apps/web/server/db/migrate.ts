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

async function discoverCitextSchema(sql: ReturnType<typeof postgres>): Promise<string> {
  const [row] = await sql<{ nspname: string }[]>`
    SELECT n.nspname
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'citext'
  `;
  if (!row) {
    throw new Error("citext extension not installed by bootstrap");
  }
  return row.nspname;
}

function quoteSchema(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
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
  const citextSchema = await discoverCitextSchema(sql);
  const parts = [`"public"`];
  if (citextSchema !== "public") {
    parts.push(quoteSchema(citextSchema));
  }
  parts.push("pg_catalog", "pg_temp");
  return parts.join(", ");
}

/**
 * Set role-level default search_path on nuansu_app + nuansu_auth so
 * every runtime session for those roles resolves the citext type's
 * comparison operators correctly — without this, `citext` columns on
 * managed Postgres (where the extension lives in `extensions` rather
 * than `public`) would resolve `=` to text equality and lose the
 * case-insensitive semantics that auth_users.email and waitlist.email
 * depend on.
 *
 * Two steps because Postgres needs both:
 *   - `GRANT USAGE ON SCHEMA <citext_schema>` so the role is allowed
 *     to USE objects in that schema. Without USAGE, citext operators
 *     silently fail to bind and equality falls back to text.
 *   - `ALTER ROLE … SET search_path` so the role finds those operators
 *     by name resolution.
 *
 * Both mutations are idempotency-aware: each step is skipped when the
 * desired state is already in place. This matters for reruns where
 * `MIGRATE_DATABASE_URL` points at a role (e.g., `nuansu_migrate` on a
 * managed Postgres) that does NOT own the extension schema and would
 * therefore fail to re-issue `GRANT USAGE` even though the privilege
 * is already present from first-bootstrap. Same reasoning for ALTER
 * ROLE which (Postgres 16+) requires ADMIN OPTION on the target role.
 *
 * The first bootstrap runs as the platform superuser and seeds both;
 * subsequent runs detect the state and become no-ops.
 */
async function setRuntimeSearchPath(sql: ReturnType<typeof postgres>): Promise<void> {
  const citextSchema = await discoverCitextSchema(sql);
  const parts = [`"public"`];
  if (citextSchema !== "public") {
    parts.push(quoteSchema(citextSchema));
    await ensureSchemaUsageGranted(sql, citextSchema, ["nuansu_app", "nuansu_auth"]);
  }
  const searchPath = parts.join(", ");
  for (const role of ["nuansu_app", "nuansu_auth"] as const) {
    await ensureRoleSearchPath(sql, role, searchPath);
  }
}

/**
 * Skip the GRANT when both target roles already have USAGE on the
 * given schema. Avoids `permission denied for schema …` on reruns by
 * a non-owner (managed-Postgres operator role lacks ownership of the
 * platform-managed `extensions` schema).
 */
async function ensureSchemaUsageGranted(
  sql: ReturnType<typeof postgres>,
  schema: string,
  roles: readonly RoleName[],
): Promise<void> {
  const checks = await sql<{ rolname: string; has_usage: boolean }[]>`
    SELECT r.rolname, pg_catalog.has_schema_privilege(r.oid, ${schema}, 'USAGE') AS has_usage
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = ANY(${roles})
  `;
  const missing = checks.filter((c) => !c.has_usage).map((c) => c.rolname);
  if (missing.length === 0) return;
  // Validate role names against the allowlist before inlining into DDL.
  const ids = missing.map((r) => pgIdentifier(r as RoleName)).join(", ");
  await sql.unsafe(`GRANT USAGE ON SCHEMA ${quoteSchema(schema)} TO ${ids}`);
}

/**
 * Skip the ALTER ROLE when the role's stored default search_path
 * already matches the desired value. Postgres normalises the stored
 * setting (drops quotes around regular identifiers, trims trailing
 * pg_catalog/pg_temp), so the comparison is loose: it asserts every
 * non-implicit schema we want appears in the stored entry.
 *
 * Two precedence subtleties matter:
 *
 *   1. Detection: an `ALTER ROLE … IN DATABASE` setting (setdatabase
 *      = the active DB's oid) overrides a role-global `ALTER ROLE …`
 *      one (setdatabase = 0) for sessions on that database. The query
 *      orders DB-scoped rows first and LIMIT 1 to read the row that
 *      runtime sessions would actually see — iterating both rows
 *      would let a matching global value mask a stale DB-scoped one.
 *
 *   2. Correction: if the effective row is a stale DB-scoped one,
 *      writing only the role-global (`ALTER ROLE …`) leaves the
 *      DB-scoped row in place and runtime sessions still see the
 *      stale value. So we issue `ALTER ROLE … IN DATABASE … RESET
 *      search_path` first to drop just that one setting (other DB-
 *      scoped entries on the same row, like work_mem, are preserved),
 *      then write the role-global with `ALTER ROLE … SET …`.
 */
async function ensureRoleSearchPath(
  sql: ReturnType<typeof postgres>,
  role: RoleName,
  desired: string,
): Promise<void> {
  const [effective] = await sql<{ setconfig: string[] | null; is_db_scoped: boolean }[]>`
    SELECT s.setconfig, s.setdatabase <> 0 AS is_db_scoped
    FROM pg_catalog.pg_db_role_setting s
    JOIN pg_catalog.pg_roles r ON r.oid = s.setrole
    WHERE r.rolname = ${role}
      AND (s.setdatabase = 0
           OR s.setdatabase = (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()))
    ORDER BY s.setdatabase DESC
    LIMIT 1
  `;

  if (effective) {
    const desiredSchemas = parseSearchPathSchemas(desired);
    const stored = (effective.setconfig ?? []).find((c) => c.startsWith("search_path="));
    if (stored) {
      const storedSchemas = parseSearchPathSchemas(stored.replace(/^search_path=\s*/, ""));
      if (desiredSchemas.every((s) => storedSchemas.includes(s))) {
        return;
      }
    }

    // Effective row is stale. If it's the DB-scoped one, RESET it so
    // the role-global value (which we're about to set) takes effect.
    if (effective.is_db_scoped) {
      const [dbRow] = await sql<{ name: string }[]>`SELECT pg_catalog.current_database() AS name`;
      const dbName = dbRow?.name ?? "";
      await sql.unsafe(
        `ALTER ROLE ${pgIdentifier(role)} IN DATABASE "${dbName.replace(/"/g, '""')}" RESET search_path`,
      );
    }
  }

  await sql.unsafe(`ALTER ROLE ${pgIdentifier(role)} SET search_path = ${desired}`);
}

/**
 * Pull the schema names out of a SET search_path string. Drops
 * pg_catalog and pg_temp (always implicit), strips quotes from each
 * remaining entry, lowercases. Used to compare a desired path against
 * Postgres's normalised stored value.
 */
function parseSearchPathSchemas(value: string): string[] {
  return value
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .toLowerCase(),
    )
    .filter((part) => part.length > 0 && part !== "pg_catalog" && part !== "pg_temp");
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

    // 5. Pin runtime roles' default search_path so every session
    //    resolves citext operators correctly (managed Postgres puts
    //    extensions in non-public schemas; without this, citext
    //    columns silently degrade to text comparison).
    await setRuntimeSearchPath(sql);

    // 6. Persist the session-proof HMAC secret so nuansu.verify_hmac
    //    can recompute and compare on every RLS evaluation.
    await setSessionProofSecret(sql, opts.sessionProofSecret);
  } finally {
    await sql.end({ timeout: 1 });
  }
}
