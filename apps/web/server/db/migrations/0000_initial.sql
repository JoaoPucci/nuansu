CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"category" text NOT NULL,
	"before_text" text,
	"after_text" text,
	"rationale" text NOT NULL,
	"accepted" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_enc" "bytea",
	"access_token_enc_nonce" "bytea",
	"refresh_token_enc" "bytea",
	"refresh_token_enc_nonce" "bytea",
	"id_token_enc" "bytea",
	"id_token_enc_nonce" "bytea",
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_accounts_access_token_null" CHECK ("auth_accounts"."access_token" IS NULL),
	CONSTRAINT "auth_accounts_refresh_token_null" CHECK ("auth_accounts"."refresh_token" IS NULL),
	CONSTRAINT "auth_accounts_id_token_null" CHECK ("auth_accounts"."id_token" IS NULL),
	CONSTRAINT "auth_accounts_access_token_enc_pair" CHECK (("auth_accounts"."access_token_enc" IS NULL) = ("auth_accounts"."access_token_enc_nonce" IS NULL)),
	CONSTRAINT "auth_accounts_refresh_token_enc_pair" CHECK (("auth_accounts"."refresh_token_enc" IS NULL) = ("auth_accounts"."refresh_token_enc_nonce" IS NULL)),
	CONSTRAINT "auth_accounts_id_token_enc_pair" CHECK (("auth_accounts"."id_token_enc" IS NULL) = ("auth_accounts"."id_token_enc_nonce" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"avatar_color" text,
	"target_language" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"user_id" text PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"confirmation_sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"download_url" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_text" "bytea",
	"source_text_nonce" "bytea",
	"target_text" "bytea",
	"target_text_nonce" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"direction" text NOT NULL,
	"final_target_text" "bytea" NOT NULL,
	"final_target_text_nonce" "bytea" NOT NULL,
	"final_source_text" "bytea" NOT NULL,
	"final_source_text_nonce" "bytea" NOT NULL,
	"gloss" "bytea",
	"gloss_nonce" "bytea",
	"register_chosen" text,
	"register_detected" text,
	"dialect_flags" text[] DEFAULT '{}' NOT NULL,
	"prefs_snapshot" "bytea" NOT NULL,
	"prefs_snapshot_nonce" "bytea" NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "messages_direction_chk" CHECK ("messages"."direction" IN ('outbound', 'inbound'))
);
--> statement-breakpoint
CREATE TABLE "name_locks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" uuid,
	"source_form" "bytea" NOT NULL,
	"source_form_nonce" "bytea" NOT NULL,
	"target_form" "bytea",
	"target_form_nonce" "bytea",
	"notes" "bytea",
	"notes_nonce" "bytea",
	"prior_canonical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pref_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"field" text NOT NULL,
	"from_value" "bytea",
	"from_value_nonce" "bytea",
	"to_value" "bytea" NOT NULL,
	"to_value_nonce" "bytea" NOT NULL,
	"to_value_dedup_key" "bytea" NOT NULL,
	"evidence_msg_id" uuid,
	"evidence_excerpt" "bytea" NOT NULL,
	"evidence_excerpt_nonce" "bytea" NOT NULL,
	"confidence" text NOT NULL,
	"reasoning" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "pref_suggestions_confidence_chk" CHECK ("pref_suggestions"."confidence" IN ('low', 'med', 'high')),
	CONSTRAINT "pref_suggestions_category_chk" CHECK ("pref_suggestions"."category" IN ('name_reveal', 'nickname_offer', 'register_shift', 'context_update')),
	CONSTRAINT "pref_suggestions_status_chk" CHECK ("pref_suggestions"."status" IN ('pending', 'applied', 'dismissed', 'kept_both'))
);
--> statement-breakpoint
CREATE TABLE "preferences_chat" (
	"chat_id" uuid PRIMARY KEY NOT NULL,
	"target_language" text,
	"register" text,
	"naturalness" smallint,
	"my_nickname" "bytea",
	"my_nickname_nonce" "bytea",
	"contact_name_src" "bytea",
	"contact_name_src_nonce" "bytea",
	"contact_name_tgt" "bytea",
	"contact_name_tgt_nonce" "bytea",
	"notes" "bytea",
	"notes_nonce" "bytea",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences_global" (
	"user_id" text PRIMARY KEY NOT NULL,
	"default_target_lang" text DEFAULT 'ja' NOT NULL,
	"default_register" text,
	"default_naturalness" smallint DEFAULT 50 NOT NULL,
	"names_are_sacred" boolean DEFAULT true NOT NULL,
	"explain_verbosity" text DEFAULT 'standard' NOT NULL,
	"preferred_model_tier" text DEFAULT 'standard' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_global_naturalness_range" CHECK ("preferences_global"."default_naturalness" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"status" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" uuid,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"source_language" text DEFAULT 'en' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"region" text DEFAULT 'jp' NOT NULL,
	"is_dogfood" boolean DEFAULT false NOT NULL,
	"dek_wrapped" "bytea",
	"onboarding_state" jsonb DEFAULT '{"dismissed_coachmarks": []}'::jsonb NOT NULL,
	"sessions_revoked_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"email" "citext" PRIMARY KEY NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"payload_hash" "bytea" NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_points" ADD CONSTRAINT "audit_points_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_versions" ADD CONSTRAINT "message_versions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "name_locks" ADD CONSTRAINT "name_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "name_locks" ADD CONSTRAINT "name_locks_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pref_suggestions" ADD CONSTRAINT "pref_suggestions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pref_suggestions" ADD CONSTRAINT "pref_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pref_suggestions" ADD CONSTRAINT "pref_suggestions_evidence_msg_id_messages_id_fk" FOREIGN KEY ("evidence_msg_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences_chat" ADD CONSTRAINT "preferences_chat_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences_global" ADD CONSTRAINT "preferences_global_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_auth_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_account_uniq" ON "auth_accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_auth_verification_identifier" ON "auth_verification_tokens" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_chats_user" ON "chats" USING btree ("user_id") WHERE "chats"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_message_versions_message" ON "message_versions" USING btree ("message_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_chat_created" ON "messages" USING btree ("chat_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_name_locks_user_chat" ON "name_locks" USING btree ("user_id","chat_id");--> statement-breakpoint
CREATE INDEX "idx_pref_suggestions_chat_status" ON "pref_suggestions" USING btree ("chat_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_pref_suggestions_dedup" ON "pref_suggestions" USING btree ("chat_id","field","to_value_dedup_key","status") WHERE "pref_suggestions"."status" = 'dismissed';--> statement-breakpoint
CREATE INDEX "idx_usage_events_user_day" ON "usage_events" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_webhook_events_unprocessed" ON "webhook_events" USING btree ("received_at") WHERE "webhook_events"."processed_at" IS NULL;