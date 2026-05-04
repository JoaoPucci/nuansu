// Global setup — runs once before any test file starts. Applies the
// full migration pipeline against the test Postgres so individual
// integration + fitness suites can read env and start their own
// per-suite truncation. No need for the per-suite `migrateOnce` race
// (vitest spawns one worker per file by default; without this hook,
// each worker would re-run the migrations and collide on the
// session_proof_secret upsert).

import { runMigrations } from "../../server/db/migrate.js";
import { readTestEnv } from "../../server/db/__test_helpers__/test-db.js";

export default async function globalSetup(): Promise<void> {
  // If the test DB env isn't configured, skip silently — pure-unit
  // tests still pass without a Postgres.
  try {
    const env = readTestEnv();
    await runMigrations({
      migrateUrl: env.migrateUrl,
      appPassword: env.appPassword,
      authPassword: env.authPassword,
      migratePassword: env.migratePassword,
      sessionProofSecret: env.sessionProofSecret,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Test DB env missing")) {
      console.warn(
        "[global-db setup] Test DB env not configured — integration tests will be skipped.",
      );
      return;
    }
    throw err;
  }
}
