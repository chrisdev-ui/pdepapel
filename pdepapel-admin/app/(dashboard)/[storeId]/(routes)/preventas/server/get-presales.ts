import { OrderPaymentKind, OrderPaymentStatus, OrderStatus, PresaleDepositType, PresalePaymentMode, ProductPresaleStatus } from "@prisma/client";

import {
  getHeldUnitsByPresale,
  getPresaleCapacity,
  isPresaleOverdue,
  PAID_PRESALE_LINE,
} from "@/lib/presale";
import { availableStock } from "@/lib/available-stock";
import { planPartialRelease, type PartialReleaseOrder } from "@/lib/presale-release";
import { getAmountDueNow, sumPrepaid, sumReceived } from "@/lib/order-payment-amounts";
import { RECONCILE_MAX_AGE_MS } from "@/lib/payment-reconciliation";
import { ONLINE_REFERENCE_PATTERN } from "@/lib/preorder-online-rules";
import prismadb from "@/lib/prismadb";
import { requireStoreRead } from "@/lib/store-access";
import { scrubPresales } from "@/lib/viewer-payloads";

/** Una fila de la pantalla de Preventas. */
export interface PresaleRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  status: ProductPresaleStatus;
  /** Null: «por confirmar» (o el texto de `expectedArrivalText`). */
  expectedArrivalAt: Date | null;
  expectedArrivalText: string | null;
  /** Sigue activa y la fecha ya pasó. */
  isOverdue: boolean;
  /** Null: sin tope. */
  unitLimit: number | null;
  committedUnits: number;
  remainingUnits: number | null;
  paymentMode: PresalePaymentMode;
  depositType: PresaleDepositType | null;
  depositValue: number | null;
  termsText: string | null;
  balanceDueDays: number | null;
  /** Unidades vendidas que todavía no se han liberado. */
  pendingUnits: number;
  /**
   * Unidades realmente pagadas, contadas una por una desde los pedidos.
   *
   * `committedUnits` es un contador que se suma en el webhook del pago. Si ese
   * apunte falla (la plata entra igual: nunca se tumba un pago por el
   * contador), las dos cifras dejan de coincidir. Esta es la de verdad.
   */
  paidUnits: number;
  /** `paidUnits - committedUnits`: distinto de cero = el contador se descuadró. */
  counterDrift: number;
  /** Apartadas por pedidos recientes sin pagar. */
  heldUnits: number;
  /** Pagadas por encima del tope: un pago nunca se rechaza, así que puede pasar. */
  overCapUnits: number;
  /** Clientas distintas esperando. */
  customerCount: number;
  /** Dinero ya cobrado por esas líneas: solo pedidos pagados completos. */
  collected: number;
  /** «Anticipos recibidos»: lo cobrado de pedidos con anticipo y saldo pendiente. Es plata de las clientas, no venta. */
  depositsReceived: number;
  /** Pedidos con anticipo recibido y saldo pendiente. */
  depositOrders: number;
  /** Ya llegó y falta «Pedir saldo» (poner el envío). */
  balanceToRequestOrders: number;
  /** Saldo pedido y sin pagar: cuántos pedidos y cuánto falta, con el envío. */
  balanceRequestedOrders: number;
  balanceOwed: number;
  /** Abonos o saldos pagados en línea que la pasarela todavía no confirma (dentro de su ventana). */
  onlinePendingCount: number;
  onlinePendingAmount: number;
  /** Lo que hay en bodega para la preventa: stock menos lo apartado para otras clientas. */
  productStock: number;
  canRelease: boolean;
  /** Llegó menos de lo vendido: «Liberar lo que llegó» suelta los pedidos más antiguos que caben. */
  canReleasePartial: boolean;
  partialReleaseUnits: number;
  partialReleaseOrders: number;
  partialUnfulfilledUnits: number;
  partialUnfulfilledOrders: number;
  /** Pedidos que quedaron «sin unidad» en una liberación a medias y siguen sin cancelar. */
  unfulfilledUnits: number;
  unfulfilledOrders: number;
  /** Lo anotado al cancelar pedidos de esta preventa (con anticipo o abonos). */
  refunded: number;
  retained: number;
  storeCredit: number;
  delayNotifiedAt: Date | null;
  releasedAt: Date | null;
}

