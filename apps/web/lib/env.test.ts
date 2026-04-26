import { describe, it, expect } from "vitest";
import { parseServerEnv, parseClientEnv } from "./env";

describe("parseServerEnv", () => {
  const validBase = {
    NODE_ENV: "development",
    APP_URL: "http://localhost:5173",
    APP_ENV: "local",
    DATABASE_URL: "postgres://nuansu:nuansu_dev@localhost:5432/nuansu",
    DIRECT_DATABASE_URL: "postgres://nuansu:nuansu_dev@localhost:5432/nuansu",
    UPSTASH_REDIS_REST_URL: "http://localhost:6379",
    UPSTASH_REDIS_REST_TOKEN: "local_dev_token",
    BETTER_AUTH_SECRET: "x".repeat(64),
    BETTER_AUTH_URL: "http://localhost:5173",
    LLM_PROVIDER: "stub",
    STRIPE_PROVIDER: "stub",
    EMAIL_PROVIDER: "mailcrab",
    KMS_PROVIDER: "stub",
    KMS_LOCAL_SEED: "local-dev-only",
    DEFAULT_LOCALE: "en",
    LOG_LEVEL: "info",
    DAILY_FREE_QUOTA: "10",
    MAX_DAILY_USER_USD: "2.00",
    TRIAL_DAYS: "14",
    LLM_KILL_SWITCH: "false",
    LLM_FREE_TIER_DOWNGRADE: "false",
  };

  it("accepts a valid env shape", () => {
    expect(() => parseServerEnv(validBase)).not.toThrow();
  });

  it("coerces numeric strings", () => {
    const env = parseServerEnv(validBase);
    expect(env.DAILY_FREE_QUOTA).toBe(10);
    expect(env.TRIAL_DAYS).toBe(14);
    expect(typeof env.MAX_DAILY_USER_USD).toBe("number");
  });

  it("coerces boolean strings", () => {
    const env = parseServerEnv(validBase);
    expect(env.LLM_KILL_SWITCH).toBe(false);
    expect(env.LLM_FREE_TIER_DOWNGRADE).toBe(false);
  });

  it("rejects a too-short BETTER_AUTH_SECRET", () => {
    expect(() => parseServerEnv({ ...validBase, BETTER_AUTH_SECRET: "tooshort" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _, ...withoutUrl } = validBase;
    expect(() => parseServerEnv(withoutUrl)).toThrow(/DATABASE_URL/);
  });

  it("rejects an invalid LLM_PROVIDER", () => {
    expect(() => parseServerEnv({ ...validBase, LLM_PROVIDER: "openai" })).toThrow();
  });

  it("rejects an invalid APP_URL", () => {
    expect(() => parseServerEnv({ ...validBase, APP_URL: "not-a-url" })).toThrow();
  });

  it("auto-falls-back LLM_PROVIDER to stub when ANTHROPIC_API_KEY is missing in 'auto' mode", () => {
    const env = parseServerEnv({
      ...validBase,
      LLM_PROVIDER: "auto",
      ANTHROPIC_API_KEY: undefined,
    });
    expect(env.LLM_PROVIDER).toBe("stub");
  });

  it("uses anthropic when LLM_PROVIDER=auto and ANTHROPIC_API_KEY is set", () => {
    const env = parseServerEnv({
      ...validBase,
      LLM_PROVIDER: "auto",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
    });
    expect(env.LLM_PROVIDER).toBe("anthropic");
  });
});

describe("parseClientEnv", () => {
  it("accepts a minimal valid client env", () => {
    expect(() => parseClientEnv({ VITE_PUBLIC_APP_URL: "http://localhost:5173" })).not.toThrow();
  });

  it("rejects an invalid VITE_PUBLIC_APP_URL", () => {
    expect(() => parseClientEnv({ VITE_PUBLIC_APP_URL: "not-a-url" })).toThrow();
  });
});
