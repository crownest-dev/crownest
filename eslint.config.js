import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintComments from "eslint-plugin-eslint-comments";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "eslint-comments": eslintComments,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "off",
      complexity: ["error", 12],
      "eslint-comments/no-unused-disable": "error",
      "max-depth": ["warn", 4],
      "max-lines": [
        "error",
        {
          max: 400,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines-per-function": [
        "error",
        {
          max: 80,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-statements": ["error", 30],
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          vars: "all",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["*.js", "scripts/**/*.mjs", "packages/*/scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      "max-lines-per-function": "off",
      "max-statements": "off",
    },
  },
  eslintConfigPrettier,
  {
    ignores: [
      "**/dist/**",
      ".pytest_cache/**",
      ".turbo/**",
      ".venv/**",
      "coverage/**",
      "node_modules/**",
      "pnpm-lock.yaml",
    ],
  },
);
