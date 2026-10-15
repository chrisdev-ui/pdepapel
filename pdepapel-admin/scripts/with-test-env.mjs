import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { assertTestDatabaseUrl, readTestDatabaseUrl } from "./lib/test-database.mjs";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error(
    "Indica el comando que se debe ejecutar con la base de datos de pruebas.",
  );
}

const environmentFile = new URL("../.env.test", import.meta.url);

if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

const testDatabaseUrl = assertTestDatabaseUrl(
  readTestDatabaseUrl(environmentFile),
  { variable: "TEST_DATABASE_URL", context: "with-test-env" },
);

const result = spawnSync(command, args, {
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    NODE_ENV: "development",
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
