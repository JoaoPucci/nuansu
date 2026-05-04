// Drizzle schema for the application + Better Auth tables.
//
// Source of truth: docs/back_end_architecture.md §3.1 (DDL summary).
// Derived rules — every change here MUST keep them true; the
// fitness tests in apps/web/server/__fitness__/schema-*.test.ts assert
// each one against `pg_attribute` after migrations run:
//
//   1. Every `user_id` column is `text` (matches users.id and auth_users.id).
//   2. Every encrypted user-content `bytea` column has a sibling `*_nonce bytea`.
//   3. Every user-scoped table has RLS enabled (asserted by rls-enabled.test.ts
//      after rls.sql runs).
//
// Drizzle does not ship `bytea` or `citext` column helpers; both are
// declared via `customType` below with the documented Postgres semantics
// (bytea ↔ Uint8Array, citext as a case-insensitive text alias).

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── Custom column types ──────────────────────────────────────────────

/** Postgres `bytea` ↔ Uint8Array. Used for ciphertext + nonce columns. */
const bytea = customType<{ data: Uint8Array; default: false }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Postgres `citext` (case-insensitive text). Backed by the `citext`
 * extension (created in `bootstrap.sql` via `CREATE EXTENSION`). Used
 * for email columns and the waitlist primary key.
 *
 * Note: drizzle-kit treats unknown column types as opaque strings in
 * generated migrations, which is what we want — the migration uses the
 * literal `citext` keyword.
 */
const citext = customType<{ data: string; default: false }>({
  dataType() {
    return "citext";
  },
});

// ── Better Auth tables ───────────────────────────────────────────────
// Library contract: text IDs (UUID-shaped); the OAuth-token columns are
// kept as text (library writes plaintext) and cleared to NULL by the
// `databaseHooks.account.create.before` hook BEFORE the row commits.
// The paired `*_enc` + `*_enc_nonce` bytea columns hold the actual
// ciphertext. CHECK constraints below enforce the invariant.
//
// auth_users — Better Auth's primary user record.

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  email: citext("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    // Library-managed plaintext columns. The `before` hook (server/auth/
    // encrypt-oauth-tokens.ts — wired in 2E.2) intercepts Better Auth's
    // write and moves the plaintext into the paired `_enc` columns BEFORE
    // the row is committed. The CHECK constraints below fail any write
    // that bypasses the hook.
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenEnc: bytea("access_token_enc"),
    accessTokenEncNonce: bytea("access_token_enc_nonce"),
    refreshTokenEnc: bytea("refresh_token_enc"),
    refreshTokenEncNonce: bytea("refresh_token_enc_nonce"),
    idTokenEnc: bytea("id_token_enc"),
    idTokenEncNonce: bytea("id_token_enc_nonce"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_accounts_provider_account_uniq").on(t.providerId, t.accountId),
    // Invariant 1: plaintext OAuth-token columns MUST be NULL on committed rows.
    check("auth_accounts_access_token_null", sql`${t.accessToken} IS NULL`),
    check("auth_accounts_refresh_token_null", sql`${t.refreshToken} IS NULL`),
    check("auth_accounts_id_token_null", sql`${t.idToken} IS NULL`),
    // Invariant 2: encrypted column and its nonce are paired (both populated or both NULL).
    check(
      "auth_accounts_access_token_enc_pair",
      sql`(${t.accessTokenEnc} IS NULL) = (${t.accessTokenEncNonce} IS NULL)`,
    ),
    check(
      "auth_accounts_refresh_token_enc_pair",
      sql`(${t.refreshTokenEnc} IS NULL) = (${t.refreshTokenEncNonce} IS NULL)`,
    ),
    check(
      "auth_accounts_id_token_enc_pair",
      sql`(${t.idTokenEnc} IS NULL) = (${t.idTokenEncNonce} IS NULL)`,
    ),
  ],
);

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    // Stored content: sha256(rawToken).hex() — 64 lowercase hex chars.
    // Custom magic-link flow at server/auth/magic-link.ts (wired in 2E.2)
    // hashes on insert and on verify; raw tokens never sit in the DB.
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_auth_verification_identifier").on(t.identifier)],
);

