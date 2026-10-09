import { NextResponse } from "next/server";

import { verifyWhatsAppProcessorRequest } from "@/lib/whatsapp/queue";
import { ingestWhatsAppWebhook } from "@/lib/whatsapp/webhook-intake";
import {
  getWhatsAppReplayUrl,
  replayStashedWhatsAppWebhook,
  WHATSAPP_REPLAY_PREFIX,
} from "@/lib/whatsapp/webhook-replay";

/** Reintento firmado por QStash de un webhook de WhatsApp que la base no pudo guardar. */
export async function POST(request: Request) {
  const body = await request.text();
  try {
    const isValidSignature = await verifyWhatsAppProcessorRequest(
      body,
      request.headers.get("upstash-signature"),
      getWhatsAppReplayUrl(),
      request.headers.get("upstash-region"),
    );
    if (!isValidSignature) {
      return NextResponse.json({ error: "Firma de cola inválida" }, { status: 401 });
    }

    const { key } = JSON.parse(body) as { key?: unknown };
    if (typeof key !== "string" || !key.startsWith(WHATSAPP_REPLAY_PREFIX)) {
      return NextResponse.json({ error: "Reintento inválido" }, { status: 400 });
    }

    return NextResponse.json(await replayStashedWhatsAppWebhook(key, ingestWhatsAppWebhook));
  } catch (error) {
    console.error("[WHATSAPP_WEBHOOK_REPLAY] El reintento falló", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "No fue posible guardar el evento de WhatsApp" }, { status: 500 });
  }
}
