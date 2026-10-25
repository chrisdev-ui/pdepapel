/**
 * Servidor de las e2e sobre un build de producción (`next build` + `next
 * start -p 3101`) en vez de `next dev`: las rutas ya vienen compiladas, así
 * que una corrida larga con un solo worker no se queda esperando compilaciones
 * en frío. Lo arranca `playwright.config.ts` cuando `E2E_SERVER=production`.
 * Mismo aislamiento que el modo de desarrollo (`lib/e2e-server-env.mjs`).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { e2eServerEnv, withNetworkGuard } from "./lib/e2e-server-env.mjs";
import { startFakeUpstash, withFakeUpstash } from "./lib/fake-upstash.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const env = { ...e2eServerEnv(process.env, "e2e (build de producción)"), NODE_ENV: "production", NEXT_DIST_DIR: ".next-e2e" };

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
// El build fija NEXT_PUBLIC_BUILD_SHA; `/api/version` lee VERCEL_GIT_COMMIT_SHA al
// correr. Con E2E_SKIP_BUILD=1 sobre un build de otro commit no coincidirían y
// el aviso de versión nueva saldría en todas las pantallas.
const buildShaFile = path.join(root, env.NEXT_DIST_DIR, "e2e-build-sha");
if (process.env.E2E_SKIP_BUILD !== "1") {
  const started = Date.now();
  // Solo el servidor corta la red: el build puede bajar fuentes.
  const build = spawnSync(npx, ["next", "build"], { cwd: root, env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
  writeFileSync(buildShaFile, env.VERCEL_GIT_COMMIT_SHA ?? "");
  console.log(`[e2e] build de producción listo en ${Math.round((Date.now() - started) / 1000)} s`);
} else if (existsSync(buildShaFile)) {
  const builtSha = readFileSync(buildShaFile, "utf8").trim();
  if (builtSha !== (env.VERCEL_GIT_COMMIT_SHA ?? "")) {
    console.warn(`[e2e] E2E_SKIP_BUILD=1 sobre un build de otro commit (${builtSha || "sin commit"}): el servidor usa ese; version-banner necesita un build nuevo.`);
  }
  if (builtSha) env.VERCEL_GIT_COMMIT_SHA = builtSha;
  else delete env.VERCEL_GIT_COMMIT_SHA;
}

// El Redis falso corre en este proceso: se arranca después del build, que
// bloquea el proceso (spawnSync) y no podría contestarle.
const upstash = await startFakeUpstash();
const server = spawn(npx, ["next", "start", "-p", "3101"], { cwd: root, env: withNetworkGuard(withFakeUpstash(env, upstash.url)), stdio: "inherit" });
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => {
  upstash.close();
  process.exit(code ?? 0);
});
