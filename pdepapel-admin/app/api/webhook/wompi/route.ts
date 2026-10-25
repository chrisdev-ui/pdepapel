import { env } from "@/lib/env.mjs";
import { runInBackground } from "@/lib/background";
import { schedulePaymentWebhookAlert, schedulePaymentWebhookCrashAlert, sendPaymentAlert } from "@/lib/payment-webhook-alert";
import {
  isOnlineCheckoutOrder,
  loadOrderForSettlement,
  settleCancelledPayment,
  settleDeclinedPayment,
  settlePaidPayment,
  settlePendingPayment,
  unappliedSettlementMessage,
  wompiTransactionMatchesOrder,
  type SettlementOrder,
  type SettlementOutcome,
} from "@/lib/payment-settlement";
import { OrderStatus } from "@prisma/client";
import { safeHexEquals } from "@/lib/webhook-auth";
import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  completePaymentWebhookEvent,
  completePaymentWebhookEventWithError,
  PaymentWebhookContext,
  recordPaymentWebhookReceived,
  WOMPI_INVALID_CHECKSUM_ERROR,
} from "@/lib/payment-webhook-events";

const HASH_ALGORITHM = "sha256";

/**
 * Mismo esquema que Bold: la fila se escribe antes de mirar el checksum y se
 * cierra con la respuesta. El cuerpo se lee como texto para guardarlo tal
 * cual; el JSON se arma después, con la misma tolerancia de antes.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const context: PaymentWebhookContext = {};
  const eventId = await recordPaymentWebhookReceived({
    provider: "WOMPI",
    request: req,
    rawBody,
  });

  try {
    const response = await handleWompiWebhook(rawBody, context);
    await completePaymentWebhookEvent(eventId, response, context);
    schedulePaymentWebhookAlert("WOMPI", eventId, response, rawBody, context);
    return response;
  } catch (error) {
    await completePaymentWebhookEventWithError(eventId, error, context);
    schedulePaymentWebhookCrashAlert("WOMPI", eventId, error, rawBody, context);
    throw error;
  }
}

function parseWompiBody(rawBody: string): any {
  try {
    return rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return null;
  }
}

async function handleWompiWebhook(
  rawBody: string,
  context: PaymentWebhookContext,
) {
  try {
    const response = parseWompiBody(rawBody);

    if (!response) {
      return NextResponse.json(
        { error: "El cuerpo del webhook no es JSON válido" },
        { status: 400 },
      );
    }

    if (response && response.event) {
      context.eventType =
        typeof response.event === "string" ? response.event : null;
      switch (response.event) {
        case "transaction.updated":
        case "nequi_token.updated":
          return await processWebhookPayment(response, context);

        default:
          return NextResponse.json(
            { error: `Event not found: ${response.event}` },
            { status: 400 },
          );
      }
    } else {
      return NextResponse.json(
        { error: "Error on body request" },
        { status: 400 },
      );
    }
  } catch (error: any) {
    console.error("[WOMPI_WEBHOOK] Error procesando el webhook:", error);
    return NextResponse.json(
      {
        error: `Internal server error processing webhook: ${
          error?.message || error?.data?.message
        }`,
      },
      { status: 500 },
    );
  }
}

async function processWebhookPayment(
  response: any,
  context: PaymentWebhookContext,
) {
  if (isValidChecksum(response)) {
    const {
      data: { transaction },
    } = response;
    if (transaction) {
      context.transactionId =
        typeof transaction.id === "string" ? transaction.id : null;
      context.orderReference =
        typeof transaction.reference === "string"
          ? transaction.reference
          : null;
      let order: SettlementOrder | null;
      try {
        order = await loadOrderForSettlement({ id: transaction.reference });
      } catch (error) {
        // Una caída de la base no es un rechazo: 500 para que Wompi reintente.
        return NextResponse.json(
          { error: `Error finding order for wompi webhook: ${error}` },
          { status: 500 },
        );
      }

      if (!order)
        return NextResponse.json(
          { error: `Order not found: ${transaction.reference}` },
          { status: 400 },
        );
      context.orderId = order.id;
      context.storeId = order.storeId;

      if (wompiTransactionMatchesOrder(order, transaction)) {
        return await updateOrderData(order, transaction);
      }
      return NextResponse.json(
        {
          error: `Wompi payment is not valid. TRANSACTION ID: (${transaction.id})`,
        },
        { status: 400 },
      );
    } else {
      return NextResponse.json(
        { error: "Transaction not found on webhook" },
        { status: 400 },
      );
    }
  } else {
    return NextResponse.json(
      { error: WOMPI_INVALID_CHECKSUM_ERROR },
      { status: 400 },
    );
  }
}

function isValidChecksum(response: any): boolean {
  const { signature, data, timestamp } = response;

  if (
    !signature ||
    !data ||
    !timestamp ||
    !Array.isArray(signature.properties)
  ) {
    return false;
  }

  const toHash = concatenateProperties(data, signature.properties);
  if (toHash === null) return false;

  const hash = createHash(toHash, timestamp, env.WOMPI_EVENTS_KEY);
  return safeHexEquals(signature.checksum, hash);
}

/**
 * Recorre las propiedades firmadas. Devuelve null si el camino no existe, en
 * lugar de lanzar: un cuerpo mal formado se responde como firma inválida (400)
 * y no como error interno (500), que Wompi reintentaría sin fin.
 */
