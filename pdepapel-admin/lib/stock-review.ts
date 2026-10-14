import { PrismaClient, StockReservationStatus } from "@prisma/client";

import { runInBackground } from "@/lib/background";

type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const HOLDING_STATUSES: StockReservationStatus[] = [StockReservationStatus.ACTIVE, StockReservationStatus.CONVERTED];

/**
 * Una venta pagada nunca se deshace (decisión 2026-10-14): si se llevó
 * unidades que un apartado guardaba, el apartado queda «sin respaldo» para
 * que Paula decida. Se marcan los más recientes primero hasta cubrir lo que
 * falta de cada pieza. Devuelve los apartados marcados.
 */
export async function flagUnbackedReservations(tx: PrismaTx, productIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const rows = (await tx.product.findMany({
    where: { id: { in: ids }, reservedUnits: { gt: 0 } },
    select: { id: true, stock: true, reservedUnits: true },
  })) ?? [];
  const short = rows.filter((row) => row.reservedUnits > Math.max(0, row.stock));
  if (short.length === 0) return [];

  const flagged: string[] = [];
  for (const product of short) {
    let missing = Number(product.reservedUnits) - Math.max(0, Number(product.stock));
    const kits = await tx.productKit.findMany({ where: { componentId: product.id }, select: { kitId: true, quantity: true } });
    const perUnit = new Map<string, number>([[product.id, 1], ...kits.map((kit) => [kit.kitId, kit.quantity] as [string, number])]);
    const holds = await tx.stockReservation.findMany({
      where: { productId: { in: Array.from(perUnit.keys()) }, status: { in: HOLDING_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { id: true, productId: true, quantity: true, unbackedAt: true },
    });
    for (const hold of holds) {
      if (missing <= 0) break;
      missing -= hold.quantity * (perUnit.get(hold.productId) ?? 1);
      if (!hold.unbackedAt) flagged.push(hold.id);
    }
  }

  if (flagged.length > 0) {
    await tx.stockReservation.updateMany({ where: { id: { in: flagged }, unbackedAt: null }, data: { unbackedAt: new Date() } });
    runInBackground("aviso de apartados sin respaldo", async () =>
      (await import("@/lib/stock-review-alerts")).notifyUnbackedReservations(flagged),
    );
  }
  return flagged;
}

/**
 * Aviso de que un pedido se pagó sin unidades para alguna línea. Se llama
 * dentro de la transacción del pago y espera a que se confirme: si se
 * deshace, las incidencias no existen y no se avisa nada.
 */
export function scheduleStockShortfallAlert(storeId: string, orderId: string): void {
  runInBackground("aviso de pedido pagado sin stock", async () =>
    (await import("@/lib/stock-review-alerts")).notifyStockShortfall(storeId, orderId),
  );
}
