import { NextResponse } from "next/server";

import { env } from "@/lib/env.mjs";
import { safeSecretEquals } from "@/lib/webhook-auth";
import {
  classifyWhatsAppWebhookEvent,
  parseWhatsAppWebhookPayload,
} from "@/lib/whatsapp/webhook";
import { authenticateWhatsAppWebhook, isChakraEnforced } from "@/lib/whatsapp/webhook-auth";
import { runInBackground } from "@/lib/background";
import { sweepWhatsAppEventsQuietly } from "@/lib/whatsapp/recovery";
import { ingestWhatsAppWebhook } from "@/lib/whatsapp/webhook-intake";
import { stashFailedWhatsAppWebhook } from "@/lib/whatsapp/webhook-replay";

/**
 * Webhook de WhatsApp Cloud API (a través de Chakra, que hace de BSP para
 * la coexistencia con la app de WhatsApp Business).
 *
 * Autentica, deduplica y guarda cada evento en `MarketplaceWebhookEvent` con
 * `provider = WHATSAPP`, y lo encola en QStash para que el procesador firmado
 * lo archive como conversación (`lib/whatsapp/conversation-sync.ts`). Si la
 * cola falla, el evento queda guardado igual: la respuesta al proveedor nunca
 * depende de ella.
 *
 * Una vez autenticado, responde 200 pase lo que pase: si Meta o Chakra
 * acumulan 4xx/5xx desactivan la suscripción, y el cuerpo siempre queda
 * guardado tal cual para ajustar el clasificador después.
 */

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

/** Apretón de manos de Meta al registrar la URL. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    safeSecretEquals(verifyToken, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) &&
    challenge !== null
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json(
    { error: "Verificación rechazada" },
    { status: 403 },
  );
}

let warnedMissingChakraSecret = false;

export async function POST(request: Request) {
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

  const auth = authenticateWhatsAppWebhook(request, body, env);
  // Solo el método y de dónde vino el token, nunca valores: dice si alguna
  // entrega usa `?token=` antes de rotar WHATSAPP_WEBHOOK_VERIFY_TOKEN.
  console.info("[WHATSAPP_WEBHOOK] auth", {
    method: auth.method,
    tokenVia: auth.tokenVia,
    chakraSignature: auth.chakraSignature,
    chakra: auth.chakraCheck ?? "not_configured",
    enforce: isChakraEnforced(env),
  });
  if (!env.CHAKRA_WEBHOOK_SECRET && !warnedMissingChakraSecret) {
    warnedMissingChakraSecret = true;
    console.warn("[WHATSAPP_WEBHOOK] CHAKRA_WEBHOOK_SECRET no está configurado: se acepta el token sin firma y los comandos no corren");
  }
  if (auth.method === "rejected") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { topic, eventKey } = classifyWhatsAppWebhookEvent(
    parseWhatsAppWebhookPayload(body),
  );

  try {
    const ingested = await ingestWhatsAppWebhook(body, { signed: auth.signed });
    // Ya guardado: de paso se recupera lo atascado (como mucho cada 2 min),
    // sin demorar ni tumbar esta respuesta.
    runInBackground("whatsapp-recovery", () => sweepWhatsAppEventsQuietly());
    return NextResponse.json(ingested, {
      status: 200,
    });
  } catch (error) {
    // Autenticado pero no guardado: se responde 200 igual para que el
    // proveedor no desactive la suscripción, y como Meta no reenvía, el
    // cuerpo queda en la cola de reintento.
    console.error("[WHATSAPP_WEBHOOK] No se pudo guardar el evento", {
      topic,
      eventKey,
      message: error instanceof Error ? error.message : "unknown",
    });
    const retry = await stashFailedWhatsAppWebhook({ eventKey, body }).catch(
      () => ({ queued: false }),
    );
    return NextResponse.json(
      { received: true, stored: false, topic, retryQueued: retry.queued },
      { status: 200 },
    );
  }
}
