/**
 * La tienda de las e2e locales (`playwright.local.config.ts`): build de
 * producción y `next start -p 3100`, con el mismo aislamiento que la
 * administración. Todo lo del `.env` de la tienda pasa a un valor de prueba
 * salvo Clerk de desarrollo; el build puede bajar fuentes de Google, el
 * servidor no sale a la red salvo la máquina local y Clerk
 * (`pdepapel-admin/scripts/lib/e2e-server-network.mjs`). Si el entorno trae
 * algo de producción, no arranca.
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { storeServerEnv } from "./lib/e2e-store-env.mjs";

const GUARD = new URL("../../pdepapel-admin/scripts/lib/e2e-server-network.mjs", import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const appEnvFile = fileURLToPath(new URL("../.env", import.meta.url));

const env = { ...storeServerEnv(process.env, { appEnvFile }), NODE_ENV: "production" };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
if (process.env.E2E_SKIP_BUILD !== "1") {
  const build = spawnSync(npx, ["next", "build"], { cwd: root, env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn(npx, ["next", "start", "-p", "3100"], {
  cwd: root,
  env: { ...env, NODE_OPTIONS: [env.NODE_OPTIONS, `--import ${GUARD.href}`].filter(Boolean).join(" ") },
  stdio: "inherit",
});
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
