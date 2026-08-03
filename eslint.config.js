// Flat config — the only format ESLint reads as of v10 (legacy .eslintrc.*
// support was removed in Feb 2026). See:
// https://eslint.org/docs/latest/use/configure/migration-guide
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: ["error", "smart"],
      "prefer-const": "warn",
    },
  },
  {
    ignores: ["node_modules/**", "dist/**", "build/**", ".workspace-config/**"],
  },
];

// TypeScript projects: add `typescript-eslint` as a dependency and spread
// `tseslint.configs.recommended` into this array — kept out of the base
// template so plain-JS repos don't need the extra dependency.
