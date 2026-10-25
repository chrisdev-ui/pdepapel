import { OrderInventoryIssueKind, OrderStatus, OrderType, PaymentMethod, Prisma, ShippingStatus } from "@prisma/client";

import { runInBackground } from "@/lib/background";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { withoutDrawnCapsuleUnits } from "@/lib/capsule-cancel";
import { applyCapsulePayment } from "@/lib/capsule-payment";
import { markWelcomeBenefitRedeemed, releaseWelcomeBenefitReservation } from "@/lib/customer-benefits";
import { sendOrderEmail } from "@/lib/email";
import { calculateOrderFinancials } from "@/lib/financial";
import { keepTerminalMarker } from "@/lib/gateway-fees";
import { deliverGiftCard } from "@/lib/gift-card-delivery";
import { getAmountDue } from "@/lib/gift-card-amounts";
import { handleGiftCardOnOrderCancellation, issueGiftCardForOrder, redeemGiftCardForOrder, type IssuedGiftCard } from "@/lib/gift-cards";
import { recordPaidOrderInGoogleAnalytics } from "@/lib/google-analytics";
import { createGuideInBackground } from "@/lib/guide-background";
import { createInventoryMovementBatchResilient } from "@/lib/inventory";
import { blocksLatePaymentRevival, flagPaymentOnCancelledOrder, notifyLatePaymentRevival } from "@/lib/late-payment";
import { recordInventoryIssues } from "@/lib/order-inventory-issues";
import { explodeKitMovements } from "@/lib/order-stock-movements";
import { releasePresaleLinesOnCancellation, settlePresaleLinesOnPayment } from "@/lib/presale";
import prismadb from "@/lib/prismadb";
import { saleMovementType } from "@/lib/sale-movement-type";
import { SHIPPING_WITHOUT_GUIDE_PDF } from "@/lib/shipping-guide-pdf";

/**
 * Una sola implementación de «pago confirmado» y «pago anulado» para los
 * webhooks de Bold y Wompi y la conciliación de cada hora. El único candado
 * es el `updateMany` con guarda de estado dentro de `$transaction`: quien
 * llega segundo (webhook repetido, cron después del webhook o al revés) ve
 * `count = 0` y no descuenta, emite ni avisa nada otra vez.
 *
 * Reglas iguales para las dos pasarelas (lote de pagos del 2026-10-26):
 * 1. Un pago aprobado sobre un pedido cancelado lo reactiva, salvo tarjetas de
 *    regalo y fraude (`blocksLatePaymentRevival`, que se marcan con
 *    `flagPaymentOnCancelledOrder`). Al reactivar se avisa al panel; si el
 *    stock ya no alcanza, el pedido queda pagado con la incidencia DECREMENT
 *    («pagado sin stock») y nunca en negativo.
 * 2. El envío que entra a los financieros es `Shipping.cost + codFee`, como el
 *    PATCH del panel.
 * 3. El movimiento de stock es `saleMovementType(order.type)`.
 * 4. Al anular un pagado el cupón sigue en el pedido y su uso se descuenta.
 * 5. `CREATED → PENDING` solo existe para Wompi: Bold no manda eventos
 *    intermedios (los desconocidos se reconocen con 200) y la conciliación no
 *    cambia nada mientras la pasarela diga «en curso».
 */
export type SettlementProvider = "Bold" | "Wompi";
export type SettlementSource = "webhook" | "reconciliation";

export const SETTLEMENT_ORDER_INCLUDE = {
  orderItems: { include: { product: true } },
  payment: true,
  coupon: { select: { id: true, isWelcomeBenefit: true } },
  shipping: SHIPPING_WITHOUT_GUIDE_PDF,
} satisfies Prisma.OrderInclude;

export type SettlementOrder = Prisma.OrderGetPayload<{ include: typeof SETTLEMENT_ORDER_INCLUDE }>;

export function loadOrderForSettlement(where: Prisma.OrderWhereInput) {
  return prismadb.order.findFirst({ where, include: SETTLEMENT_ORDER_INCLUDE });
}

