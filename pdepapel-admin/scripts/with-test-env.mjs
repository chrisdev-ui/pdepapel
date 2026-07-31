import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const environmentFile = new URL("../.env.test", import.meta.url);

if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error(
    "Indica el comando que se debe ejecutar con la base de datos de pruebas.",
  );
}

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL es obligatoria. Copia .env.test.example a .env.test y usa la base de datos local de pruebas.",
  );
}

const databaseUrl = new URL(testDatabaseUrl);
const localHosts = new Set(["127.0.0.1", "::1", "localhost"]);
const databaseName = databaseUrl.pathname.replace(/^\//, "");

if (!localHosts.has(databaseUrl.hostname) || databaseName !== "pdepapel_test") {
  throw new Error(
    "Por seguridad, las pruebas de integración solo aceptan una base local llamada pdepapel_test.",
  );
}

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
