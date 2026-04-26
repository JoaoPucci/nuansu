import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────────
// Server env. Parsed at boot in `server/app.ts`. Missing or malformed = fail
// fast. Never imported by client code (enforced by ESLint `no-restricted-paths`).
// ──────────────────────────────────────────────────────────────────────────────

const boolish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

const numeric = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? v : Number(v)))
  .pipe(z.number().finite());

const ServerEnvBase = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url(),
  APP_ENV: z.enum(["local", "preview", "production"]).default("local"),
  DEFAULT_LOCALE: z.enum(["en", "ja"]).default("en"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // DB
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),

  // Redis
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Auth
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be ≥ 32 chars (use openssl rand -hex 32)"),
  BETTER_AUTH_URL: z.string().url(),

  // OAuth (optional in dev)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
  LINE_LOGIN_CHANNEL_ID: z.string().optional(),
  LINE_LOGIN_CHANNEL_SECRET: z.string().optional(),

  // LLM
  LLM_PROVIDER: z.enum(["auto", "anthropic", "stub"]).default("auto"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_PRIMARY: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_MODEL_BUDGET: z.string().default("claude-haiku-4-5"),

  // Stripe
  STRIPE_PROVIDER: z.enum(["stub", "stripe"]).default("stub"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),

  // Email
  EMAIL_PROVIDER: z.enum(["stub", "mailcrab", "resend"]).default("mailcrab"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_ADDRESS: z.string().default("Nuansu <hello@nuansu.app>"),
  RESEND_FROM_ADDRESS_JP: z.string().default("Nuansu <hello-jp@nuansu.app>"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: numeric.default(1025),

  // Object storage
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("local"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default("nuansu-avatars"),
  S3_FORCE_PATH_STYLE: boolish.default(true),

  // KMS
  KMS_PROVIDER: z.enum(["stub", "aws"]).default("stub"),
  KMS_LOCAL_SEED: z.string().min(8).default("local-dev-only-do-not-use-in-prod"),
  KMS_KEY_ID: z.string().optional(),
  AWS_REGION: z.string().default("ap-northeast-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // Captcha (optional)
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // Observability (optional)
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default("https://eu.posthog.com"),

  // Feature flags / safety
  LLM_KILL_SWITCH: boolish.default(false),
  LLM_FREE_TIER_DOWNGRADE: boolish.default(false),
  DAILY_FREE_QUOTA: numeric.default(10),
  MAX_DAILY_USER_USD: numeric.default(2.0),
  TRIAL_DAYS: numeric.default(14),
});

export type ServerEnv = z.infer<typeof ServerEnvBase>;

// "auto" → "anthropic" if the API key is present, else "stub". Resolved here
// so downstream code reads a concrete provider name.
function resolveLlmProvider(env: ServerEnv): ServerEnv {
  if (env.LLM_PROVIDER !== "auto") return env;
  return { ...env, LLM_PROVIDER: env.ANTHROPIC_API_KEY ? "anthropic" : "stub" };
}

export function parseServerEnv(raw: unknown): ServerEnv {
  const parsed = ServerEnvBase.parse(raw);
  return resolveLlmProvider(parsed);
}

// ──────────────────────────────────────────────────────────────────────────────
// Client env. Only VITE_PUBLIC_* values reach the browser bundle (Vite enforces
// via envPrefix). Keep this surface small.
// ──────────────────────────────────────────────────────────────────────────────

const ClientEnvBase = z.object({
  VITE_PUBLIC_APP_URL: z.string().url(),
  VITE_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  VITE_PUBLIC_POSTHOG_KEY: z.string().optional(),
  VITE_PUBLIC_SENTRY_DSN: z.string().url().optional().or(z.literal("")),
});

export type ClientEnv = z.infer<typeof ClientEnvBase>;

export function parseClientEnv(raw: unknown): ClientEnv {
  return ClientEnvBase.parse(raw);
}
