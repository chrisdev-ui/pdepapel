import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

import { testEnvStubs } from "./scripts/lib/test-isolation.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir),
      // Mismo motivo que en `vitest.config.mts`: ver el comentario de allí.
      "server-only": path.resolve(rootDir, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    // Claves externas dobladas antes de cualquier import (ver
    // `scripts/lib/test-isolation.mjs`).
    env: testEnvStubs(fileURLToPath(new URL(".env", import.meta.url))),
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/integration/**/*.{test,spec}.ts"],
    setupFiles: ["./tests/setup-isolation.ts", "./tests/integration/setup.ts"],
    testTimeout: 30_000,
  },
});
