import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import importPlugin from "eslint-plugin-import";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [".next/**", "out/**", "src/generated/**", "src/lib/api/generated/**"],
  },
  {
    plugins: {
      import: importPlugin,
    },
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    rules: {
      "import/first": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*", "../*"],
              message: "Use absolute imports (e.g. @/...) instead of relative paths.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["app/layout.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*", "../*", "!./globals.css"],
              message:
                "Use absolute imports (e.g. @/...) instead of relative paths. ./globals.css is allowed here.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
