/**
 * Servidor de las e2e sobre un build de producción (`next build` + `next
 * start -p 3101`) en vez de `next dev`: las rutas ya vienen compiladas, así
 * que una corrida larga con un solo worker no se queda esperando compilaciones
 * en frío. Lo arranca `playwright.config.ts` cuando `E2E_SERVER=production`.
 *
 * Un build de producción corre las ramas de producción (correos de verdad,
 * Redis, avisos), así que el servidor recibe las mismas claves de prueba que
 * las unitarias y las de integración, salvo las de Clerk de desarrollo (sin
 * ellas no hay sesión), y no puede salir a la red salvo a la máquina local y
 * a Clerk. La base sigue siendo `pdepapel_test` con la guarda de siempre.
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assertTestDatabaseEnv } from "./lib/test-database.mjs";
import { ABSENT_IN_TESTS, testEnvStubs } from "./lib/test-isolation.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const KEEP = new Set(["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]);

assertTestDatabaseEnv(process.env, "e2e (build de producción)");
if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
  throw new Error("[e2e] El build de producción de las e2e solo corre con claves de desarrollo de Clerk (sk_test_).");
}

const env = { ...process.env };
for (const [name, value] of Object.entries(testEnvStubs(fileURLToPath(new URL("../.env", import.meta.url))))) {
  if (!KEEP.has(name)) env[name] = value;
}
for (const name of ABSENT_IN_TESTS) delete env[name];
Object.assign(env, { NODE_ENV: "production", NEXT_DIST_DIR: ".next-e2e", NEXT_TELEMETRY_DISABLED: "1" });
// Solo el servidor corta la red: el build puede bajar fuentes. Una URL de archivo, porque la ruta lleva espacios.
const serverEnv = {
  ...env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import ${new URL("./lib/e2e-server-network.mjs", import.meta.url).href}`].filter(Boolean).join(" "),
};

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
if (process.env.E2E_SKIP_BUILD !== "1") {
  const started = Date.now();
  const build = spawnSync(npx, ["next", "build"], { cwd: root, env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
  console.log(`[e2e] build de producción listo en ${Math.round((Date.now() - started) / 1000)} s`);
}

const server = spawn(npx, ["next", "start", "-p", "3101"], { cwd: root, env: serverEnv, stdio: "inherit" });
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