// ── Application users — extends auth_users 1:1 ───────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  sourceLanguage: text("source_language").notNull().default("en"),
  locale: text("locale").notNull().default("en"),
  region: text("region").notNull().default("jp"),
  isDogfood: boolean("is_dogfood").notNull().default(false),
  // KMS-wrapped per-user data encryption key. Crypto-erasure timeline:
  // destroying this row makes the user's encrypted fields unreadable
  // immediately and from backups within the retention window (≤35 days).
  dekWrapped: bytea("dek_wrapped"),
  onboardingState: jsonb("onboarding_state")
    .notNull()
    .default(sql`'{"dismissed_coachmarks": []}'::jsonb`),
  // Durable revocation watermark for "logout from all devices". Sessions
  // whose `iat <= sessions_revoked_after` are invalid. Postgres is the
  // source of truth; Redis carries a derived cache. See security.md §3.4.
  sessionsRevokedAfter: timestamp("sessions_revoked_after", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const preferencesGlobal = pgTable(
  "preferences_global",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    defaultTargetLang: text("default_target_lang").notNull().default("ja"),
    defaultRegister: text("default_register"),
    defaultNaturalness: smallint("default_naturalness").notNull().default(50),
    namesAreSacred: boolean("names_are_sacred").notNull().default(true),
    explainVerbosity: text("explain_verbosity").notNull().default("standard"),
    preferredModelTier: text("preferred_model_tier").notNull().default("standard"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("preferences_global_naturalness_range", sql`${t.defaultNaturalness} BETWEEN 0 AND 100`),
  ],
);

export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    avatarColor: text("avatar_color"),
    targetLanguage: text("target_language").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chats_user")
      .on(t.userId)
      .where(sql`${t.archivedAt} IS NULL`),
  ],
);

export const nameLocks = pgTable(
  "name_locks",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: uuid("chat_id").references(() => chats.id, { onDelete: "cascade" }),
    sourceForm: bytea("source_form").notNull(),
    sourceFormNonce: bytea("source_form_nonce").notNull(),
    targetForm: bytea("target_form"),
    targetFormNonce: bytea("target_form_nonce"),
    notes: bytea("notes"),
    notesNonce: bytea("notes_nonce"),
    priorCanonical: boolean("prior_canonical").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_name_locks_user_chat").on(t.userId, t.chatId)],
);

