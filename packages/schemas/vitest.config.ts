import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "schemas",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
