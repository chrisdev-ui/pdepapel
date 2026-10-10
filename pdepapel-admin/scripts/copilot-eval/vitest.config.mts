import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Evaluación del copiloto (docs/design/asistente-experto-paula.md §11). Corre
 * SOLO con scripts/with-test-env.mjs (base local pdepapel_test) y OpenAI de
 * verdad. Del .env local se toma únicamente OPENAI_API_KEY: nada de la base de
 * producción entra aquí.
 *
 *   node scripts/with-test-env.mjs npx vitest run --config scripts/copilot-eval/vitest.config.mts
 */
const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const local = loadEnv("", rootDir, "");

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
      "server-only": path.resolve(rootDir, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    root: rootDir,
    environment: "node",
    include: ["scripts/copilot-eval/**/*.eval.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: { OPENAI_API_KEY: local.OPENAI_API_KEY ?? "" },
  },
});
