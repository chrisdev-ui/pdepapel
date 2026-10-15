/**
 * Servidor de las e2e sobre un build de producción (`next build` + `next
 * start -p 3101`) en vez de `next dev`: las rutas ya vienen compiladas, así
 * que una corrida larga con un solo worker no se queda esperando compilaciones
 * en frío. Lo arranca `playwright.config.ts` cuando `E2E_SERVER=production`.
 * Mismo aislamiento que el modo de desarrollo (`lib/e2e-server-env.mjs`).
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { e2eServerEnv, withNetworkGuard } from "./lib/e2e-server-env.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const env = { ...e2eServerEnv(process.env, "e2e (build de producción)"), NODE_ENV: "production", NEXT_DIST_DIR: ".next-e2e" };

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
if (process.env.E2E_SKIP_BUILD !== "1") {
  const started = Date.now();
  // Solo el servidor corta la red: el build puede bajar fuentes.
  const build = spawnSync(npx, ["next", "build"], { cwd: root, env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
  console.log(`[e2e] build de producción listo en ${Math.round((Date.now() - started) / 1000)} s`);
}

const server = spawn(npx, ["next", "start", "-p", "3101"], { cwd: root, env: withNetworkGuard(env), stdio: "inherit" });
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
