import { MarketplaceProvider, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { readWebhookToken, safeSecretEquals } from "@/lib/webhook-auth";
import {
  classifyWhatsAppWebhookEvent,
  parseWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp/webhook";

/**
 * Webhook de WhatsApp Cloud API (a través de Dualhook, que hace de BSP para
 * la coexistencia con la app de WhatsApp Business).
 *
 * Hoy solo autentica, deduplica y guarda cada evento en
 * `MarketplaceWebhookEvent` con `provider = WHATSAPP`. Nadie los consume
 * todavía: las conversaciones y el bot son trabajo posterior, así que no se
 * encola nada en QStash.
 *
 * Una vez autenticado, responde 200 pase lo que pase: si Meta o Dualhook
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

  return NextResponse.json({ error: "Verificación rechazada" }, { status: 403 });
}

function isAuthenticated(request: Request, rawBody: string): boolean {
  if (safeSecretEquals(readWebhookToken(request), env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    return true;
  }
  return verifyWhatsAppWebhookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    env.WHATSAPP_APP_SECRET,
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
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

  if (!isAuthenticated(request, body)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const payload = parseWhatsAppWebhookPayload(body);
  const { topic, resource, sellerId, eventKey } = classifyWhatsAppWebhookEvent(payload);

  try {
    const connection = sellerId
      ? await prismadb.marketplaceConnection.findFirst({
          where: { provider: MarketplaceProvider.WHATSAPP, sellerId },
          select: { id: true },
        })
      : null;

    const event = await prismadb.marketplaceWebhookEvent.upsert({
      where: {
        provider_eventKey: { provider: MarketplaceProvider.WHATSAPP, eventKey },
      },
      update: {},
      create: {
        connectionId: connection?.id ?? null,
        provider: MarketplaceProvider.WHATSAPP,
        eventKey,
        topic,
        resource,
        sellerId,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, connectionId: true },
    });

    return NextResponse.json(
      {
        received: true,
        stored: true,
        eventId: event.id,
        topic,
        connectedAccount: Boolean(event.connectionId),
      },
      { status: 200 },
    );
  } catch (error) {
    // Autenticado pero no guardado: se avisa en los logs y se responde 200
    // igual para que el proveedor no desactive la suscripción.
    console.error("[WHATSAPP_WEBHOOK] No se pudo guardar el evento", {
      topic,
      eventKey,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ received: true, stored: false, topic }, { status: 200 });
  }
}
