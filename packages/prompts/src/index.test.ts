import { describe, it, expect } from "vitest";
import { PROMPTS_PACKAGE_VERSION } from "./index";

describe("@nuansu/prompts", () => {
  it("exports a stable package version constant", () => {
    expect(PROMPTS_PACKAGE_VERSION).toBe("0.1.0");
  });
});
