import { OrderPaymentKind, PaymentMethod, type OrderPayment } from "@prisma/client";

import { runInBackground } from "@/lib/background";
import { flagPaymentOnCancelledOrder } from "@/lib/late-payment";
import { boldAmountMatchesDue, settleDepositPayment, wompiCentsMatchDue } from "@/lib/order-payments";
import { sendPaymentAlert } from "@/lib/payment-webhook-alert";
import prismadb from "@/lib/prismadb";

/**
 * El anticipo de una preventa llega a Bold o Wompi con su propia referencia
 * (`<orderNumber>-A`) y se resuelve por `OrderPayment`, nunca por el pedido:
 * así jamás cae en `settlePaidPayment`, que lo daría por pagado completo.
 */

export type DepositChargeEvent = "approved" | "declined" | "voided" | "pending";
export type DepositProvider = "Bold" | "Wompi";

export interface DepositChargeResult {
  status: number;
  body: Record<string, unknown>;
  orderId: string | null;
  storeId: string | null;
}

const PROVIDER = {
  Bold: { method: PaymentMethod.Bold, createdBy: "SYSTEM_BOLD", alert: "BOLD" as const },
  Wompi: { method: PaymentMethod.Wompi, createdBy: "SYSTEM_WOMPI", alert: "WOMPI" as const },
};

export async function processDepositCharge(input: {
  provider: DepositProvider;
  charge: OrderPayment;
  event: DepositChargeEvent;
  transactionId: string | null;
  /** Bold: `{ total, tip, currency }`; Wompi: la transacción. */
  amount: { total?: unknown; tip?: unknown; currency?: unknown; amount_in_cents?: unknown };
  source?: "webhook" | "reconciliation";
}): Promise<DepositChargeResult> {
  const { provider, charge, event } = input;
  const config = PROVIDER[provider];
  const order = await prismadb.order.findUnique({
    where: { id: charge.orderId },
    select: { id: true, storeId: true, orderNumber: true, status: true, payment: { select: { method: true } } },
  });
  if (!order) return { status: 404, body: { error: "Pedido del anticipo no encontrado" }, orderId: null, storeId: charge.storeId };
  const ids = { orderId: order.id, storeId: order.storeId };

  if (charge.kind !== OrderPaymentKind.DEPOSIT) {
    return { status: 400, body: { error: `El cobro del saldo en línea todavía no está habilitado (pedido ${order.orderNumber})` }, ...ids };
  }
  if (order.payment?.method !== config.method) {
    return { status: 400, body: { error: `La orden ${order.orderNumber} no está configurada para pago en línea` }, ...ids };
  }

  if (event === "approved") {
    const matches =
      provider === "Bold"
        ? boldAmountMatchesDue(charge.amount, { total: input.amount.total, tip: input.amount.tip }) &&
          (!input.amount.currency || input.amount.currency === "COP")
        : wompiCentsMatchDue(charge.amount, input.amount);
    if (!matches) {
      return { status: 400, body: { error: `El monto del anticipo no coincide con la orden ${order.orderNumber}` }, ...ids };
    }
    const settled = await settleDepositPayment({
      orderId: order.id,
      storeId: order.storeId,
      amount: charge.amount,
      method: config.method,
      paidAt: new Date(),
      source: input.source ?? "webhook",
      createdBy: config.createdBy,
      transactionId: input.transactionId,
      chargeId: charge.id,
      notifyCustomer: true,
    });
    if (settled.outcome === "late-on-cancelled") {
      runInBackground("anticipo pagado sobre un pedido cancelado", () => flagPaymentOnCancelledOrder(order.id, provider));
      return { status: 200, body: { message: `Anticipo aprobado sobre la orden cancelada ${order.orderNumber}: queda para revisión` }, ...ids };
    }
    if (settled.outcome === "already") {
      return { status: 200, body: { message: `El anticipo de la orden ${order.orderNumber} ya estaba registrado` }, ...ids };
    }
    return { status: 200, body: { success: true, orderId: order.id }, ...ids };
  }

  if (event === "voided") {
    // Una anulación de un anticipo ya cobrado no se aplica sola: el pedido sigue
    // con su cupo y Paula decide (devolver, cancelar el pedido) a mano.
    runInBackground("anulación de un anticipo por revisar", () =>
      sendPaymentAlert({
        provider: config.alert,
        kind: "void-held",
        storeId: order.storeId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        error: "La pasarela anuló el anticipo de una preventa: revisa el pedido y decide si cancelarlo.",
      }),
    );
    return { status: 200, body: { message: `Anulación del anticipo de ${order.orderNumber} anotada para revisión` }, ...ids };
  }

  // Rechazo o en curso: el pedido sigue pendiente y la clienta puede reintentar.
  return { status: 200, body: { message: `Anticipo de ${order.orderNumber}: ${event}` }, ...ids };
}