const PROVIDERS = {
  Bold: {
    method: PaymentMethod.Bold,
    createdBy: "SYSTEM_BOLD",
    tag: "[BOLD_WEBHOOK]",
    paidReason: (order: SettlementOrder, transactionId: string | null) =>
      order.type === OrderType.POINT_OF_SALE
        ? `Venta presencial (datáfono): pago confirmado ${transactionId ?? "sin referencia"}`
        : `Bold: pago confirmado ${transactionId ?? "sin referencia"}`,
    cancelReason: (transactionId: string | null) => `Bold: pago anulado ${transactionId ?? "sin referencia"}`,
  },
  Wompi: {
    method: PaymentMethod.Wompi,
    createdBy: "SYSTEM_WOMPI",
    tag: "[WOMPI_WEBHOOK]",
    paidReason: (_order: SettlementOrder, transactionId: string | null) => `Wompi: Pago confirmado ${transactionId}`,
    cancelReason: (transactionId: string | null) => `Wompi: Transacción anulada/error ${transactionId}`,
  },
} as const;

const viaSource = (text: string, source: SettlementSource) => (source === "reconciliation" ? `${text} (conciliación)` : text);

export interface SettlementInput {
  order: SettlementOrder;
  provider: SettlementProvider;
  /** Sin referencia del proveedor se guarda null: nunca un número inventado. */
  transactionId: string | null;
  /** El texto de `PaymentDetails.details` de cada pasarela. */
  detailsText: string;
  source?: SettlementSource;
}

export type SettlementOutcome = "applied" | "already" | "late-on-cancelled";

export interface PaidSettlement {
  outcome: SettlementOutcome;
  revived: boolean;
  /** Líneas que quedaron sin descontar (incidencias DECREMENT abiertas por este pago). */
  stockShortfall: number;
}

type Tx = Prisma.TransactionClient;

async function writePaymentDetails(tx: Tx, input: SettlementInput) {
  const { order, provider, transactionId, detailsText } = input;
  await tx.paymentDetails.upsert({
    where: { orderId: order.id },
    update: {
      transactionId,
      // Bold reescribe el detalle sin perder la marca del datáfono.
      details: provider === "Bold" ? keepTerminalMarker(order.payment?.details, detailsText) : detailsText,
    },
    create: {
      method: PROVIDERS[provider].method,
      transactionId,
      details: detailsText,
      store: { connect: { id: order.storeId } },
      order: { connect: { id: order.id } },
    },
  });
}

async function trackPurchase(orderId: string, provider: SettlementProvider) {
  try {
    await recordPaidOrderInGoogleAnalytics(orderId);
  } catch (analyticsError) {
    console.error(`${PROVIDERS[provider].tag} GA4 purchase tracking failed:`, analyticsError);
  }
}

/** Después de confirmar: GA4, la guía de EnvioClick y el correo, sobre el pedido recién releído. */
async function runSettlementSideEffects(orderId: string, status: OrderStatus, provider: SettlementProvider, source: SettlementSource) {
  const updatedOrder = await prismadb.order.findUnique({
    where: { id: orderId },
    include: { payment: true, shipping: SHIPPING_WITHOUT_GUIDE_PDF, orderItems: { include: { product: true } } },
  });
  if (!updatedOrder) return;

  if (updatedOrder.status === OrderStatus.PAID) await trackPurchase(updatedOrder.id, provider);

  if (
    updatedOrder.status === OrderStatus.PAID &&
    updatedOrder.shipping &&
    !updatedOrder.shipping.envioClickIdOrder &&
    updatedOrder.shipping.envioClickIdRate
  ) {
    createGuideInBackground({
      orderId: updatedOrder.id,
      storeId: updatedOrder.storeId,
      source: source === "reconciliation" ? `conciliación de ${provider}` : `webhook de ${provider}`,
    });
  }

  await sendOrderEmail(updatedOrder.id, status);
}

