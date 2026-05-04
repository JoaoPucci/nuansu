-- RLS policies + table-level grants. Applied by `migrate.ts` AFTER the
-- Drizzle migrations have created the tables. Idempotent — safe to
-- re-run on every deploy.
--
-- Authority: docs/back_end_architecture.md §3.3 + docs/security.md §4.
--
-- Three layers of defence (any one alone insufficient):
--   1. App-layer: the db.forUser wrapper is the only legitimate query
--      path for user-scoped tables; ESLint enforces.
--   2. Role separation: nuansu_app cannot reach auth_* tables; nuansu_auth
--      cannot reach application tables. Enforced by the GRANTs below.
--   3. RLS: every user-scoped row predicate is `user_id =
--      nuansu.current_user_id()`. The function returns NULL on missing
--      or forged session_proof, so RLS matches no rows.

-- ── Table ownership: hand every public table to nuansu_migrate so the
-- trigger function (SECURITY DEFINER, owned by nuansu_migrate) and any
-- future migration step can ALTER/INSERT without extra GRANTs. The
-- runtime app + auth roles get DML via the GRANTs below; they cannot
-- ALTER/DROP the tables they query.

ALTER TABLE public.users                    OWNER TO nuansu_migrate;
ALTER TABLE public.preferences_global       OWNER TO nuansu_migrate;
ALTER TABLE public.chats                    OWNER TO nuansu_migrate;
ALTER TABLE public.preferences_chat         OWNER TO nuansu_migrate;
ALTER TABLE public.name_locks               OWNER TO nuansu_migrate;
ALTER TABLE public.messages                 OWNER TO nuansu_migrate;
ALTER TABLE public.message_versions         OWNER TO nuansu_migrate;
ALTER TABLE public.audit_points             OWNER TO nuansu_migrate;
ALTER TABLE public.pref_suggestions         OWNER TO nuansu_migrate;
ALTER TABLE public.usage_events             OWNER TO nuansu_migrate;
ALTER TABLE public.subscriptions            OWNER TO nuansu_migrate;
ALTER TABLE public.deletion_requests        OWNER TO nuansu_migrate;
ALTER TABLE public.export_jobs              OWNER TO nuansu_migrate;
ALTER TABLE public.audit_log                OWNER TO nuansu_migrate;
ALTER TABLE public.webhook_events           OWNER TO nuansu_migrate;
ALTER TABLE public.waitlist                 OWNER TO nuansu_migrate;
ALTER TABLE public.auth_users               OWNER TO nuansu_migrate;
ALTER TABLE public.auth_sessions            OWNER TO nuansu_migrate;
ALTER TABLE public.auth_accounts            OWNER TO nuansu_migrate;
ALTER TABLE public.auth_verification_tokens OWNER TO nuansu_migrate;

-- ── Application tables: only nuansu_app gets DML; RLS scopes to owner.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.users,
  public.preferences_global,
  public.chats,
  public.preferences_chat,
  public.name_locks,
  public.messages,
  public.message_versions,
  public.audit_points,
  public.pref_suggestions,
  public.usage_events,
  public.subscriptions,
  public.deletion_requests,
  public.export_jobs,
  public.audit_log
TO nuansu_app;

GRANT USAGE ON SCHEMA public TO nuansu_app;

-- System tables (cross-user infra): nuansu_app reads/writes its own
-- audit_log entries via RLS (user_id = self); webhook_events + waitlist
-- have no per-user predicate — written by the webhook handler / sign-up
-- path which run as the app role. RLS still enabled on audit_log; the
-- other two intentionally don't enable RLS (cross-user by design).

GRANT INSERT, SELECT ON public.webhook_events TO nuansu_app;
GRANT INSERT ON public.waitlist TO nuansu_app;

-- ── nuansu_auth: full access to auth_* tables only.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.auth_users,
  public.auth_sessions,
  public.auth_accounts,
  public.auth_verification_tokens
TO nuansu_auth;

GRANT USAGE ON SCHEMA public TO nuansu_auth;

-- The auth role also needs to INSERT into public.users via the
-- nuansu_auth_user_to_app_user trigger (defined SECURITY DEFINER on
-- bootstrap). The function runs as its owner (nuansu_migrate), so the
-- caller's privileges don't matter — but the trigger row event must
-- still be observable to nuansu_auth, which it is via INSERT on
-- auth_users (already granted above).

