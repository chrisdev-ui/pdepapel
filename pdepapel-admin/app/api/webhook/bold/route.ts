import { getBoldWebhookSecretKey, verifyBoldWebhookSignature } from "@/lib/bold";
import { schedulePaymentWebhookAlert, schedulePaymentWebhookCrashAlert } from "@/lib/payment-webhook-alert";
import {
  boldAmountMatchesOrder,
  loadOrderForSettlement,
  settleCancelledPayment,
  settlePaidPayment,
  unappliedSettlementMessage,
} from "@/lib/payment-settlement";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import {
  InvalidWebhookPayloadError,
  readWebhookStoreId,
} from "@/lib/webhook-auth";
import { NextResponse } from "next/server";
import {
  BOLD_INVALID_SIGNATURE_ERROR,
  completePaymentWebhookEvent,
  completePaymentWebhookEventWithError,
  PaymentWebhookContext,
  recordPaymentWebhookReceived,
} from "@/lib/payment-webhook-events";

/**
 * La fila se escribe antes de mirar la firma y se cierra con lo que respondió
 * el handler: así también quedan los rechazos, que antes sólo eran un
 * `console.warn`. Registrar nunca tumba el pago: si la base falla, el webhook
 * sigue igual que siempre.
 */
export async function POST(req: Request) {
  const scopedStoreId = readWebhookStoreId(req);
  const rawPayload = await req.text();
  const context: PaymentWebhookContext = { storeId: scopedStoreId };
  const eventId = await recordPaymentWebhookReceived({
    provider: "BOLD",
    request: req,
    rawBody: rawPayload,
    storeId: scopedStoreId,
  });

  try {
    const response = await handleBoldWebhook(
      req,
      rawPayload,
      scopedStoreId,
      context,
    );
    await completePaymentWebhookEvent(eventId, response, context);
    schedulePaymentWebhookAlert("BOLD", eventId, response, rawPayload, context);
    return response;
  } catch (error) {
    await completePaymentWebhookEventWithError(eventId, error, context);
    schedulePaymentWebhookCrashAlert("BOLD", eventId, error, rawPayload, context);
    throw error;
  }
}

async function handleBoldWebhook(
  req: Request,
  rawPayload: string,
  scopedStoreId: string | null,
  context: PaymentWebhookContext,
) {
  try {
    if (!rawPayload) {
      return NextResponse.json(
        { error: "Payload no recibido" },
        { status: 400 },
      );
    }

    const isValidSignature = verifyBoldWebhookSignature(
      rawPayload,
      req.headers.get("x-bold-signature"),
      getBoldWebhookSecretKey(),
    );

    if (!isValidSignature) {
      console.warn("Bold webhook rejected due to an invalid signature");
      return NextResponse.json(
        { error: BOLD_INVALID_SIGNATURE_ERROR },
        { status: 400 },
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      // Cuerpo ilegible: 400 para que Bold deje de reintentarlo.
      return NextResponse.json(
        { error: "El cuerpo del webhook no es JSON válido" },
        { status: 400 },
      );
    }

    if (!payload) {
      return NextResponse.json(
        { error: "Payload no recibido" },
        { status: 400 },
      );
    }

    const eventType = payload.type || payload.event || payload.action;
    const transactionData = payload.data || payload.transaction || payload;
    context.eventType = typeof eventType === "string" ? eventType : null;

    if (!eventType || !transactionData) {
      return NextResponse.json(
        { error: "Estructura de webhook no válida" },
        { status: 400 },
      );
    }

    switch (eventType) {
      case "SALE_APPROVED":
      case "PAYMENT_APPROVED":
      case "transaction.approved":
        return await processBoldPayment(
          transactionData,
          OrderStatus.PAID,
          scopedStoreId,
          context,
        );

      case "SALE_REJECTED":
      case "VOID_APPROVED":
      case "transaction.declined":
      case "transaction.voided":
        return await processBoldPayment(
          transactionData,
          OrderStatus.CANCELLED,
          scopedStoreId,
          context,
        );

      default:
        console.log(`Bold event received: ${eventType}`);
        return NextResponse.json(
          { message: `Event acknowledged: ${eventType}` },
          { status: 200 },
        );
    }
  } catch (error: any) {
    console.error("Bold Webhook error:", error);
    return NextResponse.json(
      { error: `Error interno procesando webhook de Bold: ${error?.message}` },
      { status: 500 },
    );
  }
}

async function processBoldPayment(
  transaction: any,
  targetStatus: OrderStatus,
  scopedStoreId: string | null,
  context: PaymentWebhookContext,
) {
  const orderReference =
    transaction.metadata?.reference ||
    transaction.reference ||
    transaction.order_id ||
    transaction.orderId;
  context.orderReference =
    typeof orderReference === "string" ? orderReference : null;
  // Sin referencia del proveedor se guarda null: inventar «BOLD-<timestamp>»
  // dejaba en el pedido un número que parecía de Bold y no lo era.
  const transactionId: string | null =
    transaction.payment_id ||
    transaction.id ||
    transaction.transaction_id ||
    null;
  context.transactionId = transactionId;

  if (!orderReference) {
    return NextResponse.json(
      { error: "No se encontró referencia de orden en webhook de Bold" },
      { status: 400 },
    );
  }

  const order = await loadOrderForSettlement({
    ...(scopedStoreId ? { storeId: scopedStoreId } : {}),
    OR: [{ id: orderReference }, { orderNumber: orderReference }],
  });

  if (!order) {
    return NextResponse.json(
      { error: `Orden no encontrada: ${orderReference}` },
      { status: 404 },
    );
  }
  context.orderId = order.id;
  context.storeId = order.storeId;

  if (order.payment?.method !== PaymentMethod.Bold) {
    return NextResponse.json(
      {
        error: `La orden ${order.orderNumber} no está configurada para pago en línea`,
      },
      { status: 400 },
    );
  }

  if (
    targetStatus === OrderStatus.PAID &&
    !boldAmountMatchesOrder(order, { total: transaction.amount?.total, tip: transaction.amount?.tip })
  ) {
    return NextResponse.json(
      {
        error: `El monto de Bold no coincide con la orden ${order.orderNumber}`,
      },
      { status: 400 },
    );
  }

  if (
    targetStatus === OrderStatus.PAID &&
    transaction.amount?.currency &&
    transaction.amount.currency !== "COP"
  ) {
    return NextResponse.json(
      { error: "La moneda reportada por Bold no es COP" },
      { status: 400 },
    );
  }

  if (!transactionId) {
    console.warn(
      `[BOLD_WEBHOOK] Evento sin identificador de transacción para ${order.orderNumber}`,
    );
  }

  const settlement = {
    order,
    provider: "Bold" as const,
    transactionId,
    detailsText: `Bold Transaction ID: ${transactionId} | Reference: ${orderReference} | Status: ${targetStatus}`,
  };
  const { outcome } =
    targetStatus === OrderStatus.PAID
      ? await settlePaidPayment(settlement)
      : await settleCancelledPayment({ ...settlement, gatewayStatus: targetStatus });

  if (outcome !== "applied") {
    return NextResponse.json(
      { message: unappliedSettlementMessage(order.orderNumber, outcome) },
      { status: 200 },
    );
  }

  return NextResponse.json(
    { success: true, orderId: order.id },
    { status: 200 },
  );
}
