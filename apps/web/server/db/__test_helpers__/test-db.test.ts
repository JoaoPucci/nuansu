// Unit test for readTestEnvOrSkip's CI-aware skip-vs-throw split.
// The behaviour matters because in CI a missing env var would
// otherwise silently turn every integration / fitness suite into a
// no-op via describe.skipIf, hiding RLS + role-isolation regressions
// behind a green build. Local pre-commit (where vitest --changed
// runs without DB env) keeps the silent-skip path so hooks aren't
// blocked.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readTestEnvOrSkip } from "./test-db.js";

const VARS = [
  "DATABASE_URL",
  "AUTH_DATABASE_URL",
  "MIGRATE_DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "NUANSU_DB_SESSION_PROOF_SECRET",
  "CI",
] as const;

const PRESERVED: Partial<Record<(typeof VARS)[number], string>> = {};

beforeEach(() => {
  for (const v of VARS) {
    PRESERVED[v] = process.env[v];
    delete process.env[v];
  }
});

afterEach(() => {
  for (const v of VARS) {
    if (PRESERVED[v] === undefined) delete process.env[v];
    else process.env[v] = PRESERVED[v];
  }
});

describe("readTestEnvOrSkip — CI-aware behaviour", () => {
  it("returns null when env is missing and CI is unset (local skip)", () => {
    expect(readTestEnvOrSkip()).toBeNull();
  });

  it('throws when env is missing and CI="true"', () => {
    process.env.CI = "true";
    expect(() => readTestEnvOrSkip()).toThrow(/Test DB env missing in CI context/);
  });

  it('throws when env is missing and CI="1"', () => {
    process.env.CI = "1";
    expect(() => readTestEnvOrSkip()).toThrow(/Test DB env missing in CI context/);
  });

  it("returns null when env is missing and CI is some other value (treated as non-CI)", () => {
    process.env.CI = "false";
    expect(readTestEnvOrSkip()).toBeNull();
  });

  it("returns the parsed env when all required vars are set, regardless of CI", () => {
    process.env.DATABASE_URL = "postgres://nuansu_app:p1@localhost:5432/db";
    process.env.AUTH_DATABASE_URL = "postgres://nuansu_auth:p2@localhost:5432/db";
    process.env.MIGRATE_DATABASE_URL = "postgres://nuansu:p3@localhost:5432/db";
    process.env.NUANSU_DB_SESSION_PROOF_SECRET = "x".repeat(64);

    const env = readTestEnvOrSkip();
    expect(env).not.toBeNull();
    expect(env?.appPassword).toBe("p1");
    expect(env?.authPassword).toBe("p2");
    expect(env?.migratePassword).toBe("p3");

    process.env.CI = "true";
    const envCi = readTestEnvOrSkip();
    expect(envCi).not.toBeNull();
    expect(envCi?.appPassword).toBe("p1");
  });

  it("falls back to DIRECT_DATABASE_URL when MIGRATE_DATABASE_URL is unset", () => {
    process.env.DATABASE_URL = "postgres://nuansu_app:p1@localhost:5432/db";
    process.env.AUTH_DATABASE_URL = "postgres://nuansu_auth:p2@localhost:5432/db";
    process.env.DIRECT_DATABASE_URL = "postgres://nuansu:p3@localhost:5432/db";
    process.env.NUANSU_DB_SESSION_PROOF_SECRET = "x".repeat(64);

    const env = readTestEnvOrSkip();
    expect(env?.migrateUrl).toBe("postgres://nuansu:p3@localhost:5432/db");
  });
});
