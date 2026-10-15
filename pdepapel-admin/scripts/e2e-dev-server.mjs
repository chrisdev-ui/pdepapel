/**
 * Servidor de las e2e con `next dev -p 3101` (una prueba suelta en local), con
 * el mismo aislamiento que el build de producción: claves de prueba salvo
 * Clerk de desarrollo, sin interruptores y sin red salvo la máquina local y
 * Clerk. Antes de esto el servidor de desarrollo usaba las claves reales de
 * `.env` y llegaba a la tienda, a Upstash y a MiPaquete de producción.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { e2eServerEnv, withNetworkGuard } from "./lib/e2e-server-env.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const env = withNetworkGuard({ ...e2eServerEnv(process.env, "e2e (servidor de desarrollo)"), NEXT_DIST_DIR: ".next" });

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const server = spawn(npx, ["next", "dev", "-p", "3101"], { cwd: root, env, stdio: "inherit" });
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
