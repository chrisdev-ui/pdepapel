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
 * decenas de instancias superó el tope de MySQL en Railway (151 → P2024). Tres
 * conexiones por instancia con 20 s de espera reparten mejor el límite (ahora
 * 300) y una petición que no consigue conexión falla con un mensaje claro en
 * vez de colgarse.
 */
export const POOL_CONNECTION_LIMIT = 3;
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
