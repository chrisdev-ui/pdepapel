// Administración local para el sandbox de pagos: build de producción (los
// correos de pedido no salen bajo `next dev`) sobre la base de pruebas, con el
// entorno de las e2e (claves de prueba, Upstash falso) más las llaves de PRUEBA
// de Wompi y Bold de .env.sandbox.local, que se validan por prefijo y nunca se
// imprimen. Se corre así (ver AGENTS.md › Sandbox de pagos):
//   node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs node scripts/payments-sandbox/admin-server.mjs
// SANDBOX_SKIP_BUILD=1 reutiliza el último build; SANDBOX_STORE_URL es la URL
// https de la tienda (Wompi rechaza un redirect-url con http://localhost).
import { spawn, spawnSync } from "node:child_process";

import { e2eServerEnv } from "../lib/e2e-server-env.mjs";
import { startFakeUpstash, withFakeUpstash } from "../lib/fake-upstash.mjs";
import { ADMIN, ADMIN_PORT, STORE_PORT, UPSTASH_PORT, WORK, fileUrl, sandboxEnv } from "./paths.mjs";

const sandbox = sandboxEnv();
const RULES = {
  WOMPI_API_URL: (v) => v === "https://sandbox.wompi.co/v1",
  WOMPI_API_KEY: (v) => v.startsWith("pub_test_"),
  WOMPI_API_SECRET: (v) => v.startsWith("prv_test_"),
  WOMPI_EVENTS_KEY: (v) => v.startsWith("test_events_"),
  WOMPI_INTEGRITY_KEY: (v) => v.startsWith("test_integrity_"),
  BOLD_ENVIRONMENT: (v) => v === "test",
  BOLD_SECRET_KEY: (v) => v.length > 10,
  NEXT_PUBLIC_BOLD_IDENTITY_KEY: (v) => v.length > 10,
};
const bad = Object.entries(RULES)
  .filter(([name, ok]) => !sandbox[name] || !ok(sandbox[name].trim()))
  .map(([name]) => name);
if (bad.length) {
  console.error("[sandbox] faltan o no son de prueba:", bad.join(", "));
  process.exit(1);
}

const upstash = await startFakeUpstash({ port: UPSTASH_PORT });
const env = withFakeUpstash({ ...e2eServerEnv(process.env, "sandbox de pagos"), NEXT_DIST_DIR: ".next-sandbox" }, upstash.url);
for (const name of Object.keys(RULES)) env[name] = sandbox[name].trim();
env.FRONTEND_STORE_URL = process.env.SANDBOX_STORE_URL || `http://localhost:${STORE_PORT}`;
env.SANDBOX_MAIL_LOG = WORK + "mail.jsonl";
env.NODE_OPTIONS = [env.NODE_OPTIONS, `--import ${fileUrl(ADMIN + "scripts/payments-sandbox/guard.mjs")}`].filter(Boolean).join(" ");

// El build baja fuentes de Google: corre sin el corte de red, que solo vale para el servidor.
const { NODE_OPTIONS: _guard, ...buildEnv } = env;
if (process.env.SANDBOX_SKIP_BUILD !== "1") {
  const build = spawnSync("npx", ["next", "build"], { cwd: ADMIN, env: { ...buildEnv, NODE_ENV: "production" }, stdio: "inherit" });
  if (build.status !== 0) {
    upstash.close();
    process.exit(build.status ?? 1);
  }
}

// Los avisos de pago solo salen con VERCEL_ENV=production (lib/payment-webhook-alert.ts); solo en el servidor.
const server = spawn("npx", ["next", "start", "-p", String(ADMIN_PORT)], {
  cwd: ADMIN,
  env: { ...env, NODE_ENV: "production", VERCEL_ENV: "production" },
  stdio: "inherit",
});
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => {
  upstash.close();
  process.exit(code ?? 0);
});
