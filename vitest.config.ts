import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/web/vitest.config.ts",
      "packages/schemas/vitest.config.ts",
      "packages/prompts/vitest.config.ts",
      "packages/i18n/vitest.config.ts",
      {
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.mjs"],
          environment: "node",
        },
      },
    ],
  },
});
