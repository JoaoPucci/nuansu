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

-- pgcrypto for hmac(); create in its own schema so the function can be
-- referenced without depending on the public-schema search_path.
-- nuansu.verify_hmac (SECURITY DEFINER, owner=nuansu_migrate) calls
-- pgcrypto.hmac(); it needs USAGE on the schema and EXECUTE on the
-- function. The app + auth roles do NOT need either — they only ever
-- call nuansu.verify_hmac through nuansu.current_user_id().
CREATE SCHEMA IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA pgcrypto;
GRANT USAGE ON SCHEMA pgcrypto TO nuansu_migrate;

-- citext for case-insensitive text columns (auth_users.email, waitlist.email).
-- Lives in the default (public) schema; that's the conventional install
-- location and Postgres's recommended default for citext usage.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS nuansu AUTHORIZATION nuansu_migrate;

-- Grant USAGE so app + auth roles can resolve nuansu.* references in RLS
-- policies. They cannot SELECT from nuansu.config (no privileges granted
-- on that table) — only nuansu_migrate can read the HMAC secret.
GRANT USAGE ON SCHEMA nuansu TO nuansu_app, nuansu_auth;

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
CREATE OR REPLACE FUNCTION nuansu.verify_hmac(
  claimed_user_id  text,
  claimed_hmac_hex text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = nuansu, pg_catalog, pg_temp
AS $$
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

  expected_hmac := pgcrypto.hmac(pg_catalog.convert_to(claimed_user_id, 'UTF8'), secret, 'sha256');

  -- decode() is in pg_catalog. claimed_hmac_hex is expected to be 64
  -- lowercase hex chars; if the input is malformed, decode() raises
  -- and the caller catches as RETURN false.
  BEGIN
    claimed_hmac := pg_catalog.decode(claimed_hmac_hex, 'hex');
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  -- Length-prefixed equality: bytea equality only proceeds when lengths
  -- match (no early-byte short-circuit through differing lengths).
  IF pg_catalog.octet_length(expected_hmac) <> pg_catalog.octet_length(claimed_hmac) THEN
    RETURN false;
  END IF;

  RETURN expected_hmac = claimed_hmac;
END;
$$;

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
