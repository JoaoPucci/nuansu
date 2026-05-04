// Postgres + Drizzle clients, segregated by Postgres role.
//
// Three roles per docs/back_end_architecture.md §3.3:
//   nuansu_app     — runtime app traffic, used via the db.forUser wrapper
//   nuansu_auth    — Better Auth library only (server/auth/* — wired in 2E.2)
//   nuansu_migrate — migration runner only, never the runtime Worker
//
// Role separation is the second layer of defence behind the db.forUser
// app-layer wrapper and the third behind RLS. A SQL injection in any
// app route reaches Postgres as nuansu_app, which has no permissions on
// auth_* tables — so even an RLS bypass cannot dump credentials.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const POOL_MAX = 10;

export type AppDb = ReturnType<typeof drizzle>;

interface ClientCacheEntry {
  url: string;
  sql: ReturnType<typeof postgres>;
  db: AppDb;
}

const cache = new Map<string, ClientCacheEntry>();

function makeClient(url: string, max: number): ClientCacheEntry {
  const sql = postgres(url, { max });
  const db = drizzle(sql);
  return { url, sql, db };
}

function cachedClient(
  role: "app" | "auth" | "migrate",
  url: string,
  max: number,
): ClientCacheEntry {
  const existing = cache.get(role);
  if (existing?.url === url) return existing;
  // URL changed (e.g., test reconfiguring) — close the stale pool and replace.
  if (existing) void existing.sql.end({ timeout: 1 });
  const created = makeClient(url, max);
  cache.set(role, created);
  return created;
}

/**
 * Runtime app client (nuansu_app role). MUST be wrapped by db.forUser
 * before any application table is touched — direct access bypasses RLS
 * scoping. ESLint enforces the wrapper boundary; bypassing it is a CI
 * failure.
 */
export function getAppDb(databaseUrl: string): AppDb {
  return cachedClient("app", databaseUrl, POOL_MAX).db;
}

/**
 * Better Auth client (nuansu_auth role). Only `apps/web/server/auth/*`
 * imports this. Has SELECT/INSERT/UPDATE/DELETE on auth_* tables and
 * nothing else — no access to messages, chats, users, etc.
 */
export function getAuthDb(authDatabaseUrl: string): AppDb {
  return cachedClient("auth", authDatabaseUrl, POOL_MAX).db;
}

/**
 * Migrate client (nuansu_migrate role or superuser-equivalent). Used by
 * `migrate.ts` only. Pool size 1 — DDL is serial.
 */
export function getMigrateSql(migrateDatabaseUrl: string): ReturnType<typeof postgres> {
  return cachedClient("migrate", migrateDatabaseUrl, 1).sql;
}

/**
 * Close every cached pool. Used by the test harness between runs.
 */
export async function closeAllPools(): Promise<void> {
  const all = Array.from(cache.values());
  cache.clear();
  await Promise.all(all.map((entry) => entry.sql.end({ timeout: 1 })));
}
