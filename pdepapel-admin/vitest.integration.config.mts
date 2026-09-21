import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/integration/**/*.{test,spec}.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 30_000,
  },
});
