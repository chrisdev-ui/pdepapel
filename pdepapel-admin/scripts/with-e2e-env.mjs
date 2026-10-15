import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const applicationEnvironmentFile = new URL("../.env", import.meta.url);
const e2eEnvironmentFile = new URL("../.env.e2e.local", import.meta.url);
const e2eEnvironmentVariables = new Set([
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "E2E_ADMIN_BASE_URL",
  "E2E_ADMIN_CLERK_USER_ID",
  "E2E_ADMIN_STORE_ID",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
]);

// De `.env` salen las claves de Clerk y lo demás, nunca una base: esas URL
// apuntan a producción. La base de pruebas la pone `with-test-env`.
const inherited = new Set(Object.keys(process.env));

if (existsSync(applicationEnvironmentFile)) {
  process.loadEnvFile(applicationEnvironmentFile);
}

for (const name of ["DATABASE_URL", "COPILOT_DATABASE_URL"]) {
  if (!inherited.has(name)) delete process.env[name];
}

if (existsSync(e2eEnvironmentFile)) {
  const entries = readFileSync(e2eEnvironmentFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean);

  for (const [, name, rawValue] of entries) {
    if (!e2eEnvironmentVariables.has(name)) {
      continue;
    }

    const value = rawValue.replace(/^(?:"|')|(?:"|')$/g, "");
    process.env[name] = value;
  }
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error("Indica el comando E2E que se debe ejecutar.");
}

const result = spawnSync(command, args, {
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
