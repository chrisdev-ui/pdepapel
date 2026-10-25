// Rutas del kit del sandbox de pagos. Todo lo que el kit escribe (correos
// capturados, registros, ids de pedidos, capturas) va a tmp/payments-sandbox,
// que está en el .gitignore.
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

export const ADMIN = fileURLToPath(new URL("../..", import.meta.url));
export const STORE = fileURLToPath(new URL("../../../pdepapel-store/", import.meta.url));
export const WORK = ADMIN + "tmp/payments-sandbox/";
mkdirSync(WORK + "shots", { recursive: true });

export const fileUrl = (path) => pathToFileURL(path).href;
export const SANDBOX_ENV_FILE = ADMIN + ".env.sandbox.local";

/** Llaves de PRUEBA de las pasarelas; nunca se imprimen. */
export function sandboxEnv() {
  if (!existsSync(SANDBOX_ENV_FILE)) throw new Error("Falta .env.sandbox.local (ver AGENTS.md › Sandbox de pagos).");
  return parseEnv(readFileSync(SANDBOX_ENV_FILE, "utf8"));
}

export const readWork = (name) => readFileSync(WORK + name, "utf8").trim();
export const ADMIN_PORT = 3101;
export const STORE_PORT = 3100;
export const UPSTASH_PORT = 3199;
export const SWITCH_PORT = 3011;
export const CORS_PORT = 3102;
