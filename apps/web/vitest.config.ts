import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    name: "web",
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.ts", "server/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**/*.ts", "server/**/*.ts", "src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.bench.ts", "**/routeTree.gen.ts", "**/__fixtures__/**"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
    benchmark: { include: ["**/*.bench.ts"] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/server": path.resolve(__dirname, "./server"),
      "@/lib": path.resolve(__dirname, "./lib"),
    },
  },
});
