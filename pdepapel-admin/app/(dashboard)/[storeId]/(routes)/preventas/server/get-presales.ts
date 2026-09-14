import { ProductPresaleStatus } from "@prisma/client";

import { getPresaleCapacity, isPresaleOverdue } from "@/lib/presale";
import prismadb from "@/lib/prismadb";

/** Una fila de la pantalla de Preventas. */
export interface PresaleRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  status: ProductPresaleStatus;
  expectedArrivalAt: Date;
  /** Sigue activa y la fecha ya pasó. */
  isOverdue: boolean;
  unitLimit: number;
  committedUnits: number;
  remainingUnits: number;
  /** Unidades vendidas que todavía no se han liberado. */
  pendingUnits: number;
  /** Clientas distintas esperando. */
  customerCount: number;
  /** Dinero ya cobrado por esas líneas. */
  collected: number;
  /** Stock real hoy: dice si ya se puede liberar. */
  productStock: number;
  canRelease: boolean;
  delayNotifiedAt: Date | null;
  releasedAt: Date | null;
}

export interface PresalesSummary {
  rows: PresaleRow[];
  activeUnits: number;
  collected: number;
  customerCount: number;
  overdueCount: number;
  /** Próxima fecha prometida que todavía no ha llegado. */
  nextArrivalAt: Date | null;
  nextArrivalProduct: string | null;
}

/**
 * Todo lo que la pantalla necesita, en dos consultas: las campañas y las
 * líneas vendidas. El dinero y las clientas se cuentan aquí y no en la tabla,
 * porque `committedUnits` es un contador de reservas, no de pedidos.
 */
export async function getPresales(storeId: string, now = new Date()): Promise<PresalesSummary> {
  const presales = await prismadb.productPresale.findMany({
    where: { storeId },
    orderBy: [{ status: "asc" }, { expectedArrivalAt: "asc" }],
    include: { product: { select: { id: true, name: true, sku: true, stock: true } } },
  });

  const lines = presales.length
    ? await prismadb.orderItem.findMany({
        where: { presaleId: { in: presales.map((presale) => presale.id) }, isPreorder: true },
        select: {
          presaleId: true,
          orderId: true,
          quantity: true,
          price: true,
          preorderReleasedAt: true,
        },
      })
    : [];

  const byPresale = new Map<
    string,
    { pending: number; collected: number; orders: Set<string> }
  >();
  for (const line of lines) {
    if (!line.presaleId) continue;
    const bucket =
      byPresale.get(line.presaleId) ??
      { pending: 0, collected: 0, orders: new Set<string>() };
    // Lo cobrado cuenta todo lo vendido; lo pendiente solo lo que falta salir.
    bucket.collected += line.price * line.quantity;
    bucket.orders.add(line.orderId);
    if (line.preorderReleasedAt === null) bucket.pending += line.quantity;
    byPresale.set(line.presaleId, bucket);
  }

  const rows: PresaleRow[] = presales.map((presale) => {
    const bucket = byPresale.get(presale.id);
    const pendingUnits = bucket?.pending ?? 0;
    const capacity = getPresaleCapacity(presale);

    return {
      id: presale.id,
      productId: presale.productId,
      productName: presale.product.name,
      productSku: presale.product.sku,
      status: presale.status,
      expectedArrivalAt: presale.expectedArrivalAt,
      isOverdue: isPresaleOverdue(presale, now),
      unitLimit: presale.unitLimit,
      committedUnits: presale.committedUnits,
      remainingUnits: capacity.remaining,
      pendingUnits,
      customerCount: bucket?.orders.size ?? 0,
      collected: bucket?.collected ?? 0,
      productStock: presale.product.stock,
      canRelease:
        presale.status === ProductPresaleStatus.ACTIVE &&
        pendingUnits > 0 &&
        presale.product.stock >= pendingUnits,
      delayNotifiedAt: presale.delayNotifiedAt,
      releasedAt: presale.releasedAt,
    };
  });

  const active = rows.filter((row) => row.status === ProductPresaleStatus.ACTIVE);
  const upcoming = active
    .filter((row) => !row.isOverdue)
    .sort((a, b) => a.expectedArrivalAt.getTime() - b.expectedArrivalAt.getTime());

  return {
    rows,
    activeUnits: active.reduce((total, row) => total + row.pendingUnits, 0),
    collected: active.reduce((total, row) => total + row.collected, 0),
    customerCount: active.reduce((total, row) => total + row.customerCount, 0),
    overdueCount: active.filter((row) => row.isOverdue).length,
    nextArrivalAt: upcoming[0]?.expectedArrivalAt ?? null,
    nextArrivalProduct: upcoming[0]?.productName ?? null,
  };
}
