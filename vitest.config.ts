import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Lightweight node-env harness (n=1, no browser/React needed for the
 * regression invariants). CI runs `pnpm test` -> `vitest run`; any failing
 * assertion exits non-zero and red-lights the pipeline (AC6).
 */
export default defineConfig({
  resolve: {
    alias: {
      // Mirror tsconfig "@/*" -> src/* so tests use the same imports as app.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
