-- Bootstrap: schema, extensions, RLS plumbing, trigger function.
--
-- Idempotent. Applied by `migrate.ts` BEFORE Drizzle migrations. Roles
-- (nuansu_app, nuansu_auth, nuansu_migrate) are managed in code rather
-- than here so passwords stay out of the static SQL — see
-- `apps/web/server/db/migrate.ts` `ensureRoles()`.
--
-- Authority: docs/back_end_architecture.md §3.1 (trigger function),
-- §3.3 (three-role tenancy + nuansu.current_user_id RLS function),
-- docs/security.md §13.2 (SECURITY DEFINER hardening: pinned
-- search_path + schema-qualified built-ins).

-- pgcrypto for hmac(), citext for case-insensitive email columns.
--
-- Both are installed without `WITH SCHEMA` — `CREATE EXTENSION IF NOT
-- EXISTS … WITH SCHEMA …` does NOT relocate an extension that is
-- already installed elsewhere, and managed Postgres environments
-- (Supabase, RDS) routinely pre-install pgcrypto in `extensions` or
-- `public`. The DO block below discovers wherever pgcrypto landed and
-- bakes that schema into `nuansu.verify_hmac`'s SET search_path; the
-- migration runner does the same lookup for citext before invoking
-- Drizzle's migrator (see migrate.ts).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS nuansu AUTHORIZATION nuansu_migrate;

-- Grant USAGE so app + auth roles can resolve nuansu.* references in RLS
-- policies. They cannot SELECT from nuansu.config (no privileges granted
-- on that table) — only nuansu_migrate can read the HMAC secret.
GRANT USAGE ON SCHEMA nuansu TO nuansu_app, nuansu_auth;

-- nuansu_migrate needs USAGE + CREATE on the public schema so future
-- migrations (run by nuansu_migrate rather than the platform superuser)
-- can add tables / functions / sequences. On Postgres 15+ the default
-- `CREATE on public` for PUBLIC was removed; without this explicit
-- grant, switching MIGRATE_DATABASE_URL to nuansu_migrate would fail
-- on the next schema-adding migration with `permission denied for
-- schema public`.
--
-- Detection-then-mutate: the GRANT itself requires ownership of the
-- public schema, which a re-running nuansu_migrate doesn't have on
-- managed Postgres. Skip when both privileges are already in place
-- (typical post-first-bootstrap state).
DO $bootstrap_public_grant$
BEGIN
  IF NOT (pg_catalog.has_schema_privilege('nuansu_migrate', 'public', 'USAGE')
          AND pg_catalog.has_schema_privilege('nuansu_migrate', 'public', 'CREATE')) THEN
    GRANT USAGE, CREATE ON SCHEMA public TO nuansu_migrate;
  END IF;
END;
$bootstrap_public_grant$;

