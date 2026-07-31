import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/integration/**/*.{test,spec}.ts"],
    testTimeout: 30_000,
  },
});
