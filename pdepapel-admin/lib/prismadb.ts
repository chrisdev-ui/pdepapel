import { MAX_WAIT_TIME, TIMEOUT_TIME } from "@/constants";
import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

export function getPrismaLogLevels(
  environment = process.env.NODE_ENV,
): Prisma.LogLevel[] {
  return environment === "production"
    ? ["warn", "error"]
    : ["query", "info", "warn", "error"];
}

/**
 * Tamaño del pool por instancia de función. En Vercel cada instancia abre su
 * propio pool y el valor por defecto de Prisma (CPU × 2 + 1) multiplicado por
 * decenas de instancias superó el tope de MySQL en Railway (151 → P2024). Con
 * un pool acotado y 20 s de espera una petición que no consigue conexión falla
 * con un mensaje claro en vez de colgarse.
 *
 * 3 → 6 (auditoría 2026-10-06): con 3, una petición de catálogo de 25–60
 * consultas corría en tandas de tres. El pico histórico de MySQL fue de 85
 * conexiones (2026-09-15, con 3 por instancia ≈ 28 instancias); con 6 ese
 * mismo pico sería ≈ 168 de las 300 permitidas (56 %). No se sube a 8 porque
 * el firewall todavía no bloquea bots y los picos pueden volver. Se puede
 * revisar cuando estén la regla de bots y la invalidación de caché por slug.
 * Prisma abre las conexiones a medida que las necesita: una instancia ociosa
 * no llega al tope. Si la DATABASE_URL de Vercel ya trae `connection_limit`,
 * manda ese valor (ver withConnectionPoolParams).
 */
export const POOL_CONNECTION_LIMIT = 6;
export const POOL_TIMEOUT_SECONDS = 20;
/**
 * Una instancia de Vercel que se congela deja sus conexiones abiertas en
 * MySQL con sus sentencias preparadas. Las vivas cierran las ociosas en un
 * minuto y renuevan las largas; las huérfanas las corta `wait_timeout`.
 */
export const POOL_MAX_IDLE_SECONDS = 60;
export const POOL_MAX_LIFETIME_SECONDS = 900;

const POOL_PARAM_NAMES = [
  "connection_limit",
  "pool_timeout",
  "max_idle_connection_lifetime",
  "max_connection_lifetime",
] as const;

/** Completa los parámetros del pool que la URL no trae; los de la URL mandan. */
export function withConnectionPoolParams(
  url: string | undefined,
  { connectionLimit = POOL_CONNECTION_LIMIT, poolTimeout = POOL_TIMEOUT_SECONDS } = {},
): string | undefined {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const defaults: Record<(typeof POOL_PARAM_NAMES)[number], number> = {
    connection_limit: connectionLimit,
    pool_timeout: poolTimeout,
    max_idle_connection_lifetime: POOL_MAX_IDLE_SECONDS,
    max_connection_lifetime: POOL_MAX_LIFETIME_SECONDS,
  };
  for (const name of POOL_PARAM_NAMES) {
    if (!parsed.searchParams.has(name)) parsed.searchParams.set(name, String(defaults[name]));
  }
  return parsed.toString();
}

/** Pool efectivo para el registro: solo los parámetros, nunca host ni credenciales. */
export function describeConnectionPool(url: string | undefined) {
  if (!url || !URL.canParse(url)) return null;
  const original = new URL(url).searchParams;
  const params = new URL(withConnectionPoolParams(url) as string).searchParams;
  return {
    ...Object.fromEntries(POOL_PARAM_NAMES.map((name) => [name, params.get(name)])),
    fromUrl: POOL_PARAM_NAMES.filter((name) => original.has(name)),
  };
}

const datasourceUrl = withConnectionPoolParams(process.env.DATABASE_URL);
if (process.env.NODE_ENV === "production" && !globalThis.prisma) {
  console.info("[PRISMA_POOL]", describeConnectionPool(process.env.DATABASE_URL));
}

const prismadb =
  globalThis.prisma ||
  new PrismaClient({
    log: getPrismaLogLevels(),
    ...(datasourceUrl ? { datasourceUrl } : {}),
    transactionOptions: {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: MAX_WAIT_TIME,
      timeout: TIMEOUT_TIME,
    },
  });

if (process.env.NODE_ENV !== "production") globalThis.prisma = prismadb;

export default prismadb;
