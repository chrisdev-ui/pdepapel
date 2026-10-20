/**
 * El entorno del servidor de las e2e, igual con `next dev` que con el build de
 * producción: la base de pruebas (con su guarda), las claves de prueba de las
 * unitarias salvo las de Clerk de desarrollo (sin ellas no hay sesión), sin
 * los interruptores, y la red cortada salvo la máquina local y Clerk
 * (`e2e-server-network.mjs`, cargado con `--import`). Ningún modo de prueba
 * llega a un servicio externo real.
 */
import { fileURLToPath } from "node:url";

import { assertNoProductionLeaks } from "./e2e-production-leaks.mjs";
import { assertTestDatabaseEnv } from "./test-database.mjs";
import { ABSENT_IN_TESTS, testEnvStubs } from "./test-isolation.mjs";

const KEEP = new Set(["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
const GUARD = new URL("./e2e-server-network.mjs", import.meta.url);

export function e2eServerEnv(source = process.env, context = "e2e") {
  assertTestDatabaseEnv(source, context);
  if (!source.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error(`[${context}] El servidor de las e2e solo corre con claves de desarrollo de Clerk (sk_test_).`);
  }
  const appEnvFile = fileURLToPath(new URL("../../.env", import.meta.url));
  const env = { ...source };
  const stubs = testEnvStubs(appEnvFile);
  for (const [name, value] of Object.entries(stubs)) {
    if (!KEEP.has(name)) env[name] = value;
  }
  for (const name of ABSENT_IN_TESTS) delete env[name];
  env.NEXT_TELEMETRY_DISABLED = "1";
  assertNoProductionLeaks(env, { appEnvFiles: [appEnvFile], stubs, context });
  return env;
}

/** Lo mismo más el corte de red, para el proceso que sirve las páginas. Una URL de archivo: la ruta lleva espacios. */
export function withNetworkGuard(env) {
  return { ...env, NODE_OPTIONS: [env.NODE_OPTIONS, `--import ${GUARD.href}`].filter(Boolean).join(" ") };
}
