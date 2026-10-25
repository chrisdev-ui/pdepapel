// Tienda local para el sandbox de pagos: el entorno de las e2e locales (todo
// stub salvo Clerk de desarrollo) más la llave de identidad de PRUEBA de Bold,
// hablando con la administración a través del puente de CORS (:3102). Build de
// producción y `next start -p 3100`. Arranca después de la administración: el
// build lee el catálogo de ella.
//   node scripts/payments-sandbox/store-server.mjs   (desde pdepapel-admin)
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { ADMIN, CORS_PORT, STORE, STORE_PORT, fileUrl, sandboxEnv } from "./paths.mjs";

const { storeServerEnv } = await import(fileUrl(STORE + "scripts/lib/e2e-store-env.mjs"));
const storeId =
  readFileSync(ADMIN + ".env.e2e.local", "utf8").match(/^\s*(?:export\s+)?E2E_ADMIN_STORE_ID\s*=\s*"?([^"\r\n]+)"?\s*$/m)?.[1]?.trim() ?? "e2e-admin-store";
process.env.NEXT_PUBLIC_API_URL = `http://localhost:${CORS_PORT}/api/${storeId}`;

const env = { ...storeServerEnv(process.env, { appEnvFile: STORE + ".env", context: "sandbox (tienda)" }), NODE_ENV: "production" };
env.NEXT_PUBLIC_BOLD_IDENTITY_KEY = sandboxEnv().NEXT_PUBLIC_BOLD_IDENTITY_KEY.trim();

if (process.env.SANDBOX_SKIP_BUILD !== "1") {
  const build = spawnSync("npx", ["next", "build"], { cwd: STORE, env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const guard = fileUrl(ADMIN + "scripts/lib/e2e-server-network.mjs");
const server = spawn("npx", ["next", "start", "-p", String(STORE_PORT)], {
  cwd: STORE,
  env: { ...env, NODE_OPTIONS: [env.NODE_OPTIONS, `--import ${guard}`].filter(Boolean).join(" ") },
  stdio: "inherit",
});
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
