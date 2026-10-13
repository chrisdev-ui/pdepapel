import { NextResponse } from "next/server";

import { processWhatsAppWebhookEvent, rerunWhatsAppBot } from "@/lib/whatsapp/conversation-sync";
import {
  getWhatsAppProcessorUrl,
  verifyWhatsAppProcessorRequest,
} from "@/lib/whatsapp/queue";

type QueueMessage = {
  eventId?: unknown;
  /** Un mensaje que se vuelve a pasar por el bot (lib/whatsapp/bot-lease.ts). */
  rerun?: { conversationId?: unknown; messageId?: unknown; attempt?: unknown };
};

/** Procesador firmado por QStash: convierte un evento guardado en conversación. */
export async function POST(request: Request) {
  const body = await request.text();
  try {
    const isValidSignature = await verifyWhatsAppProcessorRequest(
      body,
      request.headers.get("upstash-signature"),
      getWhatsAppProcessorUrl(),
      request.headers.get("upstash-region"),
    );
    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Firma de cola inválida" },
        { status: 401 },
      );
    }

    const message = JSON.parse(body) as QueueMessage;
    const rerun = message.rerun;
    if (rerun && typeof rerun.conversationId === "string" && typeof rerun.messageId === "string" && typeof rerun.attempt === "number") {
      return NextResponse.json(
        await rerunWhatsAppBot({ conversationId: rerun.conversationId, messageId: rerun.messageId, attempt: rerun.attempt }),
      );
    }
    if (typeof message.eventId !== "string" || !message.eventId) {
      return NextResponse.json(
        { error: "Evento de cola inválido" },
        { status: 400 },
      );
    }

    const result = await processWhatsAppWebhookEvent(message.eventId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("WhatsApp queue processor failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "No fue posible procesar el evento de WhatsApp" },
      { status: 500 },
    );
  }
}
