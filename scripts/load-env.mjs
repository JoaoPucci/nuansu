// Loads env vars from a single source-of-truth file, with XDG-first resolution.
//
// Server secrets live OUTSIDE the project tree by default. Client-bundle env
// (VITE_PUBLIC_*) is read by Vite directly from apps/web/.env.local and is not
// touched here.
//
// Resolution order (first match wins):
//   1. $NUANSU_ENV_FILE                  — explicit override
//   2. $XDG_DATA_HOME/nuansu/.env        — XDG canonical
//   3. ~/.local/share/nuansu/.env        — XDG fallback (XDG_DATA_HOME unset)
//   4. <repo-root>/.env.local            — fresh-clone fallback
//   5. <repo-root>/.env                  — last resort
//
// The loader does NOT overwrite vars already in process.env. Shell-injected
// vars and CI `env:` blocks always win.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "nuansu";
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BOM = "﻿";

export function defaultCandidates({ env = process.env, cwd = process.cwd() } = {}) {
  const list = [];
  if (env.NUANSU_ENV_FILE) list.push(env.NUANSU_ENV_FILE);
  const xdg = env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  list.push(join(xdg, APP_NAME, ".env"));
  list.push(join(cwd, ".env.local"));
  list.push(join(cwd, ".env"));
  return list;
}

export function resolveEnvPath(candidates = defaultCandidates()) {
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function unquote(value) {
  const len = value.length;
  if (len < 2) return value;
  const first = value[0];
  const last = value[len - 1];
  if ((first === '"' || first === "'") && first === last) {
    return value.slice(1, -1);
  }
  const hash = value.indexOf(" #");
  return hash === -1 ? value : value.slice(0, hash).trim();
}

function parseLine(rawLine) {
  const line = rawLine.startsWith(BOM) ? rawLine.slice(1).trim() : rawLine.trim();
  if (!line || line.startsWith("#")) return null;
  const eq = line.indexOf("=");
  if (eq <= 0) return null;
  const key = line.slice(0, eq).trim();
  if (!KEY_RE.test(key)) return null;
  return { key, value: unquote(line.slice(eq + 1).trim()) };
}

// Minimal .env parser. Handles:
//   KEY=VALUE      bare value, trailing ` #` comment is stripped
//   KEY="..."      double-quoted: spaces and # preserved
//   KEY='...'      single-quoted: spaces and # preserved
//   # comment      full-line comment
//   blank lines
// Does NOT support: multi-line values, ${VAR} expansion, escape sequences.
export function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const entry = parseLine(rawLine);
    if (entry) out[entry.key] = entry.value;
  }
  return out;
}

function applyEnv(parsed, override) {
  let written = 0;
  for (const [k, v] of Object.entries(parsed)) {
    if (override || process.env[k] === undefined) {
      process.env[k] = v;
      written += 1;
    }
  }
  return written;
}

let alreadyLoaded = false;

export function loadEnv({ candidates, override = false, log = false, reset = false } = {}) {
  if (reset) alreadyLoaded = false;
  if (alreadyLoaded) return null;
  alreadyLoaded = true;
  const path = resolveEnvPath(candidates ?? defaultCandidates());
  if (!path) {
    if (log) {
      console.error(
        "[load-env] no env file found in any candidate path; relying on shell-injected env vars",
      );
    }
    return null;
  }
  const parsed = parseEnvFile(readFileSync(path, "utf8"));
  const written = applyEnv(parsed, override);
  if (log) {
    console.error(`[load-env] loaded ${written}/${Object.keys(parsed).length} vars from ${path}`);
  }
  return path;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) loadEnv({ log: true });
