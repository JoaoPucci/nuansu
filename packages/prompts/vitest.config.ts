import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "prompts",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
