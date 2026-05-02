// Locale-parity tests. The cardinal rule for i18n: every key that exists
// in `en` must exist in `ja` (and vice versa) with the same shape and the
// same set of `{{placeholder}}` interpolation tokens. Drift here ships a
// missing-translation bug straight to production — these tests catch it
// before merge.

import { describe, expect, it } from "vitest";
import { I18N_PACKAGE_VERSION, NAMESPACES, SUPPORTED_LOCALES, resources } from "./index.js";

// Walk a nested JSON object and collect leaf paths as dot-joined strings.
function collectKeyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    paths.push(...collectKeyPaths(value, prefix ? `${prefix}.${key}` : key));
  }
  return paths.sort();
}

// Walk a nested JSON object and collect EVERY leaf value (string, number,
// boolean, null — anything that's not an object). The value-discipline
// suite then asserts each is a non-empty string. Returning unknown rather
// than dropping non-strings means a `naturalness: 50` slip surfaces in CI
// instead of passing silently.
function collectValuesByPath(obj: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (obj === null || typeof obj !== "object") {
    out.set(prefix, obj);
    return out;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const sub = collectValuesByPath(value, prefix ? `${prefix}.${key}` : key);
    for (const [k, v] of sub) out.set(k, v);
  }
  return out;
}

// Extract i18next-style placeholder tokens (`{{name}}`) from a string.
function extractPlaceholders(s: string): string[] {
  const matches = s.match(/\{\{[^}]+\}\}/g);
  return (matches ?? []).map((m) => m.trim()).sort();
}

describe("@nuansu/i18n — package surface", () => {
  it("ships the v1 supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "ja"]);
  });

  it("ships the 5 documented namespaces", () => {
    expect(NAMESPACES).toEqual(["common", "marketing", "auth", "app", "onboarding"]);
  });

  it("exposes a stable package version", () => {
    expect(I18N_PACKAGE_VERSION).toBe("0.2.0");
  });

  it("provides every namespace for every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const ns of NAMESPACES) {
        expect(resources[locale][ns]).toBeDefined();
      }
    }
  });
});

describe("@nuansu/i18n — key parity (en ↔ ja)", () => {
  for (const ns of NAMESPACES) {
    it(`namespace '${ns}': en and ja have identical key paths`, () => {
      const enPaths = collectKeyPaths(resources.en[ns]);
      const jaPaths = collectKeyPaths(resources.ja[ns]);
      expect(jaPaths).toEqual(enPaths);
    });
  }
});

describe("@nuansu/i18n — value discipline (every leaf is a non-empty string)", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const ns of NAMESPACES) {
      it(`'${locale}.${ns}': every leaf is a non-empty string`, () => {
        const values = collectValuesByPath(resources[locale][ns]);
        const violations: string[] = [];
        for (const [path, value] of values) {
          if (typeof value !== "string") {
            violations.push(`${path}: expected string, got ${typeof value} (${String(value)})`);
          } else if (value === "") {
            violations.push(`${path}: empty string`);
          }
        }
        expect(violations).toEqual([]);
      });
    }
  }
});

describe("@nuansu/i18n — onboarding fixture signals (back_end §3.4)", () => {
  // back_end §3.4: "the fixture must include: a believable proper noun
  // for the contact (Aiko, in JP fixtures), a place name worth a
  // name-lock badge (Shibuya), and a register that reads as
  // informal-but-not-rude for the target locale." The Aiko + Shibuya
  // signals are what exercise the documented anti-drift demonstration
  // (name preservation + place-name lock) in the first-run sample chat.
  //
  // back_end §3.4 also requires "fixtures authored per (source_lang,
  // target_lang) pair" — for v1 that's `en_ja` and `ja_en`. Both pairs
  // ship in both locale files so a user whose UI locale doesn't match
  // their source_lang still gets correctly-directed fixtures.
  const PAIRS = ["en_ja", "ja_en"] as const;

  for (const locale of SUPPORTED_LOCALES) {
    for (const pair of PAIRS) {
      it(`'${locale}.onboarding.fixtures.${pair}': contains the 'Aiko' contact-name signal`, () => {
        const pairFixtures = (
          resources[locale].onboarding as {
            fixtures: Record<string, Record<string, unknown>>;
          }
        ).fixtures[pair];
        const text = JSON.stringify(pairFixtures);
        expect(text).toMatch(/Aiko/);
      });

      it(`'${locale}.onboarding.fixtures.${pair}': contains the 'Shibuya' place-name signal`, () => {
        const pairFixtures = (
          resources[locale].onboarding as {
            fixtures: Record<string, Record<string, unknown>>;
          }
        ).fixtures[pair];
        const text = JSON.stringify(pairFixtures);
        expect(text).toMatch(/Shibuya/);
      });

      it(`'${locale}.onboarding.fixtures.${pair}': ships exactly 3 fixture messages`, () => {
        const pairFixtures = (
          resources[locale].onboarding as {
            fixtures: Record<string, Record<string, unknown>>;
          }
        ).fixtures[pair];
        expect(pairFixtures).toBeDefined();
        const messageKeys = Object.keys(pairFixtures ?? {}).filter((k) => k.startsWith("message_"));
        expect(messageKeys).toHaveLength(3);
      });
    }

    it(`'${locale}.onboarding.fixtures': ships both v1 language pairs (en_ja, ja_en)`, () => {
      const fixtures = (resources[locale].onboarding as { fixtures: Record<string, unknown> })
        .fixtures;
      expect(Object.keys(fixtures).sort()).toEqual(["en_ja", "ja_en"]);
    });
  }
});

describe("@nuansu/i18n — placeholder parity (en ↔ ja)", () => {
  // i18next interpolates `{{var}}` tokens. If en uses `{{email}}` but ja
  // uses `{{メール}}` (translated), the runtime won't substitute and the
  // user sees raw `{{メール}}` in the UI. This test catches the mismatch.
  for (const ns of NAMESPACES) {
    it(`namespace '${ns}': placeholder tokens match between en and ja`, () => {
      const enValues = collectValuesByPath(resources.en[ns]);
      const jaValues = collectValuesByPath(resources.ja[ns]);
      const mismatches: string[] = [];
      for (const [path, enValue] of enValues) {
        if (typeof enValue !== "string") continue;
        const jaValue = jaValues.get(path);
        const jaText = typeof jaValue === "string" ? jaValue : "";
        const enPlaceholders = extractPlaceholders(enValue);
        const jaPlaceholders = extractPlaceholders(jaText);
        if (JSON.stringify(enPlaceholders) !== JSON.stringify(jaPlaceholders)) {
          mismatches.push(
            `${path}: en=[${enPlaceholders.join(",")}] vs ja=[${jaPlaceholders.join(",")}]`,
          );
        }
      }
      expect(mismatches).toEqual([]);
    });
  }
});
