import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import powerbiVisuals from "eslint-plugin-powerbi-visuals";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", ".package-staging/**", ".tmp/**"]
  },
  powerbiVisuals.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json"
      },
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "error"
    }
  },
  {
    files: ["scripts/**/*.js", "*.js", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-console": "off",
      "powerbi-visuals/non-literal-fs-path": "off"
    }
  }
];
