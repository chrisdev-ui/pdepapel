/**
 * Aislamiento de las pruebas (unitarias e integración): ninguna clave real y
 * ninguna salida a la red.
 *
 * Al importarse, `@prisma/client` copia el `.env` de la administración (el de
 * producción) en process.env para cada variable que no esté definida. Por eso
 * cada clave externa recibe aquí un valor de prueba antes de cualquier import
 * (vía `test.env` de las configuraciones de Vitest): definida, Prisma ya no la
 * pisa, y local y CI corren con el mismo entorno. Además de la lista fija,
 * cualquier otro nombre que aparezca en `.env` también se tapa; del archivo
 * solo se leen los nombres.
 *
 * `blockOutboundNetwork()` corta toda conexión TCP que no vaya a la máquina
 * local (fetch, http, https, axios, WebSocket: todos pasan por
 * net.Socket#connect). MySQL lo abre el motor nativo de Prisma, fuera de esto.
 */
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { parseEnv } from "node:util";

const STUB = "test-stub";

/** Valores de prueba con la forma que exige `lib/env.mjs` o el código que los lee. */
export const TEST_ENV_STUBS = Object.freeze({
  ADMIN_ALLOWED_USER_IDS: "",
  ADMIN_WEB_URL: "http://127.0.0.1:3001",
  BOLD_DATAFONO_IDENTITY_KEY: STUB,
  BOLD_DATAFONO_SECRET_KEY: STUB,
  BOLD_DATAFONO_SN: STUB,
  BOLD_DATAFONO_TAG: STUB,
  BOLD_ENVIRONMENT: "test",
  BOLD_SECRET_KEY: "test-stub-bold-secret",
  CHAKRA_API_KEY: STUB,
  CHAKRA_PLUGIN_ID: STUB,
  CHAKRA_WEBHOOK_SECRET: STUB,
  CLERK_SECRET_KEY: "sk_test_stub",
  // Base64 válido con el prefijo whsec_, como los de Clerk (Standard Webhooks).
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_dGVzdC1zdHViLWNsZXJrLXdlYmhvb2stc2VjcmV0",
  CLOUDFLARE_R2_ACCESS_KEY_ID: STUB,
  CLOUDFLARE_R2_ACCOUNT_ID: STUB,
  CLOUDFLARE_R2_BUCKET_NAME: STUB,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: STUB,
  // Enciende la venta de cápsulas solo en pruebas locales (`capsuleSalesEnabled`).
  CAPSULE_SALES_TEST_OVERRIDE: "1",
  CLOUDINARY_API_KEY: STUB,
  CLOUDINARY_API_SECRET: STUB,
  CLOUDINARY_CLOUD_NAME: STUB,
  CRON_SECRET: STUB,
  DUALHOOK_API_KEY: STUB,
  ENVIOCLICK_API_KEY: STUB,
  ENVIOCLICK_API_URL: "https://envioclick.stub.invalid",
  // min(24) en lib/env.mjs.
  ENVIOCLICK_WEBHOOK_SECRET: "test-stub-envioclick-webhook-secret",
  FRONTEND_STORE_URL: "http://127.0.0.1:3000",
  GA4_API_SECRET: STUB,
  GA4_MEASUREMENT_ID: "G-TESTSTUB",
  GEMINI_API_KEY: STUB,
  GOOGLE_MERCHANT_FEED_SECRET: "test-stub-google-merchant-feed-secret",
  INTERNAL_API_SECRET: STUB,
  KV_REST_API_READ_ONLY_TOKEN: STUB,
  KV_REST_API_TOKEN: STUB,
  KV_REST_API_URL: "https://kv.stub.invalid",
  KV_URL: "redis://127.0.0.1:6399",
  MERCADOLIBRE_CLIENT_ID: STUB,
  MERCADOLIBRE_CLIENT_SECRET: STUB,
  MERCADOLIBRE_OAUTH_REDIRECT_URI: "http://127.0.0.1:3001/api/integrations/mercadolibre/callback",
  MERCADOLIBRE_TOKEN_ENCRYPTION_KEY: "dGVzdC1zdHViLWtleS1vZi10aGlydHktdHdvLWJ5dGU=",
  META_CATALOG_FEED_SECRET: "test-stub-meta-catalog-feed-secret",
  META_IG_PAGE_TOKEN: STUB,
  MIPAQUETE_API_KEY: STUB,
  NEWSLETTER_EARLY_ACCESS_SECRET: "test-stub-newsletter-early-access",
  NEXT_PUBLIC_BOLD_IDENTITY_KEY: STUB,
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/",
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_stub",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/iniciar-sesion",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/crear-cuenta",
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: STUB,
  NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME: STUB,
  // Como en CI: las fotos reales, no los marcadores locales.
  NEXT_PUBLIC_CLOUDINARY_PLACEHOLDERS: "0",
  OPENAI_API_KEY: STUB,
  QSTASH_CURRENT_SIGNING_KEY: STUB,
  QSTASH_NEXT_SIGNING_KEY: STUB,
  QSTASH_TOKEN: STUB,
  QSTASH_URL: "https://qstash.stub.invalid",
  REDIS_URL: "redis://127.0.0.1:6399",
  RESEND_API_KEY: "re_test_stub",
  REVALIDATION_SECRET: STUB,
  SCHEDULER_SECRET: STUB,
  // Base64 de 32 bytes, como exige lib/token-crypto.
  SOCIAL_TOKEN_ENCRYPTION_KEY: "dGVzdC1zdHViLXNvY2lhbC10b2tlbi1rZXktMzJieXQ=",
  STORE_SENDER_ADDRESS: "Calle 123 # 45-67, Apto 101",
  STORE_SENDER_EMAIL: "envios@ejemplo.test",
  STORE_SENDER_FIRST_NAME: "Remitente",
  STORE_SENDER_LAST_NAME: "De Prueba",
  STORE_SENDER_PHONE: "3000000000",
  TIKTOK_CLIENT_KEY: STUB,
  TIKTOK_CLIENT_SECRET: STUB,
  TIKTOK_REDIRECT_URI: "http://127.0.0.1:3001/api/integrations/tiktok/callback",
  UPSTASH_REDIS_REST_TOKEN: STUB,
  UPSTASH_REDIS_REST_URL: "https://upstash.stub.invalid",
  WHATSAPP_ACCESS_TOKEN: STUB,
  WHATSAPP_APP_SECRET: STUB,
  WHATSAPP_BOT_APPROVER_USER_ID: STUB,
  WHATSAPP_PHONE_NUMBER_ID: STUB,
  // min(24) en lib/env.mjs.
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "test-stub-whatsapp-verify-token",
  WOMPI_API_KEY: STUB,
  WOMPI_API_SECRET: STUB,
  WOMPI_API_URL: "https://wompi.stub.invalid",
  WOMPI_EVENTS_KEY: STUB,
  WOMPI_INTEGRITY_KEY: STUB,
});

