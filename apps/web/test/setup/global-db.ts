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
//
// Skipped entirely for benchmark runs (`vitest bench`) — benchmarks
// are pure-CPU and don't touch Postgres, so requiring DB env in the
// bench CI job would just force a Postgres service container that's
// never used. The throw guarantee still applies to the `test` job
// where integration + fitness suites actually run.

import { runMigrations } from "../../server/db/migrate.js";
import { readTestEnvOrSkip } from "../../server/db/__test_helpers__/test-db.js";

function isBenchmarkRun(): boolean {
  // vitest CLI surfaces the mode as the first non-flag arg:
  //   `node …/vitest bench --run`  → argv[2] === "bench"
  //   `node …/vitest run`          → argv[2] === "run"
  // Defensive scan instead of fixed index in case argv ordering
  // changes (e.g., a node loader inserts args ahead of the script).
  return process.argv.some((arg) => arg === "bench" || arg === "benchmark");
}

export default async function globalSetup(): Promise<void> {
  if (isBenchmarkRun()) return;

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
