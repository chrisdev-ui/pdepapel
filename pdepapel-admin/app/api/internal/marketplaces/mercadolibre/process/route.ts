import { NextResponse } from "next/server";

import {
  getMercadoLibreProcessorUrl,
  verifyMercadoLibreProcessorRequest,
} from "@/lib/mercadolibre/queue";
import { processMercadoLibreWebhookEvent } from "@/lib/mercadolibre/webhook-processor";

type QueueMessage = { eventId?: unknown };

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const isValidSignature = await verifyMercadoLibreProcessorRequest(
      body,
      request.headers.get("upstash-signature"),
      getMercadoLibreProcessorUrl(),
      request.headers.get("upstash-region"),
    );
    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Firma de cola inválida" },
        { status: 401 },
      );
    }

    const message = JSON.parse(body) as QueueMessage;
    if (typeof message.eventId !== "string" || !message.eventId) {
      return NextResponse.json(
        { error: "Evento de cola inválido" },
        { status: 400 },
      );
    }

    const result = await processMercadoLibreWebhookEvent(message.eventId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Mercado Libre queue processor failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "No fue posible procesar el evento de Mercado Libre" },
      { status: 500 },
    );
  }
}