export interface PresalesSummary {
  rows: PresaleRow[];
  activeUnits: number;
  collected: number;
  depositsReceived: number;
  customerCount: number;
  overdueCount: number;
  /** Pedidos «sin unidad» por cancelar con su devolución, en todas las preventas. */
  unfulfilledOrders: number;
  balanceOwed: number;
  onlinePendingCount: number;
  refunded: number;
  retained: number;
  storeCredit: number;
  /** Próxima fecha prometida que todavía no ha llegado. */
  nextArrivalAt: Date | null;
  nextArrivalProduct: string | null;
}

/**
 * Todo lo que la pantalla necesita, en dos consultas: las campañas y las
 * líneas vendidas. El dinero y las clientas se cuentan aquí y no en la tabla,
 * porque `committedUnits` es un contador de reservas, no de pedidos.
 *
 * Una cuenta de solo lectura la ve sin el dinero recibido: ese es plata de las
 * clientas que la tienda todavía debe. Le quedan el producto, las unidades
 * reservadas y para cuándo se espera, que es la señal de demanda.
 */
export async function getPresales(
  storeId: string,
  now = new Date(),
): Promise<PresalesSummary> {
  const access = await requireStoreRead(storeId);
  const isViewer = access.role === "viewer";
  const presales = await prismadb.productPresale.findMany({
    where: { storeId },
    orderBy: [{ status: "asc" }, { expectedArrivalAt: "asc" }],
    include: {
      product: { select: { id: true, name: true, sku: true, stock: true, reservedUnits: true } },
    },
  });

  const held = await getHeldUnitsByPresale(
    presales
      .filter((p) => p.status === ProductPresaleStatus.ACTIVE)
      .map((p) => p.id),
    { now },
  );

  const lines = presales.length
    ? await prismadb.orderItem.findMany({
        // Pagadas y nada más: «cobrado», clientas y pendientes por liberar
        // cuentan ventas, no carritos.
        where: {
          ...PAID_PRESALE_LINE,
          presaleId: { in: presales.map((presale) => presale.id) },
        },
        select: {
          presaleId: true,
          orderId: true,
          quantity: true,
          price: true,
          preorderReleasedAt: true,
          preorderUnfulfilledAt: true,
          order: {
            select: {
              status: true,
              depositPaidAt: true,
              paidAt: true,
              createdAt: true,
              depositAmount: true,
              paymentPlan: true,
              total: true,
              giftCardAmount: true,
              balanceRequestedAt: true,
              payments: { where: { status: OrderPaymentStatus.APPROVED }, select: { kind: true, status: true, amount: true } },
            },
          },
        },
      })
    : [];

  // Lo que se anotó al cancelar: esos pedidos ya no son «pagados», así que se
  // buscan aparte por sus filas de devolución, retención o saldo a favor.
  const settlementRows = presales.length
    ? await prismadb.orderPayment.findMany({
        where: {
          storeId,
          status: OrderPaymentStatus.APPROVED,
          kind: { in: [OrderPaymentKind.REFUND, OrderPaymentKind.RETAINED, OrderPaymentKind.STORE_CREDIT] },
          order: { orderItems: { some: { isPreorder: true, presaleId: { in: presales.map((presale) => presale.id) } } } },
        },
        select: {
          kind: true,
          amount: true,
          order: { select: { orderItems: { where: { isPreorder: true, presaleId: { not: null } }, select: { presaleId: true }, take: 1 } } },
        },
      })
    : [];
  // Pagos en línea (`-P<n>`) que la pasarela aún no confirma: los mismos que revisa la conciliación.
  const onlinePendingRows = presales.length
    ? await prismadb.orderPayment.findMany({
        where: {
          storeId,
          status: OrderPaymentStatus.PENDING,
          kind: { in: [OrderPaymentKind.INSTALLMENT, OrderPaymentKind.BALANCE] },
          gatewayReference: { not: null },
          createdAt: { gte: new Date(now.getTime() - RECONCILE_MAX_AGE_MS.Wompi) },
          order: { status: OrderStatus.DEPOSIT_PAID, orderItems: { some: { isPreorder: true, presaleId: { in: presales.map((presale) => presale.id) } } } },
        },
        select: {
          amount: true,
          method: true,
          createdAt: true,
          gatewayReference: true,
          order: { select: { orderItems: { where: { isPreorder: true, presaleId: { not: null } }, select: { presaleId: true }, take: 1 } } },
        },
      })
    : [];
  const onlinePending = new Map<string, { count: number; amount: number }>();
  for (const row of onlinePendingRows) {
    const id = row.order?.orderItems[0]?.presaleId;
    if (!id || !row.gatewayReference || !ONLINE_REFERENCE_PATTERN.test(row.gatewayReference)) continue;
    const window = row.method === "Bold" ? RECONCILE_MAX_AGE_MS.Bold : RECONCILE_MAX_AGE_MS.Wompi;
    if (now.getTime() - row.createdAt.getTime() > window) continue;
    const bucket = onlinePending.get(id) ?? { count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount += row.amount;
    onlinePending.set(id, bucket);
  }

  const settlements = new Map<string, { refunded: number; retained: number; storeCredit: number }>();
  for (const row of settlementRows) {
    const id = row.order?.orderItems[0]?.presaleId;
    if (!id) continue;
    const bucket = settlements.get(id) ?? { refunded: 0, retained: 0, storeCredit: 0 };
    if (row.kind === OrderPaymentKind.REFUND) bucket.refunded += row.amount;
    else if (row.kind === OrderPaymentKind.RETAINED) bucket.retained += row.amount;
    else bucket.storeCredit += row.amount;
    settlements.set(id, bucket);
  }

  const byPresale = new Map<
    string,
    {
      pending: number;
      paid: number;
      collected: number;
      deposits: number;
      orders: Set<string>;
      depositOrders: Set<string>;
      toRequest: Set<string>;
      requested: Set<string>;
      owed: number;
      unfulfilled: number;
      unfulfilledOrders: Set<string>;
      pendingByOrder: Map<string, PartialReleaseOrder>;
    }
  >();
  for (const line of lines) {
    if (!line.presaleId) continue;
    const bucket = byPresale.get(line.presaleId) ?? {
      pending: 0,
      paid: 0,
      collected: 0,
      deposits: 0,
      orders: new Set<string>(),
      depositOrders: new Set<string>(),
      toRequest: new Set<string>(),
      requested: new Set<string>(),
      owed: 0,
      unfulfilled: 0,
      unfulfilledOrders: new Set<string>(),
      pendingByOrder: new Map<string, PartialReleaseOrder>(),
    };
    // Lo cobrado cuenta lo vendido completo; con anticipo solo entró el anticipo,
    // una vez por pedido (la preventa con anticipo se compra sola).
    if (line.order?.status === OrderStatus.DEPOSIT_PAID) {
      // Lo que de verdad entró (anticipo + abonos), no el anticipo esperado.
      if (!bucket.depositOrders.has(line.orderId)) {
        bucket.deposits += sumPrepaid(line.order.payments);
        if (line.preorderReleasedAt !== null && line.order.balanceRequestedAt) {
          bucket.requested.add(line.orderId);
          bucket.owed += Math.max(0, getAmountDueNow(line.order, sumReceived(line.order.payments)));
        } else if (line.preorderReleasedAt !== null) {
          bucket.toRequest.add(line.orderId);
        }
      }
      bucket.depositOrders.add(line.orderId);
    } else {
      bucket.collected += line.price * line.quantity;
    }
    bucket.paid += line.quantity;
    bucket.orders.add(line.orderId);
    if (line.preorderReleasedAt === null && line.preorderUnfulfilledAt !== null) {
      bucket.unfulfilled += line.quantity;
      bucket.unfulfilledOrders.add(line.orderId);
    } else if (line.preorderReleasedAt === null) {
      bucket.pending += line.quantity;
      const pendingOrder = bucket.pendingByOrder.get(line.orderId);
      if (pendingOrder) pendingOrder.units += line.quantity;
      else
        bucket.pendingByOrder.set(line.orderId, {
          orderId: line.orderId,
          units: line.quantity,
          paidAt: line.order?.depositPaidAt ?? line.order?.paidAt ?? line.order?.createdAt ?? new Date(0),
        });
    }
    byPresale.set(line.presaleId, bucket);
  }

  const rows: PresaleRow[] = presales.map((presale) => {
    const bucket = byPresale.get(presale.id);
    const pendingUnits = bucket?.pending ?? 0;
    const paidUnits = bucket?.paid ?? 0;
    const heldUnits = held.get(presale.id) ?? 0;
    const capacity = getPresaleCapacity({ ...presale, heldUnits });
    const free = availableStock(presale.product);
    const isActive = presale.status === ProductPresaleStatus.ACTIVE;
    const plan = planPartialRelease(Array.from(bucket?.pendingByOrder.values() ?? []), free);
    const money = settlements.get(presale.id);
    const online = onlinePending.get(presale.id);

    return {
      id: presale.id,
      productId: presale.productId,
      productName: presale.product.name,
      productSku: presale.product.sku,
      status: presale.status,
      expectedArrivalAt: presale.expectedArrivalAt,
      expectedArrivalText: presale.expectedArrivalText,
      isOverdue: isPresaleOverdue(presale, now),
      unitLimit: presale.unitLimit,
      committedUnits: presale.committedUnits,
      remainingUnits: capacity.remaining,
      paymentMode: presale.paymentMode,
      depositType: presale.depositType,
      depositValue: presale.depositValue,
      termsText: presale.termsText,
      balanceDueDays: presale.balanceDueDays,
      pendingUnits,
      paidUnits,
      counterDrift: paidUnits - presale.committedUnits,
      heldUnits,
      overCapUnits: capacity.overCap,
      customerCount: bucket?.orders.size ?? 0,
      collected: bucket?.collected ?? 0,
      depositsReceived: bucket?.deposits ?? 0,
      depositOrders: bucket?.depositOrders.size ?? 0,
      balanceToRequestOrders: bucket?.toRequest.size ?? 0,
      balanceRequestedOrders: bucket?.requested.size ?? 0,
      balanceOwed: bucket?.owed ?? 0,
      onlinePendingCount: online?.count ?? 0,
      onlinePendingAmount: online?.amount ?? 0,
      productStock: free,
      canRelease: isActive && pendingUnits > 0 && free >= pendingUnits,
      canReleasePartial: isActive && pendingUnits > 0 && free < pendingUnits && plan.releaseUnits > 0,
      partialReleaseUnits: plan.releaseUnits,
      partialReleaseOrders: plan.releaseOrderIds.length,
      partialUnfulfilledUnits: plan.unfulfilledUnits,
      partialUnfulfilledOrders: plan.unfulfilledOrderIds.length,
      unfulfilledUnits: bucket?.unfulfilled ?? 0,
      unfulfilledOrders: bucket?.unfulfilledOrders.size ?? 0,
      refunded: money?.refunded ?? 0,
      retained: money?.retained ?? 0,
      storeCredit: money?.storeCredit ?? 0,
      delayNotifiedAt: presale.delayNotifiedAt,
      releasedAt: presale.releasedAt,
    };
  });

  const active = rows.filter(
    (row) => row.status === ProductPresaleStatus.ACTIVE,
  );
  const upcoming = active
    .filter((row): row is PresaleRow & { expectedArrivalAt: Date } => !row.isOverdue && row.expectedArrivalAt !== null)
    .sort(
      (a, b) => a.expectedArrivalAt.getTime() - b.expectedArrivalAt.getTime(),
    );

  return {
    rows: isViewer ? (scrubPresales(rows as any[]) as PresaleRow[]) : rows,
    activeUnits: active.reduce((total, row) => total + row.pendingUnits, 0),
    collected: isViewer ? 0 : active.reduce((total, row) => total + row.collected, 0),
    depositsReceived: isViewer ? 0 : active.reduce((total, row) => total + row.depositsReceived, 0),
    customerCount: active.reduce((total, row) => total + row.customerCount, 0),
    overdueCount: active.filter((row) => row.isOverdue).length,
    unfulfilledOrders: rows.reduce((total, row) => total + row.unfulfilledOrders, 0),
    balanceOwed: isViewer ? 0 : rows.reduce((total, row) => total + row.balanceOwed, 0),
    onlinePendingCount: rows.reduce((total, row) => total + row.onlinePendingCount, 0),
    refunded: isViewer ? 0 : rows.reduce((total, row) => total + row.refunded, 0),
    retained: isViewer ? 0 : rows.reduce((total, row) => total + row.retained, 0),
    storeCredit: isViewer ? 0 : rows.reduce((total, row) => total + row.storeCredit, 0),
    nextArrivalAt: upcoming[0]?.expectedArrivalAt ?? null,
    nextArrivalProduct: upcoming[0]?.productName ?? null,
  };
}
