import { OrderStatus, ProductPresaleStatus, type Prisma } from "@prisma/client";

import { availableStock, type StockCounts } from "@/lib/available-stock";

type OwedDb = Pick<Prisma.TransactionClient, "orderItem" | "productPresale">;

/**
 * Unidades ya cobradas (anticipo o pago completo) en una preventa ABIERTA que
 * todavía no se han entregado, por producto. Son de esas clientas: la
 * mercancía que llega antes de «Liberar» no se vende en el punto de venta,
 * en una feria, en un pedido del panel ni en un apartado.
 *
 * Las líneas «sin unidad» no cuentan (la campaña ya se liberó y son
 * devoluciones), y una preventa liberada o cancelada ya no debe nada. Un kit
 * no puede tener preventa, así que basta mirar el producto de la línea.
 */
export async function owedPresaleUnits(db: OwedDb, productIds: readonly string[]): Promise<Map<string, number>> {
  const owed = new Map<string, number>();
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (ids.length === 0) return owed;

  const presales = await db.productPresale.findMany({
    where: { productId: { in: ids }, status: ProductPresaleStatus.ACTIVE },
    select: { id: true },
  });
  if (presales.length === 0) return owed;

  const rows = await db.orderItem.groupBy({
    by: ["productId"],
    where: {
      presaleId: { in: presales.map((presale) => presale.id) },
      isPreorder: true,
      preorderReleasedAt: null,
      preorderUnfulfilledAt: null,
      order: { status: { in: [OrderStatus.PAID, OrderStatus.DEPOSIT_PAID] } },
    },
    _sum: { quantity: true },
  });
  for (const row of rows) {
    if (row.productId) owed.set(row.productId, row._sum.quantity ?? 0);
  }
  return owed;
}

/** Lo que de verdad se puede vender hoy: stock menos apartados menos lo que se debe a una preventa abierta. */
export function sellableStock(product: StockCounts, owedUnits = 0): number {
  return Math.max(0, availableStock(product) - Math.max(0, owedUnits));
}

export const OWED_TO_PRESALE_NOTE = "lo demás es de clientas de la preventa: se entrega al pulsar «Liberar»";
