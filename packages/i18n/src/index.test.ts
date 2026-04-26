import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES, resources, I18N_PACKAGE_VERSION } from "./index";

describe("@nuansu/i18n", () => {
  it("ships the v1 supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "ja"]);
  });

  it("provides matching keys across en and ja", () => {
    const enKeys = JSON.stringify(Object.keys(resources.en.common).sort());
    const jaKeys = JSON.stringify(Object.keys(resources.ja.common).sort());
    expect(enKeys).toBe(jaKeys);
  });

  it("exposes a stable package version", () => {
    expect(I18N_PACKAGE_VERSION).toBe("0.1.0");
  });
});
