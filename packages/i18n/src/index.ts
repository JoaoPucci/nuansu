// @nuansu/i18n — locale namespace files for the marketing site (en + ja)
// and the app UI. Phase 2C ships all 5 documented namespaces (`common`,
// `marketing`, `auth`, `app`, `onboarding`) for both locales. Per-feature
// copy lands alongside its feature work; this package is the single source
// of truth for which keys exist.

import enApp from "./en/app.json";
import enAuth from "./en/auth.json";
import enCommon from "./en/common.json";
import enMarketing from "./en/marketing.json";
import enOnboarding from "./en/onboarding.json";
import jaApp from "./ja/app.json";
import jaAuth from "./ja/auth.json";
import jaCommon from "./ja/common.json";
import jaMarketing from "./ja/marketing.json";
import jaOnboarding from "./ja/onboarding.json";

export const SUPPORTED_LOCALES = ["en", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// `onboarding` is a dedicated namespace per back_end_architecture.md §3.4
// — sample-chat fixtures (with the documented Aiko + Shibuya signals) and
// the banner label live here, separate from `app`. The server reads the
// fixture content at sample-chat seed time (back_end §3.4 lifecycle step 2).
export const NAMESPACES = ["common", "marketing", "auth", "app", "onboarding"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
  en: {
    common: enCommon,
    marketing: enMarketing,
    auth: enAuth,
    app: enApp,
    onboarding: enOnboarding,
  },
  ja: {
    common: jaCommon,
    marketing: jaMarketing,
    auth: jaAuth,
    app: jaApp,
    onboarding: jaOnboarding,
  },
} as const;

export const I18N_PACKAGE_VERSION = "0.2.0" as const;
