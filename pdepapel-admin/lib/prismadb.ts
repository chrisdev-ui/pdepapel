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

/** Añade `connection_limit` y `pool_timeout` a la URL salvo que ya vengan en ella. */
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
  if (!parsed.searchParams.has("connection_limit")) {
    parsed.searchParams.set("connection_limit", String(connectionLimit));
  }
  if (!parsed.searchParams.has("pool_timeout")) {
    parsed.searchParams.set("pool_timeout", String(poolTimeout));
  }
  return parsed.toString();
}

const datasourceUrl = withConnectionPoolParams(process.env.DATABASE_URL);

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
