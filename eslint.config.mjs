import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "no-dupe-else-if": "error",
      "no-constant-binary-expression": "error",
      "no-eval": "error",
      eqeqeq: ["error", "smart"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.tsx", "packages/ui/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Base components ported from UniFlow keep their public prop lists; do not edit them for lint.
    files: ["packages/ui/src/components/**/*.{ts,tsx}", "packages/ui/src/utils/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", caughtErrors: "none", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // The browser never decides business outcomes: no fixture stores or engine code in the web app.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/apps/api/**", "**/workflow/**/mock/**"],
              message:
                "Call the API through src/shared/api instead of importing server code.",
            },
          ],
        },
      ],
    },
  },
];
