// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";

const COMPLEXITY_LIMIT = 15;
const CYCLOMATIC_LIMIT = 12;

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.wrangler/**",
      "**/.dev/**",
      "**/coverage/**",
      "**/routeTree.gen.ts",
      "**/*.fixture.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      import: importPlugin,
      sonarjs,
    },
    rules: {
      // Quality gates that fail CI
      "sonarjs/cognitive-complexity": ["error", COMPLEXITY_LIMIT],
      complexity: ["error", CYCLOMATIC_LIMIT],

      // React
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Imports
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./apps/web/src",
              from: "./apps/web/server",
              message: "Client code must not import from server/. Use the API instead.",
            },
            {
              target: "./apps/web/src",
              from: "./apps/web/functions",
              message: "Client code must not import from functions/. Use the API instead.",
            },
          ],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/process.env*"],
              message: "Read env via lib/env.ts (validated by zod).",
            },
          ],
        },
      ],

      // Hygiene
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
    settings: {
      react: { version: "18" },
    },
  },
  {
    // Test files: relax complexity (helpers can be expressive)
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.bench.ts", "**/*.spec.ts"],
    rules: {
      "sonarjs/cognitive-complexity": "off",
      complexity: "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Config + tooling scripts: untyped lint (no project-aware rules).
    files: [
      "*.config.{js,ts,mjs,cjs}",
      "**/*.config.{js,ts,mjs,cjs}",
      "**/vitest.workspace.ts",
      "**/.ladle/**/*",
      "scripts/**/*.{js,mjs,cjs,ts}",
    ],
    languageOptions: {
      parserOptions: { project: null, projectService: false },
    },
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Route files: TanStack Router uses throw redirect()/notFound() as control
    // flow; the only-throw-error rule doesn't model that pattern correctly.
    files: ["apps/web/src/routes/**/*.tsx", "apps/web/src/routes/**/*.ts"],
    rules: {
      "@typescript-eslint/only-throw-error": "off",
    },
  },
);
