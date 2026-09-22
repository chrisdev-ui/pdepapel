import {
  MarketplaceProvider,
  MarketplaceWebhookEventStatus,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { readWebhookToken, safeSecretEquals } from "@/lib/webhook-auth";
import {
  IGNORED_EVENT_NOTE,
  countSkippedEvent,
  findIgnoredContact,
} from "@/lib/whatsapp/ignored-contacts";
import { enqueueWhatsAppWebhookEvent } from "@/lib/whatsapp/queue";
import {
  classifyWhatsAppWebhookEvent,
  getWhatsAppWebhookConversationKey,
  getWhatsAppWebhookIdentity,
  parseWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp/webhook";

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

/**
 * Tienda a la que atribuir el evento cuando no hay conexión por `sellerId`.
 *
 * Solo se consulta si hay identidad que comprobar, para no meter una consulta
 * de más en el camino caliente de los eventos sin remitente (cambios de
 * plantilla y demás).
 */
async function resolveFallbackStoreId(identity: {
  phone: string | null;
  bsuid: string | null;
}): Promise<string | null> {
  if (!identity.phone && !identity.bsuid) return null;
  const store = await prismadb.store.findFirst({ select: { id: true } });
  return store?.id ?? null;
}

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

function isAuthenticated(request: Request, rawBody: string): boolean {
  if (
    safeSecretEquals(
      readWebhookToken(request),
      env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    )
  ) {
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

  if (!isAuthenticated(request, body)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const payload = parseWhatsAppWebhookPayload(body);
  const { topic, resource, sellerId, eventKey } =
    classifyWhatsAppWebhookEvent(payload);

  try {
    const connection = sellerId
      ? await prismadb.marketplaceConnection.findFirst({
          where: { provider: MarketplaceProvider.WHATSAPP, sellerId },
          select: { id: true, storeId: true },
        })
      : null;

    let event: { id: string; connectionId: string | null };
    try {
      event = await prismadb.marketplaceWebhookEvent.upsert({
        where: {
          provider_eventKey: {
            provider: MarketplaceProvider.WHATSAPP,
            eventKey,
          },
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
    } catch (error) {
      // Dos entregas casi simultáneas del mismo evento pueden chocar en la
      // restricción única: ambas intentan crear la fila a la vez y una gana.
      // La otra no falló de verdad — el evento ya quedó guardado por la
      // primera, así que se reusa esa fila en vez de tratarlo como error.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        event = await prismadb.marketplaceWebhookEvent.findUniqueOrThrow({
          where: {
            provider_eventKey: {
              provider: MarketplaceProvider.WHATSAPP,
              eventKey,
            },
          },
          select: { id: true, connectionId: true },
        });
      } else {
        throw error;
      }
    }

    /*
     * Contacto ignorado: se guarda el evento y no se encola.
     *
     * Aquí y no más adelante porque la cuota de QStash se gasta al publicar,
     * no al procesar: cualquier corte posterior ya la habría pagado. La
     * identidad está a mano una línea antes de encolar —es la misma que arma
     * la llave de flujo—, así que no cuesta ninguna consulta de más.
     *
     * Tapa los dos sentidos: el mensaje que entra y el eco de lo que Paula
     * contesta desde su celular, que también es un evento y también costaba.
     */
    const identity = getWhatsAppWebhookIdentity(payload);
    let ignored: { id: string } | null = null;
    try {
      const storeId = connection?.storeId ?? (await resolveFallbackStoreId(identity));
      ignored = storeId ? await findIgnoredContact(storeId, identity) : null;
    } catch (error) {
      // Si no se puede comprobar, se sigue como siempre: encolar de más es
      // recuperable, dejar de atender a una clienta no lo es.
      console.error("[WHATSAPP_WEBHOOK] No se pudo consultar la lista de ignorados", {
        eventId: event.id,
        message: error instanceof Error ? error.message : "unknown",
      });
    }

    if (ignored) {
      await countSkippedEvent(ignored.id);
      // Se cierra el evento para que ninguna recuperación ni reintento lo
      // vuelva a tomar, y para que la limpieza de 30 días se lo lleve: solo
      // borra los PROCESSED, y dejarlo PENDING lo haría eterno.
      await prismadb.marketplaceWebhookEvent
        .update({
          where: { id: event.id },
          data: {
            status: MarketplaceWebhookEventStatus.PROCESSED,
            processedAt: new Date(),
            nextRetryAt: null,
            lastError: IGNORED_EVENT_NOTE,
          },
        })
        .catch((error: unknown) => {
          console.error("[WHATSAPP_WEBHOOK] No se pudo marcar el evento ignorado", {
            eventId: event.id,
            message: error instanceof Error ? error.message : "unknown",
          });
        });

      return NextResponse.json(
        { received: true, stored: true, eventId: event.id, topic, connectedAccount: Boolean(event.connectionId), queued: false, ignored: true },
        { status: 200 },
      );
    }

    // Encolar es lo mejor que se puede: si QStash no está configurado o falla,
    // el evento ya está guardado y la recuperación lo tomará después.
    let queued = false;
    try {
      queued = await enqueueWhatsAppWebhookEvent(
        event.id,
        // Teléfono cuando llega; si no, el BSUID: así cada contacto con nombre
        // de usuario tiene su propia fila de espera y no se mezclan entre sí.
        getWhatsAppWebhookConversationKey(payload),
      );
    } catch (error) {
      console.error("[WHATSAPP_WEBHOOK] No se pudo encolar el evento", {
        eventId: event.id,
        message: error instanceof Error ? error.message : "unknown",
      });
    }

    return NextResponse.json(
      {
        received: true,
        stored: true,
        eventId: event.id,
        topic,
        connectedAccount: Boolean(event.connectionId),
        queued,
        ignored: false,
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
    return NextResponse.json(
      { received: true, stored: false, topic },
      { status: 200 },
    );
  }
}
