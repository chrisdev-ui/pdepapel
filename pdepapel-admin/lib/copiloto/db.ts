import { Prisma, PrismaClient } from "@prisma/client";

import { isCopilotConfigured } from "@/lib/copiloto/config";

/**
 * Cliente propio del copiloto, con el usuario `copilot_ro`: solo puede leer
 * las tablas y columnas que sus herramientas necesitan
 * (`prisma/manual-migrations/20261010_create_copilot_ro_user.sql`). Una
 * conexión por instancia y 5 s de espera: el copiloto nunca le quita
 * conexiones al panel.
 */
declare global {
  var copilotPrisma: PrismaClient | undefined;
}

export class CopilotNotConfiguredError extends Error {
  constructor() {
    super("El copiloto no está configurado");
    this.name = "CopilotNotConfiguredError";
  }
}

export function copilotDatabaseUrl(raw: string): string {
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "5");
  return url.toString();
}

export function getCopilotDb(): PrismaClient {
  if (!isCopilotConfigured()) throw new CopilotNotConfiguredError();
  if (!globalThis.copilotPrisma) {
    globalThis.copilotPrisma = new PrismaClient({
      datasourceUrl: copilotDatabaseUrl(process.env.COPILOT_DATABASE_URL as string),
      log: ["warn", "error"],
    });
  }
  return globalThis.copilotPrisma;
}

/** Tope por consulta: MySQL corta cualquier SELECT que pase de 3 s. */
export const COPILOT_QUERY_MAX_MS = 3000;

export type CopilotDb = Prisma.TransactionClient;

export type CopilotQueryError = "ocupado" | "lento" | "sin_permiso" | "error";

export class CopilotQueryFailure extends Error {
  constructor(readonly kind: CopilotQueryError) {
    super(kind);
    this.name = "CopilotQueryFailure";
  }
}

/** 1226: tope de conexiones del usuario; P2024: esperando conexión; 3024: consulta cortada; 1142/1143: sin permiso. */
export function classifyCopilotDbError(error: unknown): CopilotQueryError {
  const text = error instanceof Error ? `${(error as { code?: string }).code ?? ""} ${error.message}` : String(error);
  if (/P2024|\b1226\b|max_user_connections/i.test(text)) return "ocupado";
  if (/\b3024\b|maximum statement execution time/i.test(text)) return "lento";
  if (/\b114[23]\b|command denied|permission/i.test(text)) return "sin_permiso";
  return "error";
}

/**
 * Corre una herramienta en una transacción de solo lectura sobre la única
 * conexión, con el tope de tiempo puesto en esa misma sesión.
 */
export async function withCopilotQuery<T>(
  work: (db: CopilotDb) => Promise<T>,
  client: PrismaClient = getCopilotDb(),
): Promise<T> {
  try {
    return await client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET SESSION max_execution_time = ${COPILOT_QUERY_MAX_MS}`);
        return work(tx);
      },
      { timeout: 8000, maxWait: 5000 },
    );
  } catch (error) {
    if (error instanceof CopilotNotConfiguredError) throw error;
    const kind = classifyCopilotDbError(error);
    console.error("[COPILOTO_DB]", { kind, message: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    throw new CopilotQueryFailure(kind);
  }
}