-- nuansu.config: server-side store for the HMAC secret used by
-- nuansu.verify_hmac(). Owned by nuansu_migrate; no other role has any
-- privilege on it. The secret is INSERTed by the migrate runner from
-- env (NUANSU_DB_SESSION_PROOF_SECRET) on every bootstrap run; rotation
-- is documented in docs/security.md §11.
CREATE TABLE IF NOT EXISTS nuansu.config (
  key        text PRIMARY KEY,
  value      bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE nuansu.config OWNER TO nuansu_migrate;
REVOKE ALL ON TABLE nuansu.config FROM PUBLIC;

-- ── nuansu.verify_hmac(claimed_user_id, claimed_hmac_hex) → boolean ──
-- Recomputes hmac_sha256(secret, claimed_user_id) and compares to the
-- claimed HMAC. SECURITY DEFINER + pinned search_path + schema-qualified
-- built-ins per docs/security.md §13.2.
--
-- Returns false when the secret is missing (during the very first
-- bootstrap, before the migrate runner inserts it) so the system
-- fails closed instead of allowing every proof.
--
-- The function is created via a DO block so the discovered pgcrypto
-- schema can be baked into the function's SET search_path. `hmac()`
-- inside the body is unqualified and resolves via that search_path —
-- so it works whether pgcrypto landed in `public`, `extensions`,
-- `pgcrypto`, or anywhere else the platform installed it.
DO $bootstrap_verify_hmac$
DECLARE
  pgcrypto_schema text;
BEGIN
  SELECT n.nspname INTO pgcrypto_schema
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto';

  IF pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'pgcrypto extension is not installed';
  END IF;

  -- nuansu_migrate runs the verify_hmac body (SECURITY DEFINER) and
  -- needs USAGE on the extension's schema to resolve hmac(). The app
  -- and auth roles do NOT need it — they only call nuansu.verify_hmac
  -- via nuansu.current_user_id() which is also SECURITY DEFINER.
  --
  -- Detection-then-mutate: re-issuing GRANT USAGE requires ownership of
  -- pgcrypto's schema, which a re-running nuansu_migrate doesn't hold
  -- on managed Postgres (where `extensions` is platform-owned). Skip
  -- when the privilege is already present from first-bootstrap.
  IF NOT pg_catalog.has_schema_privilege('nuansu_migrate', pgcrypto_schema, 'USAGE') THEN
    EXECUTE pg_catalog.format('GRANT USAGE ON SCHEMA %I TO nuansu_migrate', pgcrypto_schema);
  END IF;

  EXECUTE pg_catalog.format(
    $verify$
      CREATE OR REPLACE FUNCTION nuansu.verify_hmac(
        claimed_user_id  text,
        claimed_hmac_hex text
      )
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      STABLE
      SET search_path = nuansu, %I, pg_catalog, pg_temp
      AS $body$
      DECLARE
        secret        bytea;
        expected_hmac bytea;
        claimed_hmac  bytea;
      BEGIN
        IF claimed_user_id IS NULL OR claimed_hmac_hex IS NULL THEN
          RETURN false;
        END IF;

        SELECT value INTO secret FROM nuansu.config WHERE key = 'session_proof_secret';
        IF secret IS NULL THEN
          RETURN false;
        END IF;

        -- hmac() resolves via search_path (set on this function above)
        -- to the discovered pgcrypto schema. convert_to + decode +
        -- octet_length are pg_catalog and stay schema-qualified.
        expected_hmac := hmac(pg_catalog.convert_to(claimed_user_id, 'UTF8'), secret, 'sha256');

        BEGIN
          claimed_hmac := pg_catalog.decode(claimed_hmac_hex, 'hex');
        EXCEPTION WHEN OTHERS THEN
          RETURN false;
        END;

        IF pg_catalog.octet_length(expected_hmac) <> pg_catalog.octet_length(claimed_hmac) THEN
          RETURN false;
        END IF;

        RETURN expected_hmac = claimed_hmac;
      END;
      $body$;
    $verify$,
    pgcrypto_schema
  );
END;
$bootstrap_verify_hmac$;

ALTER FUNCTION nuansu.verify_hmac(text, text) OWNER TO nuansu_migrate;
REVOKE ALL ON FUNCTION nuansu.verify_hmac(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nuansu.verify_hmac(text, text) TO nuansu_app, nuansu_auth;

-- ── nuansu.current_user_id() → text ──
-- Reads `nuansu.session_proof` (set by db.forUser via SET LOCAL),
-- splits on ':', verifies the HMAC. Returns the user_id when the
-- proof is valid, NULL otherwise — RLS policies match against the
-- return value, so a forged or missing proof yields no rows.
--
-- The role's own ability to SET LOCAL nuansu.session_proof is what
-- makes the HMAC step necessary — without verification, an injected
-- statement could SET an arbitrary user_id and walk through RLS.
CREATE OR REPLACE FUNCTION nuansu.current_user_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = nuansu, pg_catalog, pg_temp
AS $$
DECLARE
  proof text;
  parts text[];
BEGIN
  proof := pg_catalog.current_setting('nuansu.session_proof', true);
  IF proof IS NULL OR proof = '' THEN
    RETURN NULL;
  END IF;

  parts := pg_catalog.string_to_array(proof, ':');
  IF pg_catalog.cardinality(parts) <> 2 THEN
    RETURN NULL;
  END IF;

  IF NOT nuansu.verify_hmac(parts[1], parts[2]) THEN
    RETURN NULL;
  END IF;

  RETURN parts[1];
END;
$$;

ALTER FUNCTION nuansu.current_user_id() OWNER TO nuansu_migrate;
REVOKE ALL ON FUNCTION nuansu.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nuansu.current_user_id() TO nuansu_app, nuansu_auth;

-- ── nuansu_auth_user_to_app_user() trigger function ──
-- Fires AFTER INSERT ON auth_users (the trigger itself is created in
-- post-migrations, once the auth_users table exists). Creates the
-- companion `users` row in the same transaction.
--
-- SECURITY DEFINER + owner=nuansu_migrate so the trigger body can
-- INSERT into `public.users` even when the originating session is
-- nuansu_auth (which has no INSERT on `users`). search_path pinned to
-- (public, pg_temp) per docs/security.md §13.2.
CREATE OR REPLACE FUNCTION public.nuansu_auth_user_to_app_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.nuansu_auth_user_to_app_user() OWNER TO nuansu_migrate;
REVOKE ALL ON FUNCTION public.nuansu_auth_user_to_app_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nuansu_auth_user_to_app_user() TO nuansu_auth;
