/**
 * El entorno de la tienda de las e2e locales: cada nombre del `.env` de la
 * tienda pasa a un valor de prueba salvo Clerk (que debe ser de desarrollo), la
 * API es la administración local y, si queda algo de producción, no arranca.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { assertNoProductionLeaks } from "../../../pdepapel-admin/scripts/lib/e2e-production-leaks.mjs";
import { SOCIAL_TEST_ENV_STUBS } from "../../../pdepapel-admin/scripts/lib/test-isolation.mjs";

const STUB = "test-stub";
const KEEP = new Set([
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL",
]);

export function storeServerEnv(source, { appEnvFile, context = "e2e (tienda)" }) {
  const fromFile = existsSync(appEnvFile) ? parseEnv(readFileSync(appEnvFile, "utf8")) : {};
  const stubs = {};
  const env = { ...source };
  for (const name of Object.keys(fromFile)) {
    if (KEEP.has(name)) {
      env[name] ??= fromFile[name];
    } else {
      stubs[name] = name === "RESEND_API_KEY" ? "re_test_stub" : STUB;
      env[name] = stubs[name];
    }
  }
  for (const [name, value] of Object.entries(SOCIAL_TEST_ENV_STUBS)) {
    stubs[name] = value;
    env[name] = value;
  }
  if (!source.NEXT_PUBLIC_API_URL) throw new Error(`[${context}] Falta NEXT_PUBLIC_API_URL (la administración local).`);
  env.NEXT_PUBLIC_API_URL = source.NEXT_PUBLIC_API_URL;
  // Sin marcadores: apuntan a la cuenta de Cloudinary de la tienda.
  env.NEXT_PUBLIC_CLOUDINARY_PLACEHOLDERS = "0";
  env.NEXT_TELEMETRY_DISABLED = "1";
  // Las e2e purgan la caché de la tienda con este valor (`purgeStoreCache`).
  env.REVALIDATION_SECRET = STUB;
  if (!String(env.CLERK_SECRET_KEY ?? "").startsWith("sk_test_")) {
    throw new Error(`[${context}] La tienda de las e2e solo corre con claves de desarrollo de Clerk (sk_test_).`);
  }
  assertNoProductionLeaks(env, { appEnvFiles: [appEnvFile], stubs, context });
  return env;
}
