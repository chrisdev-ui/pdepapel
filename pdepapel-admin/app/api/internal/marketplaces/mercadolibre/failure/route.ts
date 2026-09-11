import {
  MarketplaceOutboxAction,
  MarketplaceOutboxStatus,
  MarketplaceWebhookEventStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import {
  getMercadoLibreFailureUrl,
  parseMercadoLibreQueueFailureCallback,
  verifyMercadoLibreProcessorRequest,
} from "@/lib/mercadolibre/queue";
import { MAX_OUTBOX_EVENT_ATTEMPTS } from "@/lib/mercadolibre/outbox";
import { MAX_WEBHOOK_EVENT_ATTEMPTS } from "@/lib/mercadolibre/webhook-processor";
import prismadb from "@/lib/prismadb";

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const isValidSignature = await verifyMercadoLibreProcessorRequest(
      body,
      request.headers.get("upstash-signature"),
      getMercadoLibreFailureUrl(),
      request.headers.get("upstash-region"),
    );
    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Firma de cola inválida" },
        { status: 401 },
      );
    }

    const failure = parseMercadoLibreQueueFailureCallback(JSON.parse(body));
    if (!failure) {
      return NextResponse.json(
        { error: "Notificación de fallo inválida" },
        { status: 400 },
      );
    }

    // QStash agotó sus entregas. Mismo tope que el procesador: el evento que
    // ya gastó sus intentos pasa a FAILED y sale en la salud; el resto vuelve a
    // RETRY para la recuperación programada.
    if (failure.kind === "webhook") {
      const openStatuses = [
        MarketplaceWebhookEventStatus.PENDING,
        MarketplaceWebhookEventStatus.PROCESSING,
        MarketplaceWebhookEventStatus.RETRY,
      ];
      const failed = await prismadb.marketplaceWebhookEvent.updateMany({
        where: {
          id: failure.eventId,
          status: { in: openStatuses },
          attempts: { gte: MAX_WEBHOOK_EVENT_ATTEMPTS },
        },
        data: {
          status: MarketplaceWebhookEventStatus.FAILED,
          nextRetryAt: null,
          lastError: `Se agotaron los ${MAX_WEBHOOK_EVENT_ATTEMPTS} intentos. Último error: ${failure.message}`,
        },
      });
      if (failed.count === 0) {
        await prismadb.marketplaceWebhookEvent.updateMany({
          where: { id: failure.eventId, status: { in: openStatuses } },
          data: {
            status: MarketplaceWebhookEventStatus.RETRY,
            nextRetryAt: new Date(),
            lastError: failure.message,
          },
        });
      }
    } else if (failure.kind === "stock-sync") {
      const openStatuses = [
        MarketplaceOutboxStatus.PENDING,
        MarketplaceOutboxStatus.PROCESSING,
        MarketplaceOutboxStatus.RETRY,
      ];
      const failed = await prismadb.marketplaceOutboxEvent.updateMany({
        where: {
          id: failure.eventId,
          status: { in: openStatuses },
          attempts: { gte: MAX_OUTBOX_EVENT_ATTEMPTS },
          action: { not: MarketplaceOutboxAction.SYNC_ORDER_FINANCIALS },
        },
        data: {
          status: MarketplaceOutboxStatus.FAILED,
          lastError: `Se agotaron los ${MAX_OUTBOX_EVENT_ATTEMPTS} intentos. Último error: ${failure.message}`,
        },
      });
      if (failed.count === 0) {
        await prismadb.marketplaceOutboxEvent.updateMany({
          where: { id: failure.eventId, status: { in: openStatuses } },
          data: {
            status: MarketplaceOutboxStatus.RETRY,
            availableAt: new Date(),
            lastError: failure.message,
          },
        });
      }
    } else {
      await prismadb.marketplaceConnection.updateMany({
        where: { id: failure.connectionId },
        data: { lastError: failure.message },
      });
    }

    return NextResponse.json({ received: true, kind: failure.kind });
  } catch (error) {
    console.error("Mercado Libre QStash failure callback failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "No fue posible registrar el fallo de la cola" },
      { status: 500 },
    );
  }
}
