// Drizzle Kit configuration. Used by `pnpm db:generate` (diff schema.ts
// against the latest snapshot, write a new SQL migration) and `pnpm
// db:migrate` (apply pending migrations via the runner).
//
// `dbCredentials.url` reads MIGRATE_DATABASE_URL — that's the role with
// DDL privilege. The runtime app role (DATABASE_URL) cannot run
// migrations.

import { defineConfig } from "drizzle-kit";

const url =
  process.env["MIGRATE_DATABASE_URL"] ??
  process.env["DIRECT_DATABASE_URL"] ??
  process.env["DATABASE_URL"];

if (!url) {
  throw new Error(
    "drizzle.config.ts: MIGRATE_DATABASE_URL (preferred), DIRECT_DATABASE_URL, or DATABASE_URL must be set",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dbCredentials: { url },
  // strict + verbose for visibility on diffs (Drizzle prints the planned
  // SQL before writing the migration file).
  strict: true,
  verbose: true,
});
