// Global setup — runs once before any test file starts. Applies the
// full migration pipeline against the test Postgres so individual
// integration + fitness suites can read env and start their own
// per-suite truncation. No need for the per-suite `migrateOnce` race
// (vitest spawns one worker per file by default; without this hook,
// each worker would re-run the migrations and collide on the
// session_proof_secret upsert).
//
// CI vs local behaviour is delegated to readTestEnvOrSkip:
//   - CI (CI=true|1) + missing env → throws, fails the run loudly.
//   - Local + missing env → returns null; this hook prints a notice
//     and returns so pure-unit suites still pass without a Postgres.

import { runMigrations } from "../../server/db/migrate.js";
import { readTestEnvOrSkip } from "../../server/db/__test_helpers__/test-db.js";

export default async function globalSetup(): Promise<void> {
  const env = readTestEnvOrSkip();
  if (!env) {
    console.warn(
      "[global-db setup] Test DB env not configured — integration / fitness suites will be skipped (local only; CI hard-fails).",
    );
    return;
  }
  await runMigrations({
    migrateUrl: env.migrateUrl,
    appPassword: env.appPassword,
    authPassword: env.authPassword,
    migratePassword: env.migratePassword,
    sessionProofSecret: env.sessionProofSecret,
  });
}