export async function settlePaidPayment(input: SettlementInput): Promise<PaidSettlement> {
  const { order, provider, transactionId } = input;
  const source = input.source ?? "webhook";
  const config = PROVIDERS[provider];

  if (order.status === OrderStatus.PAID) {
    await trackPurchase(order.id, provider);
    return { outcome: "already", revived: false, stockShortfall: 0 };
  }

  const blocked = blocksLatePaymentRevival(order);
  let issuedGiftCard: IssuedGiftCard | null = null;

  const claimed = await prismadb.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: {
        id: order.id,
        status: { in: [OrderStatus.CREATED, OrderStatus.PENDING, ...(blocked ? [] : [OrderStatus.CANCELLED])] },
      },
      data: { status: OrderStatus.PAID },
    });
    if (claim.count === 0) return null;

    // El cupo de preventa se apunta con el pago; solo descuentan hoy las
    // líneas de una campaña ya liberada, el resto espera a que Paula libere.
    const presaleDispatchNow = await settlePresaleLinesOnPayment(tx, order.id);

    // Los kits descuentan también sus componentes; el reingreso al anular
    // hace lo mismo, así que ambos lados quedan simétricos.
    const stockMovements = await explodeKitMovements(
      tx,
      order.orderItems
        .filter((item) => item.product && (!item.isPreorder || presaleDispatchNow.has(item.id)))
        .map((item) => ({
          productId: item.productId!,
          storeId: order.storeId,
          type: saleMovementType(order.type),
          quantity: -item.quantity,
          reason: viaSource(config.paidReason(order, transactionId), source),
          referenceId: order.id,
          cost: Number(item.product!.acqPrice) || 0,
          price: Number(item.product!.price),
          createdBy: config.createdBy,
        })),
    );

    // Sin stock suficiente la línea no se descuenta (nunca queda en negativo):
    // queda como incidencia DECREMENT y el pedido, «pagado sin stock».
    const stockResult = await createInventoryMovementBatchResilient(tx, stockMovements);
    let stockShortfall = 0;
    if (stockResult.failed.length > 0) {
      console.error(`${config.tag} Descuento de inventario incompleto en un pago confirmado:`, {
        orderNumber: order.orderNumber,
        transactionId,
        failed: stockResult.failed,
      });
      stockShortfall = await recordInventoryIssues(tx, {
        storeId: order.storeId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        kind: OrderInventoryIssueKind.DECREMENT,
        failed: stockResult.failed,
        // Revivido: el aviso del pago tardío ya dice «pagado sin stock», un solo correo.
        notifyShortfall: order.status !== OrderStatus.CANCELLED,
      });
    }

    const shippingCost = (order.shipping?.cost || 0) + (order.shipping?.codFee || 0);
    const financials = await calculateOrderFinancials(order as any, config.method, shippingCost, tx);

    await tx.order.update({
      where: { id: order.id },
      data: { ...financials, paidAt: new Date() } as any,
    });
    await applyCapsulePayment(tx, { orderId: order.id, storeId: order.storeId });

    if (order.coupon) {
      await tx.coupon.update({ where: { id: order.coupon.id }, data: { usedCount: { increment: 1 } } });
      if (order.coupon.isWelcomeBenefit) {
        await markWelcomeBenefitRedeemed(tx, { couponId: order.coupon.id, userId: order.userId, orderId: order.id });
      }
    }

    await writePaymentDetails(tx, input);

    // Una tarjeta de regalo no se empaca: no se le abre envío.
    if (order.type !== OrderType.GIFT_CARD) {
      await tx.shipping.upsert({
        where: { orderId: order.id },
        update: { status: ShippingStatus.Preparing },
        create: {
          status: ShippingStatus.Preparing,
          store: { connect: { id: order.storeId } },
          order: { connect: { id: order.id } },
        },
      });
    }

    issuedGiftCard = await issueGiftCardForOrder(tx, { storeId: order.storeId, orderId: order.id, createdBy: config.createdBy });
    // Si el pedido usó una tarjeta, la reserva pasa a consumo.
    await redeemGiftCardForOrder(tx, order as any, config.createdBy);

    return { stockShortfall };
  });

  if (!claimed) {
    if (order.status === OrderStatus.CANCELLED && blocked) {
      await flagPaymentOnCancelledOrder(order.id, provider);
      return { outcome: "late-on-cancelled", revived: false, stockShortfall: 0 };
    }
    return { outcome: "already", revived: false, stockShortfall: 0 };
  }

  await invalidateStoreProductsCache(order.storeId, { orderIds: [order.id] });
  const giftCard = issuedGiftCard as IssuedGiftCard | null;
  if (giftCard) await deliverGiftCard(giftCard, { buyerName: order.fullName });

  const revived = order.status === OrderStatus.CANCELLED;
  if (revived) {
    const { stockShortfall } = claimed;
    runInBackground("aviso de pago tardío que reactivó un pedido", () =>
      notifyLatePaymentRevival({ orderId: order.id, provider, stockShortfall }),
    );
  }

  await runSettlementSideEffects(order.id, OrderStatus.PAID, provider, source);
  return { outcome: "applied", revived, stockShortfall: claimed.stockShortfall };
}