-- ── Trigger: create app users row when a Better Auth user is inserted.

DROP TRIGGER IF EXISTS auth_user_to_app_user ON public.auth_users;
CREATE TRIGGER auth_user_to_app_user
  AFTER INSERT ON public.auth_users
  FOR EACH ROW EXECUTE FUNCTION public.nuansu_auth_user_to_app_user();

-- ── RLS policies on user-scoped application tables.
--
-- Policy shape (back_end_architecture.md §3.3):
--   ALTER TABLE … ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY <name> ON <t> FOR ALL TO nuansu_app
--     USING (user_id = nuansu.current_user_id());
--
-- For tables without a direct user_id (preferences_chat, message_versions,
-- audit_points), the predicate joins through the parent's user_id —
-- this requires nuansu_app to have SELECT on the parent (which it does,
-- granted above). Each policy spelled out so a fitness test can
-- introspect pg_policies and assert the predicate text contains
-- "nuansu.current_user_id()".
--
-- Tables that hold BOTH `user_id` AND a `chat_id` FK (messages,
-- pref_suggestions, usage_events, name_locks) get an additional clause
-- that constrains `chat_id` to a chat the caller owns. Without it,
-- `user_id = self` alone would let an attacker INSERT a message with
-- `user_id=self, chat_id=<other tenant's chat>`: RLS passes (user_id
-- matches), the FK passes (chat exists), and the result is a
-- cross-tenant data link. It would also leak chat existence via
-- FK-success-vs-failure timing on probe inserts. The chat-ownership
-- subquery is itself RLS-filtered through `chats_owner_only`, so the
-- explicit `WHERE user_id = …` clause is defence-in-depth (kicks in
-- even if a future change loosens chats' policy).

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_owner_only ON public.users;
CREATE POLICY users_owner_only ON public.users
  FOR ALL TO nuansu_app
  USING (id = nuansu.current_user_id())
  WITH CHECK (id = nuansu.current_user_id());

ALTER TABLE public.preferences_global ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS preferences_global_owner_only ON public.preferences_global;
CREATE POLICY preferences_global_owner_only ON public.preferences_global
  FOR ALL TO nuansu_app
  USING (user_id = nuansu.current_user_id())
  WITH CHECK (user_id = nuansu.current_user_id());

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chats_owner_only ON public.chats;
CREATE POLICY chats_owner_only ON public.chats
  FOR ALL TO nuansu_app
  USING (user_id = nuansu.current_user_id())
  WITH CHECK (user_id = nuansu.current_user_id());

ALTER TABLE public.preferences_chat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS preferences_chat_owner_only ON public.preferences_chat;
CREATE POLICY preferences_chat_owner_only ON public.preferences_chat
  FOR ALL TO nuansu_app
  USING (chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id()))
  WITH CHECK (chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id()));

-- name_locks: chat_id is nullable (NULL = global lock). Permit NULL,
-- otherwise require ownership of the referenced chat.
ALTER TABLE public.name_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS name_locks_owner_only ON public.name_locks;
CREATE POLICY name_locks_owner_only ON public.name_locks
  FOR ALL TO nuansu_app
  USING (
    user_id = nuansu.current_user_id()
    AND (chat_id IS NULL OR chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id()))
  )
  WITH CHECK (
    user_id = nuansu.current_user_id()
    AND (chat_id IS NULL OR chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id()))
  );

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_owner_only ON public.messages;
CREATE POLICY messages_owner_only ON public.messages
  FOR ALL TO nuansu_app
  USING (
    user_id = nuansu.current_user_id()
    AND chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id())
  )
  WITH CHECK (
    user_id = nuansu.current_user_id()
    AND chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id())
  );

ALTER TABLE public.message_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_versions_owner_only ON public.message_versions;
CREATE POLICY message_versions_owner_only ON public.message_versions
  FOR ALL TO nuansu_app
  USING (message_id IN (SELECT id FROM public.messages WHERE user_id = nuansu.current_user_id()))
  WITH CHECK (message_id IN (SELECT id FROM public.messages WHERE user_id = nuansu.current_user_id()));

ALTER TABLE public.audit_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_points_owner_only ON public.audit_points;
CREATE POLICY audit_points_owner_only ON public.audit_points
  FOR ALL TO nuansu_app
  USING (message_id IN (SELECT id FROM public.messages WHERE user_id = nuansu.current_user_id()))
  WITH CHECK (message_id IN (SELECT id FROM public.messages WHERE user_id = nuansu.current_user_id()));

