import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist", "node_modules", "reference"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" }
  },
  { files: ["public/**/*.js"], languageOptions: { globals: globals.browser, sourceType: "script" } },
  { files: ["server/**/*.js", "scripts/**/*.mjs", "tests/**/*.js", "shared/**/*.js", "*.config.js"], languageOptions: { globals: globals.node } }
];
