// @nuansu/i18n — locale namespace files for the marketing site (en + ja)
// and the app UI. Phase 2C ships all 4 documented namespaces (`common`,
// `marketing`, `auth`, `app`) for both locales. Per-feature copy lands
// alongside its feature work; this package is the single source of truth
// for which keys exist.

import enApp from "./en/app.json";
import enAuth from "./en/auth.json";
import enCommon from "./en/common.json";
import enMarketing from "./en/marketing.json";
import jaApp from "./ja/app.json";
import jaAuth from "./ja/auth.json";
import jaCommon from "./ja/common.json";
import jaMarketing from "./ja/marketing.json";

export const SUPPORTED_LOCALES = ["en", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const NAMESPACES = ["common", "marketing", "auth", "app"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
  en: {
    common: enCommon,
    marketing: enMarketing,
    auth: enAuth,
    app: enApp,
  },
  ja: {
    common: jaCommon,
    marketing: jaMarketing,
    auth: jaAuth,
    app: jaApp,
  },
} as const;

export const I18N_PACKAGE_VERSION = "0.2.0" as const;