/** Las claves de redes sociales: también van a la tienda de las e2e, que no las lee pero no debe heredarlas. */
export const SOCIAL_TEST_ENV_STUBS = Object.freeze(
  Object.fromEntries(["META_IG_PAGE_TOKEN", "SOCIAL_TOKEN_ENCRYPTION_KEY", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"].map((name) => [name, TEST_ENV_STUBS[name]])),
);

/**
 * Interruptores: sin la clave la función se apaga (Turnstile no pide el
 * desafío, las métricas de Railway no se consultan). En CI no existen, así que
 * en las pruebas tampoco: un valor de prueba los encendería.
 * `tests/setup-isolation.ts` los borra después de que Prisma copie `.env`.
 */
export const ABSENT_IN_TESTS = Object.freeze([
  "RAILWAY_METRICS_TOKEN",
  "TURNSTILE_SECRET_KEY",
  // Avisos push: un valor de prueba los encendería con llaves inválidas.
  "NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_VAPID_SUBJECT",
]);

/** Lo que pone el arnés de pruebas (la base local) o el proceso, nunca un secreto. */
export const NOT_STUBBED = new Set(["NODE_ENV", "DATABASE_URL", "COPILOT_DATABASE_URL", "TEST_DATABASE_URL", "PRISMA_LOG", "CI"]);

/**
 * Los valores de prueba más un `test-stub` para cualquier otro nombre de
 * `envFile` (si existe), para que Prisma no traiga nada de ese archivo.
 */
export function testEnvStubs(envFile) {
  const stubs = { ...TEST_ENV_STUBS };
  if (envFile && existsSync(envFile)) {
    for (const name of Object.keys(parseEnv(readFileSync(envFile, "utf8")))) {
      if (!NOT_STUBBED.has(name) && !ABSENT_IN_TESTS.includes(name) && !(name in stubs)) stubs[name] = STUB;
    }
  }
  return stubs;
}

export class OutboundNetworkBlockedError extends Error {
  constructor(target) {
    super(`[pruebas] red bloqueada: ${target}. Las pruebas solo pueden conectarse a la máquina local; dobla la llamada con vi.mock.`);
    this.name = "OutboundNetworkBlockedError";
    this.code = "E_TEST_NETWORK_BLOCKED";
  }
}

export function isLocalHost(host) {
  if (!host) return true;
  const bare = String(host).replace(/^\[|\]$/g, "").toLowerCase();
  return bare === "localhost" || bare.endsWith(".localhost") || bare === "::1" || bare.startsWith("127.") || bare === "0.0.0.0" || bare === "::ffff:127.0.0.1";
}

/** El destino de una llamada a net.Socket#connect, o null si es un socket local (ruta IPC). */
function connectTarget(args) {
  const [first, second] = args;
  const options = Array.isArray(first) ? first[0] : first;
  if (options && typeof options === "object") {
    if (options.path) return null;
    return { host: options.host ?? "localhost", port: options.port };
  }
  if (typeof first === "string" && Number.isNaN(Number(first))) return null;
  return { host: typeof second === "string" ? second : "localhost", port: first };
}

const PATCHED = Symbol.for("pdepapel.testNetworkBlocked");

/** El host es uno de `allowHosts` o un subdominio suyo (nunca «evilclerk.accounts.dev.com»). */
export function isAllowedHost(host, allowHosts = []) {
  const name = String(host ?? "").toLowerCase();
  return allowHosts.some((suffix) => name === suffix || name.endsWith(`.${suffix}`));
}

/** `allowHosts`: hosts que sí pueden salir (el servidor de las e2e necesita Clerk de desarrollo). */
export function blockOutboundNetwork({ allowHosts = [] } = {}) {
  if (net.Socket.prototype[PATCHED]) return;
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function connect(...args) {
    const target = connectTarget(args);
    if (target && !isLocalHost(target.host) && !isAllowedHost(target.host, allowHosts)) {
      const error = new OutboundNetworkBlockedError(`${target.host}:${target.port ?? "?"}`);
      process.nextTick(() => this.destroy(error));
      return this;
    }
    return original.apply(this, args);
  };
  net.Socket.prototype[PATCHED] = true;
}
