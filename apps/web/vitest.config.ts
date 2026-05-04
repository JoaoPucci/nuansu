import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    name: "web",
    environment: "node",
    globals: false,
    include: [
      "lib/**/*.test.ts",
      "server/**/*.test.ts",
      "server/**/*.integration.test.ts",
      "src/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    // Apply the full migration pipeline once before any integration /
    // fitness test runs. See test/setup/global-db.ts for the rationale
    // (avoids per-worker migration races on the secret upsert).
    globalSetup: ["./test/setup/global-db.ts"],
    // Integration + fitness tests share a single Postgres database
    // and use TRUNCATE … CASCADE in beforeEach to reset state.
    // Running multiple test files in parallel races on those
    // truncates (e.g., one file's beforeEach truncates auth_users
    // CASCADE while another file's test holds a chats FK reference).
    // Disable file-level parallelism; the resulting slowdown is
    // negligible at this test count.
    fileParallelism: false,
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