export const preferencesChat = pgTable("preferences_chat", {
  chatId: uuid("chat_id")
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  targetLanguage: text("target_language"),
  register: text("register"),
  naturalness: smallint("naturalness"),
  myNickname: bytea("my_nickname"),
  myNicknameNonce: bytea("my_nickname_nonce"),
  contactNameSrc: bytea("contact_name_src"),
  contactNameSrcNonce: bytea("contact_name_src_nonce"),
  contactNameTgt: bytea("contact_name_tgt"),
  contactNameTgtNonce: bytea("contact_name_tgt_nonce"),
  notes: bytea("notes"),
  notesNonce: bytea("notes_nonce"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    finalTargetText: bytea("final_target_text").notNull(),
    finalTargetTextNonce: bytea("final_target_text_nonce").notNull(),
    finalSourceText: bytea("final_source_text").notNull(),
    finalSourceTextNonce: bytea("final_source_text_nonce").notNull(),
    gloss: bytea("gloss"),
    glossNonce: bytea("gloss_nonce"),
    registerChosen: text("register_chosen"),
    registerDetected: text("register_detected"),
    dialectFlags: text("dialect_flags")
      .array()
      .notNull()
      .default(sql`'{}'`),
    prefsSnapshot: bytea("prefs_snapshot").notNull(),
    prefsSnapshotNonce: bytea("prefs_snapshot_nonce").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_messages_chat_created").on(t.chatId, t.createdAt.desc()),
    check("messages_direction_chk", sql`${t.direction} IN ('outbound', 'inbound')`),
  ],
);

export const messageVersions = pgTable(
  "message_versions",
  {
    id: uuid("id").primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sourceText: bytea("source_text"),
    sourceTextNonce: bytea("source_text_nonce"),
    targetText: bytea("target_text"),
    targetTextNonce: bytea("target_text_nonce"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_message_versions_message").on(t.messageId, t.createdAt)],
);

export const auditPoints = pgTable("audit_points", {
  id: uuid("id").primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  beforeText: text("before_text"),
  afterText: text("after_text"),
  rationale: text("rationale").notNull(),
  accepted: boolean("accepted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// pref_suggestions — drift-detection surface. See §5.4 and the dedup-key
// rationale in §3.1's "Deterministic dedup keys" note. The dedup key is
// HMAC-SHA256(per_user_dedup_key, normalize(plaintext)) truncated to 16
// bytes, computed app-side at insert time.
export const prefSuggestions = pgTable(
  "pref_suggestions",
  {
    id: uuid("id").primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    fromValue: bytea("from_value"),
    fromValueNonce: bytea("from_value_nonce"),
    toValue: bytea("to_value").notNull(),
    toValueNonce: bytea("to_value_nonce").notNull(),
    toValueDedupKey: bytea("to_value_dedup_key").notNull(),
    evidenceMsgId: uuid("evidence_msg_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    evidenceExcerpt: bytea("evidence_excerpt").notNull(),
    evidenceExcerptNonce: bytea("evidence_excerpt_nonce").notNull(),
    confidence: text("confidence").notNull(),
    reasoning: text("reasoning").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_pref_suggestions_chat_status").on(t.chatId, t.status, t.createdAt.desc()),
    index("idx_pref_suggestions_dedup")
      .on(t.chatId, t.field, t.toValueDedupKey, t.status)
      .where(sql`${t.status} = 'dismissed'`),
    check("pref_suggestions_confidence_chk", sql`${t.confidence} IN ('low', 'med', 'high')`),
    check(
      "pref_suggestions_category_chk",
      sql`${t.category} IN ('name_reveal', 'nickname_offer', 'register_shift', 'context_update')`,
    ),
    check(
      "pref_suggestions_status_chk",
      sql`${t.status} IN ('pending', 'applied', 'dismissed', 'kept_both')`,
    ),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: uuid("chat_id").references(() => chats.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    costMicroUsd: integer("cost_micro_usd").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_usage_events_user_day").on(t.userId, t.createdAt.desc())],
);

export const subscriptions = pgTable("subscriptions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull(),
  plan: text("plan").notNull().default("free"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable(
  "webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    source: text("source").notNull(),
    payloadHash: bytea("payload_hash").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [
    index("idx_webhook_events_unprocessed")
      .on(t.receivedAt)
      .where(sql`${t.processedAt} IS NULL`),
  ],
);

export const waitlist = pgTable("waitlist", {
  email: citext("email").primaryKey(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deletionRequests = pgTable("deletion_requests", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  // Cross-tick deletion-confirmation dedupe marker. Set to now() inside
  // the same transaction as the Resend send-claim; subsequent reconciler
  // ticks observe the marker and skip re-sending. See compliance.md §3.3
  // step 5(a).
  confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const exportJobs = pgTable("export_jobs", {
  id: uuid("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  downloadUrl: text("download_url"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Aggregate exports for fitness tests + migration tooling ──────────

/**
 * Every application table that is scoped to a single user. The fitness
 * tests use this list to assert RLS is enabled on every entry. New
 * user-scoped tables MUST be added here in the same commit; missing an
 * entry gets caught by the rls-enabled fitness check.
 */
export const userScopedAppTables = [
  users,
  preferencesGlobal,
  chats,
  preferencesChat,
  nameLocks,
  messages,
  messageVersions,
  auditPoints,
  prefSuggestions,
  usageEvents,
  subscriptions,
  deletionRequests,
  exportJobs,
] as const;

/**
 * auth_* tables get a different RLS posture (role-conditional, not
 * user-scoped) — see rls.sql.
 */
export const authTables = [authUsers, authSessions, authAccounts, authVerificationTokens] as const;

/**
 * Tables that are explicitly NOT user-scoped (cross-user infra). RLS
 * stays disabled here; the fitness check skips them.
 */
export const systemTables = [webhookEvents, waitlist, auditLog] as const;
