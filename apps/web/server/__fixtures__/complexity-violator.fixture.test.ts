// Verifies the ESLint cognitive-complexity gate is wired correctly.
// Runs ESLint programmatically against the fixture and asserts a violation is
// reported. If this test ever passes silently, the gate is broken.

import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "complexity-violator.fixture.ts");
const REPO_ROOT = path.resolve(__dirname, "../../../..");

describe("ESLint complexity gate", () => {
  it(
    "reports sonarjs/cognitive-complexity on the deliberately-complex fixture",
    { timeout: 30_000 },
    async () => {
      const eslint = new ESLint({
        cwd: REPO_ROOT,
        // Override the project's ignore so the fixture is linted for this test.
        overrideConfig: {
          ignores: [],
        },
        ignore: false,
      });

      const results = await eslint.lintFiles([FIXTURE]);
      const messages = results[0]?.messages ?? [];
      const complexityHits = messages.filter(
        (m) => m.ruleId === "sonarjs/cognitive-complexity" || m.ruleId === "complexity",
      );

      expect(
        complexityHits.length,
        `Expected complexity rules to fire on the fixture but got: ${JSON.stringify(messages, null, 2)}`,
      ).toBeGreaterThan(0);
    },
  );
});