function concatenateProperties(data: any, properties: string[]): string | null {
  let result = "";
  for (const property of properties) {
    let value: any = data;
    for (const key of String(property).split(".")) {
      if (value === null || value === undefined) return null;
      value = value[key];
    }
    if (value === undefined || value === null) return null;
    result += value;
  }
  return result;
}

function createHash(
  toHash: string,
  timestamp: string | number,
  privateKey: string,
) {
  const hash = crypto
    .createHash(HASH_ALGORITHM)
    .update(toHash + timestamp + privateKey)
    .digest("hex");
  return hash;
}

async function updateOrderData(order: SettlementOrder, transaction: any) {
  try {
    const currentStatus = applyStatus(transaction.status);
    const settlement = {
      order,
      provider: "Wompi" as const,
      transactionId: transaction.id,
      detailsText: `customer_email: ${transaction?.customer_email ?? "undefined"} | payment_method_type: ${transaction?.payment_method_type ?? "undefined"}`,
    };
    let outcome: string;
    if (currentStatus === OrderStatus.PAID) {
      ({ outcome } = await settlePaidPayment(settlement));
    } else if (currentStatus === OrderStatus.CANCELLED) {
      // Un rechazo en el Botón de pagos deja reintentar; anular sigue cancelando.
      if (transaction.status !== "VOIDED" && isOnlineCheckoutOrder(order)) {
        ({ outcome } = await settleDeclinedPayment(settlement));
      } else {
        const cancelled = await settleCancelledPayment({ ...settlement, gatewayStatus: transaction.status });
        outcome = cancelled.outcome;
        if (cancelled.outcome === "held") {
          runInBackground("aviso de anulación por revisar", () =>
            sendPaymentAlert({ provider: "WOMPI", kind: "void-held", storeId: order.storeId, orderId: order.id, orderNumber: order.orderNumber, holdReason: cancelled.holdReason }),
          );
        }
      }
    } else {
      ({ outcome } = await settlePendingPayment(settlement));
    }

    if (outcome !== "applied") {
      return NextResponse.json(
        {
          message: unappliedSettlementMessage(order.orderNumber, outcome as SettlementOutcome),
        },
        { status: 200 },
      );
    }
    return NextResponse.json(null, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Internal server error updating order data: ${
          error?.data?.message || error?.message
        }`,
      },
      { status: 500 },
    );
  }
}

function applyStatus(status: string): OrderStatus {
  switch (status) {
    case "APPROVED":
      return OrderStatus.PAID;
    case "DECLINED":
    case "ERROR":
    case "VOIDED":
      return OrderStatus.CANCELLED;
    default:
      return OrderStatus.PENDING;
  }
}
