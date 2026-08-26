import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./src/*" path so route handlers
      // (which import via "@/lib/...") resolve under vitest too.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Tests under src/db/queries spin up a real local D1 database via
    // wrangler's getPlatformProxy (see src/db/queries/test-d1.ts) — that
    // workerd bootstrap alone can take several seconds, well past the
    // default 5s timeout, even though the test itself is fast.
    testTimeout: 30000,
  },
});
