import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const environmentFile = new URL("../.env.e2e.local", import.meta.url);

if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
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