export interface CancelSettlementInput extends SettlementInput {
  /** El estado tal como lo dijo la pasarela, para el motivo del movimiento de la tarjeta de regalo. */
  gatewayStatus: string;
}

export async function settleCancelledPayment(input: CancelSettlementInput): Promise<{ outcome: "applied" | "already"; restocked: boolean }> {
  const { order, provider, transactionId } = input;
  const source = input.source ?? "webhook";
  const config = PROVIDERS[provider];

  const result = await prismadb.$transaction(async (tx) => {
    // Una anulación puede llegar después de cobrar: se limpia `paidAt`, porque
    // un cancelado que la conserva sigue contando como venta en los reportes.
    const paidCancellation = await tx.order.updateMany({
      where: { id: order.id, status: OrderStatus.PAID },
      data: { status: OrderStatus.CANCELLED, paidAt: null },
    });
    const restocked = paidCancellation.count > 0;

    if (!restocked) {
      const claim = await tx.order.updateMany({
        where: { id: order.id, status: { in: [OrderStatus.CREATED, OrderStatus.PENDING] } },
        data: { status: OrderStatus.CANCELLED },
      });
      if (claim.count === 0) return null;
    }

    if (restocked) {
      // Espejo del pago: solo reingresan las líneas de preventa que alcanzaron
      // a liberarse, las únicas que descontaron.
      const presaleRestock = await releasePresaleLinesOnCancellation(tx, order.id);
      const restockMovements = await explodeKitMovements(
        tx,
        await withoutDrawnCapsuleUnits(
          tx,
          order.orderItems
            .filter((item) => item.product && (!item.isPreorder || presaleRestock.has(item.id)))
            .map((item) => ({
              productId: item.productId!,
              storeId: order.storeId,
              type: "ORDER_CANCELLED" as const,
              quantity: item.quantity,
              reason: viaSource(config.cancelReason(transactionId), source),
              referenceId: order.id,
              cost: Number(item.product!.acqPrice) || 0,
              price: Number(item.product!.price),
              createdBy: config.createdBy,
            })),
        ),
      );
      const restockResult = await createInventoryMovementBatchResilient(tx, restockMovements);
      if (restockResult.failed.length > 0) {
        console.error(`${config.tag} Reingreso de inventario incompleto tras la anulación:`, {
          orderNumber: order.orderNumber,
          transactionId,
          failed: restockResult.failed,
        });
        await recordInventoryIssues(tx, {
          storeId: order.storeId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          kind: OrderInventoryIssueKind.RESTOCK,
          failed: restockResult.failed,
        });
      }

      // El pedido conserva su cupón (su historia); solo se devuelve el uso.
      if (order.coupon) {
        await tx.coupon.updateMany({
          where: { id: order.coupon.id, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }
    }

    // La reserva o el consumo de una tarjeta vuelve al saldo; una tarjeta
    // comprada y sin usar se anula.
    await handleGiftCardOnOrderCancellation(tx, {
      storeId: order.storeId,
      orderId: order.id,
      createdBy: config.createdBy,
      reason: `${provider}: ${input.gatewayStatus}`,
    });

    if (order.coupon?.isWelcomeBenefit) {
      await releaseWelcomeBenefitReservation(tx, { couponId: order.coupon.id, userId: order.userId, orderId: order.id });
    }

    await writePaymentDetails(tx, input);
    return { restocked };
  });

  if (!result) return { outcome: "already", restocked: false };

  // Sin reingreso no cambió ningún stock: no hay nada que refrescar en la tienda.
  if (result.restocked) await invalidateStoreProductsCache(order.storeId, { orderIds: [order.id] });
  await runSettlementSideEffects(order.id, OrderStatus.CANCELLED, provider, source);
  return { outcome: "applied", restocked: result.restocked };
}

/** Wompi informó una transacción en curso: el pedido nuevo pasa a pendiente con su comprobante. */
export async function settlePendingPayment(input: SettlementInput): Promise<{ outcome: "applied" | "already" }> {
  const applied = await prismadb.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: input.order.id, status: OrderStatus.CREATED },
      data: { status: OrderStatus.PENDING },
    });
    if (claim.count === 0) return false;
    await writePaymentDetails(tx, input);
    return true;
  });
  if (!applied) return { outcome: "already" };
  await runSettlementSideEffects(input.order.id, OrderStatus.PENDING, input.provider, input.source ?? "webhook");
  return { outcome: "applied" };
}

