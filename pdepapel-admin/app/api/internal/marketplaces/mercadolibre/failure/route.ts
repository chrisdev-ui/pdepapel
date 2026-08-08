import {
  MarketplaceOutboxStatus,
  MarketplaceWebhookEventStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import {
  getMercadoLibreFailureUrl,
  parseMercadoLibreQueueFailureCallback,
  verifyMercadoLibreProcessorRequest,
} from "@/lib/mercadolibre/queue";
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

    if (failure.kind === "webhook") {
      await prismadb.marketplaceWebhookEvent.updateMany({
        where: {
          id: failure.eventId,
          status: {
            in: [
              MarketplaceWebhookEventStatus.PENDING,
              MarketplaceWebhookEventStatus.PROCESSING,
              MarketplaceWebhookEventStatus.RETRY,
            ],
          },
        },
        data: {
          status: MarketplaceWebhookEventStatus.RETRY,
          nextRetryAt: new Date(),
          lastError: failure.message,
        },
      });
    } else if (failure.kind === "stock-sync") {
      await prismadb.marketplaceOutboxEvent.updateMany({
        where: {
          id: failure.eventId,
          status: {
            in: [
              MarketplaceOutboxStatus.PENDING,
              MarketplaceOutboxStatus.PROCESSING,
              MarketplaceOutboxStatus.RETRY,
            ],
          },
        },
        data: {
          status: MarketplaceOutboxStatus.RETRY,
          availableAt: new Date(),
          lastError: failure.message,
        },
      });
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
