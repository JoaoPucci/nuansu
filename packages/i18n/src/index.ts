// @nuansu/i18n — locale namespace files for the marketing site (en + ja) and
// the app UI (en for v1; ja added later). Phase 1 ships only the `common`
// namespace; per-feature namespaces (`marketing`, `auth`, `app`) land as those
// features ship.

import enCommon from "./en/common.json";
import jaCommon from "./ja/common.json";

export const SUPPORTED_LOCALES = ["en", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const resources = {
  en: { common: enCommon },
  ja: { common: jaCommon },
} as const;

export const I18N_PACKAGE_VERSION = "0.1.0" as const;
