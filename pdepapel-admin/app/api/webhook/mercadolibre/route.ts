import { MarketplaceProvider, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import {
  getMercadoLibreWebhookEventKey,
  parseMercadoLibreWebhookPayload,
} from "@/lib/mercadolibre/webhook";
import { enqueueMercadoLibreWebhookEvent } from "@/lib/mercadolibre/queue";

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_WEBHOOK_BODY_BYTES
    ) {
      return NextResponse.json(
        { error: "El webhook excede el tamaño permitido" },
        { status: 413 },
      );
    }

    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json(
        { error: "El webhook excede el tamaño permitido" },
        { status: 413 },
      );
    }

    const { payload, topic, resource, sellerId } =
      parseMercadoLibreWebhookPayload(body);
    const eventKey = getMercadoLibreWebhookEventKey(payload);
    const connection = await prismadb.marketplaceConnection.findFirst({
      where: {
        provider: MarketplaceProvider.MERCADOLIBRE,
        sellerId,
      },
      select: { id: true },
    });

    const event = await prismadb.marketplaceWebhookEvent.upsert({
      where: {
        provider_eventKey: {
          provider: MarketplaceProvider.MERCADOLIBRE,
          eventKey,
        },
      },
      update: {},
      create: {
        connectionId: connection?.id ?? null,
        provider: MarketplaceProvider.MERCADOLIBRE,
        eventKey,
        topic,
        resource,
        sellerId,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, connectionId: true },
    });

    const queued = event.connectionId
      ? await enqueueMercadoLibreWebhookEvent(event.id, event.connectionId)
      : false;

    return NextResponse.json(
      {
        received: true,
        eventId: event.id,
        connectedSeller: Boolean(event.connectionId),
        queued,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Mercado Libre webhook rejected", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Webhook de Mercado Libre inválido" },
      { status: 400 },
    );
  }
}
