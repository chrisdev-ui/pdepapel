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
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      "tests/components/**/*.{test,spec}.{ts,tsx}",
    ],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["tests/**", "**/*.config.*", ".next/**"],
      thresholds: {
        branches: 65,
        functions: 65,
        lines: 70,
        statements: 70,
      },
    },
  },
});