/** Lo que Wompi cobró tiene que ser lo que el pedido debe, en COP y por Wompi. */
export function wompiTransactionMatchesOrder(
  order: { total: number; giftCardAmount?: number | null; payment?: { method: PaymentMethod | string } | null },
  transaction: { amount_in_cents?: unknown; currency?: unknown } | null | undefined,
): boolean {
  const amountInCents = Number(transaction?.amount_in_cents);
  // `total` es un Float: se compara en enteros para que un céntimo de
  // artefacto decimal no rechace un pago legítimo.
  const expectedCents = Math.round(getAmountDue(order) * 100);
  const currency = transaction?.currency;
  if (order.payment?.method !== PaymentMethod.Wompi) return false;
  if (!Number.isFinite(amountInCents) || Math.round(amountInCents) !== expectedCents) return false;
  if (currency && currency !== "COP") return false;
  return true;
}

/** Excedente que se acepta como propina cuando Bold no la informa aparte. */
export const BOLD_UNREPORTED_TIP_TOLERANCE = 0.2;

/**
 * El monto de Bold contra lo que mandamos en el enlace de pago (el total menos
 * la tarjeta de regalo). Según la documentación del webhook de Bold
 * (developers.bold.co/webhook), `amount.total` incluye propina e impuestos y
 * la propina llega aparte en `amount.tip`: se compara `total − tip`. Si la
 * consulta no trae la propina, un excedente pequeño se toma como propina y no
 * alerta. En el sandbox Bold manda 0.
 */
export function boldAmountMatchesOrder(
  order: { total: number; giftCardAmount?: number | null },
  amount: { total: unknown; tip?: unknown },
): boolean {
  if (amount.total === undefined || amount.total === null || amount.total === "") return false;
  const total = Number(amount.total);
  if (!Number.isFinite(total)) return false;
  if (process.env.BOLD_ENVIRONMENT === "test" && total === 0) return true;
  const due = Math.round(getAmountDue(order));
  const tip = amount.tip === undefined || amount.tip === null || amount.tip === "" ? NaN : Number(amount.tip);
  if (Number.isFinite(tip) && tip >= 0) return Math.round(total - tip) === due;
  const paid = Math.round(total);
  if (paid === due) return true;
  return paid > due && paid - due <= due * BOLD_UNREPORTED_TIP_TOLERANCE;
}
