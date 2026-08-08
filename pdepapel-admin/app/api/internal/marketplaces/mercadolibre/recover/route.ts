import { NextResponse } from "next/server";

import { enqueuePendingMarketplaceOutboxEvents } from "@/lib/mercadolibre/outbox";
import {
  getMercadoLibreRecoveryUrl,
  verifyMercadoLibreProcessorRequest,
} from "@/lib/mercadolibre/queue";
import { recoverMercadoLibreWebhookEvents } from "@/lib/mercadolibre/webhook-processor";
import prismadb from "@/lib/prismadb";

type RecoveryMessage = { connectionId?: unknown };

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const isValidSignature = await verifyMercadoLibreProcessorRequest(
      body,
      request.headers.get("upstash-signature"),
      getMercadoLibreRecoveryUrl(),
      request.headers.get("upstash-region"),
    );
    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Firma de cola inválida" },
        { status: 401 },
      );
    }

    const message = JSON.parse(body) as RecoveryMessage;
    if (typeof message.connectionId !== "string" || !message.connectionId) {
      return NextResponse.json({ error: "Conexión inválida" }, { status: 400 });
    }

    const [webhookEvents, outboxEvents] = await Promise.all([
      recoverMercadoLibreWebhookEvents(message.connectionId),
      enqueuePendingMarketplaceOutboxEvents(message.connectionId),
    ]);
    await prismadb.marketplaceConnection.updateMany({
      where: {
        id: message.connectionId,
        lastError: {
          startsWith: "QStash no pudo entregar una tarea de Mercado Libre",
        },
      },
      data: { lastError: null },
    });
    return NextResponse.json({ webhookEvents, outboxEvents });
  } catch (error) {
    console.error("Mercado Libre recovery failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "No fue posible recuperar las tareas de Mercado Libre" },
      { status: 500 },
    );
  }
}
