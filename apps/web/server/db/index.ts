// db.forUser — the only legitimate query path for user-scoped tables.
//
// Every Hono route that touches application tables MUST go through this
// wrapper. ESLint enforces the boundary (no-restricted-syntax bans
// direct access to the schema-table exports outside of `db.forUser` /
// `db.system` callers).
//
// What it does:
//   1. BEGIN a transaction on the nuansu_app pool.
//   2. SET LOCAL nuansu.session_proof = signed proof for the user.
//   3. Run the caller's callback with the bound transaction client.
//   4. COMMIT or ROLLBACK.
//
// Inside the transaction, every SELECT/UPDATE/DELETE on user-scoped
// tables is filtered by the RLS policy `user_id = nuansu.current_user_id()`
// — and `nuansu.current_user_id()` reads `nuansu.session_proof`,
// verifies its HMAC against the server secret in `nuansu.config`, and
// returns the user_id only if the signature matches. A connection that
// SET nuansu.session_proof to an attacker-chosen value WITHOUT the
// secret (e.g., via SQL injection) gets a verification failure and the
// function returns NULL → all RLS predicates fail → empty result set.

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { signSessionProof } from "./hmac.js";
import * as schema from "./schema.js";

export type AppDb = PostgresJsDatabase<typeof schema>;

interface ForUserOptions {
  /** UUID-shaped user id (from Better Auth / users.id). */
  userId: string;
  /** HMAC secret matching `nuansu.config['session_proof_secret']`. */
  sessionProofSecret: string;
}

interface AppPool {
  sql: ReturnType<typeof postgres>;
  db: AppDb;
}

const poolCache = new Map<string, AppPool>();

function appPool(databaseUrl: string): AppPool {
  const existing = poolCache.get(databaseUrl);
  if (existing) return existing;
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql, { schema });
  const created: AppPool = { sql, db };
  poolCache.set(databaseUrl, created);
  return created;
}

/**
 * Run a callback inside a per-user transaction. The callback receives
 * a Drizzle transaction object scoped (via RLS) to the caller's rows.
 *
 * `databaseUrl` should be the runtime app role (nuansu_app) — passing
 * a different role bypasses the role-separation defence layer.
 */
export async function forUser<T>(
  databaseUrl: string,
  opts: ForUserOptions,
  fn: (tx: AppDb) => Promise<T>,
): Promise<T> {
  const proof = signSessionProof(opts.userId, opts.sessionProofSecret);
  const { db } = appPool(databaseUrl);
  return db.transaction(async (tx) => {
    // SET LOCAL is bound to the current transaction; it auto-clears on
    // COMMIT/ROLLBACK. The proof string is built by signSessionProof
    // which asserts userId shape (no colon, alphanumeric); HMAC hex is
    // 64 lowercase hex chars by construction. Both are double-quoted
    // for SQL literals via pgLiteral.
    await tx.execute(sql.raw(`SET LOCAL nuansu.session_proof = ${pgLiteral(proof)}`));
    return fn(tx);
  });
}

/**
 * Close every cached pool. Test harness uses this between runs to
 * release server-side connections; production code never calls it.
 */
export async function closeAppPools(): Promise<void> {
  const pools = Array.from(poolCache.values());
  poolCache.clear();
  await Promise.all(pools.map((p) => p.sql.end({ timeout: 1 })));
}

function pgLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// Re-export the schema namespace so callers can `import { db, schema }`
// in one go: `db.forUser(...).select().from(schema.chats)`.
export { schema };
