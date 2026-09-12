import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const NO_DIRECT_ANTHROPIC_FETCH = {
  selector: "CallExpression[callee.name='fetch'] Literal[value=/anthropic\\.com/]",
  message:
    "Call invokeAgent() from src/lib/agents/dispatcher.ts instead of fetching the Anthropic API directly (issue #30) — it's the one place that logs cost/tokens and enforces the hop limit and daily budget cap.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": ["error", NO_DIRECT_ANTHROPIC_FETCH],
    },
  },
  {
    // The dispatcher is the one file allowed to make this call.
    files: ["src/lib/agents/dispatcher.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".open-next/**",
    "cloudflare-env.d.ts",
  ]),
]);

export default eslintConfig;
