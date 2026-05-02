// Loads env via load-env.mjs, then execs the rest of argv as a child process
// with that env inherited. Used as a prefix for pnpm scripts.
//
//   node scripts/with-env.mjs -- vitest run
//   node scripts/with-env.mjs -- drizzle-kit migrate
//
// Targets Linux/macOS. Set LOAD_ENV_VERBOSE=1 to log which file the loader
// resolved.

import { spawnSync } from "node:child_process";
import { loadEnv } from "./load-env.mjs";

loadEnv({ log: process.env.LOAD_ENV_VERBOSE === "1" });

const argv = process.argv.slice(2);
const sepIdx = argv.indexOf("--");
const args = sepIdx === -1 ? argv : argv.slice(sepIdx + 1);
if (args.length === 0) {
  console.error("Usage: node scripts/with-env.mjs -- <command> [args...]");
  process.exit(2);
}
const [cmd, ...rest] = args;
const result = spawnSync(cmd, rest, { stdio: "inherit", env: process.env });
// User-initiated Ctrl+C is intentional, not a failure. Without this, pnpm
// reports ELIFECYCLE on every clean dev-server stop.
if (result.signal === "SIGINT" || result.signal === "SIGTERM") process.exit(0);
process.exit(result.status ?? 1);
