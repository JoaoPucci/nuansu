// @nuansu/schemas — shared zod schemas for the API contract.
// Single source of truth for the wire shapes that travel between
// apps/web/server and apps/web/src. The DB schema (Drizzle) is the
// source of truth for persisted state; this package mirrors the
// subset that crosses the API boundary.
//
// All schemas are derived from docs/back_end_architecture.md §3 (DB)
// and §5 (API). When the docs change, the schemas change in the same PR.

export const SCHEMAS_PACKAGE_VERSION = "0.2.0" as const;

export * from "./common.js";
export * from "./translation.js";
export * from "./requests.js";
export * from "./prefs.js";
export * from "./account.js";
