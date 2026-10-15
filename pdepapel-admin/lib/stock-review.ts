import { PrismaClient, StockReservationStatus } from "@prisma/client";

import { runInBackground } from "@/lib/background";
import { recordReservationEvents } from "@/lib/reservation-events";

type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const HOLDING_STATUSES: StockReservationStatus[] = [StockReservationStatus.ACTIVE, StockReservationStatus.CONVERTED];

/**
 * Una venta pagada nunca se deshace (decisión 2026-10-14): si se llevó
 * unidades que una reserva guardaba, el producto de esa reserva queda «sin
 * respaldo» para que Paula decida. Se marcan los ítems más recientes primero
 * hasta cubrir lo que falta de cada pieza; el encabezado lo refleja si
 * alguno de sus ítems lo está. Devuelve las reservas marcadas.
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

  type Holding = { itemId: string | null; reservationId: string; storeId: string; productId: string; quantity: number; unbackedAt: Date | null; createdAt: Date };
  const flaggedLines = new Map<string, Holding>();
  for (const product of short) {
    let missing = Number(product.reservedUnits) - Math.max(0, Number(product.stock));
    const kits = await tx.productKit.findMany({ where: { componentId: product.id }, select: { kitId: true, quantity: true } });
    const perUnit = new Map<string, number>([[product.id, 1], ...kits.map((kit) => [kit.kitId, kit.quantity] as [string, number])]);
    const productIds = Array.from(perUnit.keys());
    const items = await tx.stockReservationItem.findMany({
      where: { productId: { in: productIds }, reservation: { status: { in: HOLDING_STATUSES } } },
      select: { id: true, reservationId: true, storeId: true, productId: true, quantity: true, unbackedAt: true, createdAt: true },
    });
    // Una reserva sin ítems (anterior al backfill) cuenta por su encabezado hasta la contracción.
    const headers = await tx.stockReservation.findMany({
      where: { productId: { in: productIds }, status: { in: HOLDING_STATUSES }, items: { none: {} } },
      select: { id: true, storeId: true, productId: true, quantity: true, unbackedAt: true, createdAt: true },
    });
    const holdings: Holding[] = [
      ...items.map((item) => ({ itemId: item.id, reservationId: item.reservationId, storeId: item.storeId, productId: item.productId, quantity: item.quantity, unbackedAt: item.unbackedAt, createdAt: item.createdAt })),
      ...headers.map((hold) => ({ itemId: null, reservationId: hold.id, storeId: hold.storeId, productId: hold.productId!, quantity: hold.quantity ?? 0, unbackedAt: hold.unbackedAt, createdAt: hold.createdAt })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    for (const holding of holdings) {
      if (missing <= 0) break;
      missing -= holding.quantity * (perUnit.get(holding.productId) ?? 1);
      if (!holding.unbackedAt) flaggedLines.set(holding.itemId ?? holding.reservationId, holding);
    }
  }

  const items = Array.from(flaggedLines.values());
  const flagged = Array.from(new Set(items.map((item) => item.reservationId)));
  if (flagged.length > 0) {
    const now = new Date();
    const itemIds = items.flatMap((item) => (item.itemId ? [item.itemId] : []));
    if (itemIds.length > 0) await tx.stockReservationItem.updateMany({ where: { id: { in: itemIds }, unbackedAt: null }, data: { unbackedAt: now } });
    await tx.stockReservation.updateMany({ where: { id: { in: flagged }, unbackedAt: null }, data: { unbackedAt: now } });
    await recordReservationEvents(tx, items.map((item) => ({ storeId: item.storeId, reservationId: item.reservationId, kind: "unbacked" as const, actor: "SYSTEM", productId: item.productId })));
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
