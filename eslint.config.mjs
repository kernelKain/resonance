import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".venv/**",
    // Legacy scratch/debug scripts — not app code, use CommonJS require()
    "test_parse.js",
    "test_parse_2.js",
    "test_parse_3.js",
    "test_api.mjs",
  ]),
]);

export default eslintConfig;