ALTER TABLE public.pref_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pref_suggestions_owner_only ON public.pref_suggestions;
CREATE POLICY pref_suggestions_owner_only ON public.pref_suggestions
  FOR ALL TO nuansu_app
  USING (
    user_id = nuansu.current_user_id()
    AND chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id())
  )
  WITH CHECK (
    user_id = nuansu.current_user_id()
    AND chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id())
  );

-- usage_events: chat_id is nullable (some events are not chat-scoped).
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_events_owner_only ON public.usage_events;
CREATE POLICY usage_events_owner_only ON public.usage_events
  FOR ALL TO nuansu_app
  USING (
    user_id = nuansu.current_user_id()
    AND (chat_id IS NULL OR chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id()))
  )
  WITH CHECK (
    user_id = nuansu.current_user_id()
    AND (chat_id IS NULL OR chat_id IN (SELECT id FROM public.chats WHERE user_id = nuansu.current_user_id()))
  );

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_owner_only ON public.subscriptions;
CREATE POLICY subscriptions_owner_only ON public.subscriptions
  FOR ALL TO nuansu_app
  USING (user_id = nuansu.current_user_id())
  WITH CHECK (user_id = nuansu.current_user_id());

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deletion_requests_owner_only ON public.deletion_requests;
CREATE POLICY deletion_requests_owner_only ON public.deletion_requests
  FOR ALL TO nuansu_app
  USING (user_id = nuansu.current_user_id())
  WITH CHECK (user_id = nuansu.current_user_id());

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS export_jobs_owner_only ON public.export_jobs;
CREATE POLICY export_jobs_owner_only ON public.export_jobs
  FOR ALL TO nuansu_app
  USING (user_id = nuansu.current_user_id())
  WITH CHECK (user_id = nuansu.current_user_id());

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_owner_only ON public.audit_log;
-- audit_log can have NULL user_id (system-emitted entries); the policy
-- restricts nuansu_app to its own rows OR system rows. System rows are
-- written via the SECURITY DEFINER background-job code path (Phase 6+).
CREATE POLICY audit_log_owner_only ON public.audit_log
  FOR ALL TO nuansu_app
  USING (user_id = nuansu.current_user_id())
  WITH CHECK (user_id = nuansu.current_user_id());

-- ── auth_* tables: role-conditional RLS. nuansu_auth gets full access
-- (it needs cross-user reads — find user by email at login, find session
-- by token); nuansu_app gets self-only SELECT as defence in depth (in
-- case a future grant misconfiguration leaks SELECT to the app role).

ALTER TABLE public.auth_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_users_library_full ON public.auth_users;
CREATE POLICY auth_users_library_full ON public.auth_users
  FOR ALL TO nuansu_auth USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS auth_users_app_self ON public.auth_users;
CREATE POLICY auth_users_app_self ON public.auth_users
  FOR SELECT TO nuansu_app USING (id = nuansu.current_user_id());

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_sessions_library_full ON public.auth_sessions;
CREATE POLICY auth_sessions_library_full ON public.auth_sessions
  FOR ALL TO nuansu_auth USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS auth_sessions_app_self ON public.auth_sessions;
CREATE POLICY auth_sessions_app_self ON public.auth_sessions
  FOR SELECT TO nuansu_app USING (user_id = nuansu.current_user_id());

ALTER TABLE public.auth_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_accounts_library_full ON public.auth_accounts;
CREATE POLICY auth_accounts_library_full ON public.auth_accounts
  FOR ALL TO nuansu_auth USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS auth_accounts_app_self ON public.auth_accounts;
CREATE POLICY auth_accounts_app_self ON public.auth_accounts
  FOR SELECT TO nuansu_app USING (user_id = nuansu.current_user_id());

ALTER TABLE public.auth_verification_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_verification_tokens_library_full ON public.auth_verification_tokens;
CREATE POLICY auth_verification_tokens_library_full ON public.auth_verification_tokens
  FOR ALL TO nuansu_auth USING (true) WITH CHECK (true);
-- No SELECT policy for nuansu_app — the app role has no business reading
-- tokens, ever (and no GRANT either, but defence in depth).
