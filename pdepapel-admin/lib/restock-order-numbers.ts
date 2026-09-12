import type { Prisma, PrismaClient } from "@prisma/client";

import { nextRestockOrderNumber } from "@/lib/restock-orders";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Número de pedido siguiente para la tienda, leído dentro de la misma
 * transacción que lo va a usar. La unicidad la garantiza el índice
 * `[storeId, orderNumber]`: quien cree con este número y choque (dos pedidos
 * a la vez) recibe P2002 y debe reintentar la transacción completa.
 */
export async function allocateRestockOrderNumber(db: Db, storeId: string): Promise<string> {
  const rows = await db.restockOrder.findMany({
    where: { storeId },
    select: { orderNumber: true },
  });
  return nextRestockOrderNumber(rows.map((row) => row.orderNumber));
}

export function isOrderNumberCollision(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002" &&
    JSON.stringify((error as { meta?: unknown }).meta ?? "").includes("orderNumber")
  );
}

/** Reintenta una transacción de creación mientras el número choque (máx. 3). */
export async function withOrderNumberRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isOrderNumberCollision(error)) throw error;
    }
  }
  throw lastError;
}
