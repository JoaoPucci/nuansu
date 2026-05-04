// CLI wrapper around `runMigrations`. Loads env, parses connection
// URLs to extract per-role passwords, then delegates. Invoked via
// `pnpm db:migrate`.

import { runMigrations } from "../server/db/migrate.js";

interface ParsedUrl {
  user: string;
  password: string;
}

function parseUserPassword(url: string, label: string): ParsedUrl {
  const parsed = new URL(url);
  if (!parsed.username || !parsed.password) {
    throw new Error(`${label} must include user:password — got ${parsed.host}`);
  }
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

async function main(): Promise<void> {
  const migrateUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;
  const authUrl = process.env.AUTH_DATABASE_URL;
  const sessionProofSecret = process.env.NUANSU_DB_SESSION_PROOF_SECRET;

  if (!migrateUrl) {
    throw new Error("MIGRATE_DATABASE_URL (or DIRECT_DATABASE_URL) is required");
  }
  if (!appUrl) throw new Error("DATABASE_URL is required");
  if (!authUrl) throw new Error("AUTH_DATABASE_URL is required");
  if (!sessionProofSecret || sessionProofSecret.length < 32) {
    throw new Error("NUANSU_DB_SESSION_PROOF_SECRET must be set and ≥ 32 chars");
  }

  const app = parseUserPassword(appUrl, "DATABASE_URL");
  const auth = parseUserPassword(authUrl, "AUTH_DATABASE_URL");
  const migrate = parseUserPassword(migrateUrl, "MIGRATE_DATABASE_URL");

  if (app.user !== "nuansu_app") {
    throw new Error(`DATABASE_URL must connect as nuansu_app, not ${app.user}`);
  }
  if (auth.user !== "nuansu_auth") {
    throw new Error(`AUTH_DATABASE_URL must connect as nuansu_auth, not ${auth.user}`);
  }

  await runMigrations({
    migrateUrl,
    appPassword: app.password,
    authPassword: auth.password,
    // The migrate role's own password — in dev/CI this is the
    // superuser's existing password, which we keep stable. The CREATE
    // ROLE on first run installs nuansu_migrate with this same password
    // so a follow-up rotation can flip the migrate URL to use it.
    migratePassword: migrate.password,
    sessionProofSecret,
  });
  console.log("Migrations applied: bootstrap + drizzle + rls + secret persisted.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
