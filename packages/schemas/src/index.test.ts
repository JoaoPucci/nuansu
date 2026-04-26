import { describe, it, expect } from "vitest";
import { SCHEMAS_PACKAGE_VERSION } from "./index";

describe("@nuansu/schemas", () => {
  it("exports a stable package version constant", () => {
    expect(SCHEMAS_PACKAGE_VERSION).toBe("0.1.0");
  });
});
