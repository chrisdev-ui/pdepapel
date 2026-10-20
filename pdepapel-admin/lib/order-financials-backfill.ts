import { OrderStatus, OrderType, type Prisma } from "@prisma/client";

import { calculateOrderFinancials, getProductUnitCost } from "@/lib/financial";

type Db = Pick<Prisma.TransactionClient, "order" | "product">;

/**
 * Financieros de los pedidos pagados que nunca los tuvieron (decisión de
 * Christian, 2026-10-17). Antes del despliegue del 2026-09-10 (67fe2c52), crear
 * un pedido ya pagado desde el panel o marcarlo pagado en bloque no escribía
 * `paidAt` ni los financieros; `paidAt` se rellenó el 2026-09-12, el costo no.
 *
 * Se llenan con `calculateOrderFinancials` y el costo de compra ACTUAL (un kit
 * vale lo de sus piezas), la comisión de su pago y el envío guardado más el
 * recaudo. Solo compra: `productShippingCost`/`productShippingMissing` quedan
 * NULL («costo solo de compra»). Un pedido con alguna línea sin producto o sin
 * costo hoy no se escribe: va a revisión manual.
 */
export const ORDER_FINANCIALS_BACKFILL_WHERE = {
  status: { in: [OrderStatus.PAID, OrderStatus.SENT] },
  paidAt: { not: null },
  type: { not: OrderType.GIFT_CARD },
  totalProductCost: null,
  netProfit: null,
} satisfies Prisma.OrderWhereInput;

export interface OrderFinancialsRow {
  id: string;
  totalProductCost: number;
  gatewayFee: number | null;
  shippingCost: number;
  netProfit: number;
  profitMarginPct: number;
}

export interface OrderFinancialsPlan {
  rows: OrderFinancialsRow[];
  /** Pedidos que no se pueden rehacer completos con el costo de hoy. */
  manualReview: { id: string; reason: string }[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** `storeId` acota a una tienda (las pruebas); el guion corre sobre la base entera, que es de una sola tienda. */
export async function orderFinancialsPlan(db: Db, storeId?: string): Promise<OrderFinancialsPlan> {
  const orders = await db.order.findMany({
    where: { ...ORDER_FINANCIALS_BACKFILL_WHERE, ...(storeId ? { storeId } : {}) },
    include: {
      orderItems: {
        include: {
          product: {
            select: { acqPrice: true, isKit: true, kitComponents: { select: { quantity: true, component: { select: { acqPrice: true } } } } },
          },
        },
      },
      payment: { select: { method: true, details: true } },
      shipping: { select: { cost: true, codFee: true } },
    },
    orderBy: { id: "asc" },
  });

  const plan: OrderFinancialsPlan = { rows: [], manualReview: [] };
  for (const order of orders) {
    const missing = order.orderItems.filter((item) => {
      if (!item.productId || !item.product) return true;
      if (item.product.isKit) {
        return !item.product.kitComponents.length || item.product.kitComponents.some((piece) => !((piece.component?.acqPrice ?? 0) > 0));
      }
      return !(getProductUnitCost(item.product) > 0);
    });
    if (!order.orderItems.length || missing.length) {
      plan.manualReview.push({
        id: order.id,
        reason: !order.orderItems.length ? "sin líneas" : `${missing.length} de ${order.orderItems.length} líneas sin producto o sin costo hoy`,
      });
      continue;
    }
    const metrics = await calculateOrderFinancials(
      order as never,
      order.payment?.method,
      (order.shipping?.cost ?? 0) + (order.shipping?.codFee ?? 0),
      db,
      { purchaseOnly: true },
    );
    plan.rows.push({
      id: order.id,
      totalProductCost: round2(metrics.totalProductCost),
      gatewayFee: metrics.gatewayFee === null ? null : round2(metrics.gatewayFee),
      shippingCost: round2(metrics.shippingCost),
      netProfit: round2(metrics.netProfit),
      profitMarginPct: round2(metrics.profitMarginPct),
    });
  }
  return plan;
}

const planKey = (rows: readonly OrderFinancialsRow[]) => JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id)));

/**
 * Escribe el plan solo si, recalculado dentro de la transacción, es idéntico
 * al revisado (mismas filas, mismos valores) y suma `expectRows`; cada pedido
 * se escribe solo si sus dos campos siguen en NULL. Si algo no coincide, nada.
 */
export async function applyOrderFinancialsBackfill(
  expected: Pick<OrderFinancialsPlan, "rows">,
  expectRows: number,
  run: <T>(work: (tx: Db) => Promise<T>) => Promise<T>,
  storeId?: string,
) {
  if (!Number.isInteger(expectRows) || expectRows < 0) throw new Error("--expect-rows tiene que ser un entero de 0 en adelante.");
  if (expected.rows.length !== expectRows) throw new Error(`El plan tiene ${expected.rows.length} pedidos y se esperaban ${expectRows}; no se escribe nada.`);
  return run(async (tx) => {
    const current = await orderFinancialsPlan(tx, storeId);
    if (planKey(current.rows) !== planKey(expected.rows)) {
      throw new Error("Algún pedido o el costo de sus productos cambió desde el ensayo; vuelve a correr el ensayo. No se escribe nada.");
    }
    let written = 0;
    for (const row of expected.rows) {
      const { id, ...data } = row;
      const result = await tx.order.updateMany({ where: { id, totalProductCost: null, netProfit: null }, data });
      if (result.count !== 1) throw new Error(`El pedido ${id} ya tiene financieros; no se escribe nada.`);
      written += 1;
    }
    return { written };
  });
}
