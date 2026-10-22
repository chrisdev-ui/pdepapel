/**
 * Última barrera antes de arrancar un servidor de las e2e (administración o
 * tienda): si su entorno trae algo de producción, la corrida no empieza. Solo
 * se informan nombres de variables, nunca valores.
 *
 * Dos reglas:
 * - nada heredado del `.env` real de la app (mismo valor), salvo las claves de
 *   Clerk de desarrollo y sus URL de páginas;
 * - nada con forma de producción aunque venga de otro lado: Upstash real,
 *   Resend, Clerk live, tokens de Meta, claves de TikTok, la llave de tokens
 *   de redes, secreto de GA4 MP, MiPaquete, Bold fuera de pruebas o una base
 *   que no sea `pdepapel_test` local.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { assertTestDatabaseUrl } from "./test-database.mjs";
import { TEST_ENV_STUBS } from "./test-isolation.mjs";

const STUB = "test-stub";
const CLERK_PAGE_URL = /^NEXT_PUBLIC_CLERK_(SIGN_IN|SIGN_UP|AFTER_SIGN_IN|AFTER_SIGN_UP)_URL$/;

function inheritanceAllowed(name, value) {
  if (name === "NODE_ENV" || CLERK_PAGE_URL.test(name)) return true;
  if (name === "CLERK_SECRET_KEY") return value.startsWith("sk_test_");
  if (name === "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") return value.startsWith("pk_test_");
  return false;
}

const realValue = (value) => Boolean(value) && value !== STUB && !value.startsWith(`${STUB}-`);
const RESEND_STUB = "re_test_stub";

function productionShape(name, value) {
  if (!value) return null;
  if (/upstash\.io/i.test(value)) return "Upstash";
  if (/\.rlwy\.net|railway\.app|railway\.internal/i.test(value)) return "base de producción";
  if (/^(sk|pk)_live_/.test(value)) return "Clerk live";
  if (/^re_[A-Za-z0-9]/.test(value) && value !== RESEND_STUB) return "Resend";
  if (/^EAA[A-Za-z0-9]{20,}/.test(value)) return "token de Meta";
  if (/(^|_)(META|WHATSAPP|FACEBOOK)_.*(TOKEN|SECRET)$/.test(name) && !/VERIFY_TOKEN$/.test(name) && realValue(value)) return "Meta";
  if (/^TIKTOK_.*(KEY|SECRET|TOKEN)$/.test(name) && realValue(value)) return "TikTok";
  if (name === "SOCIAL_TOKEN_ENCRYPTION_KEY" && value !== TEST_ENV_STUBS.SOCIAL_TOKEN_ENCRYPTION_KEY) return "llave de tokens de redes";
  if (name === "CLERK_WEBHOOK_SIGNING_SECRET" && value !== TEST_ENV_STUBS.CLERK_WEBHOOK_SIGNING_SECRET) return "secreto del webhook de Clerk";
  if (name === "GA4_API_SECRET" && realValue(value)) return "GA4 MP";
  if (name.startsWith("MIPAQUETE_") && realValue(value)) return "MiPaquete";
  if (name === "BOLD_ENVIRONMENT" && value !== "test") return "Bold fuera de pruebas";
  if (name === "DATABASE_URL" || name === "COPILOT_DATABASE_URL") {
    try {
      assertTestDatabaseUrl(value, { variable: name, context: "e2e" });
    } catch {
      return "base que no es pdepapel_test local";
    }
  }
  return null;
}

/**
 * Nombres (con el motivo) de lo que no puede llegar a un servidor de las e2e.
 * `stubs`: los valores de prueba que puso el arranque; uno que coincide con el
 * del `.env` (BOLD_ENVIRONMENT=test) no es herencia.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ appEnvFiles?: string[]; stubs?: Record<string, string> }} [options]
 * @returns {string[]}
 */
export function findProductionLeaks(env, { appEnvFiles = [], stubs = {} } = {}) {
  const leaks = new Set();
  for (const file of appEnvFiles) {
    if (!existsSync(file)) continue;
    for (const [name, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
      if (stubs[name] === value) continue;
      if (value && env[name] === value && !inheritanceAllowed(name, value)) leaks.add(`${name} (valor del .env real)`);
    }
  }
  for (const [name, value] of Object.entries(env)) {
    const reason = typeof value === "string" ? productionShape(name, value) : null;
    if (reason) leaks.add(`${name} (${reason})`);
  }
  return [...leaks].sort();
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ appEnvFiles?: string[]; stubs?: Record<string, string>; context?: string }} [options]
 */
export function assertNoProductionLeaks(env, { appEnvFiles = [], stubs = {}, context = "e2e" } = {}) {
  const leaks = findProductionLeaks(env, { appEnvFiles, stubs });
  if (leaks.length > 0) {
    throw new Error(`[${context}] El servidor de las e2e traería datos de producción; no arranca: ${leaks.join(", ")}`);
  }
}
