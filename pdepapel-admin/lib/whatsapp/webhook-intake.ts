import {
  MarketplaceProvider,
  MarketplaceWebhookEventStatus,
  Prisma,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";
import {
  IGNORED_EVENT_NOTE,
  countSkippedEvent,
  findIgnoredContact,
} from "@/lib/whatsapp/ignored-contacts";
import { markOwnerActivity } from "@/lib/whatsapp/owner-activity";
import { enqueueWhatsAppWebhookEvent } from "@/lib/whatsapp/queue";
import { recordSelfChatCommands } from "@/lib/whatsapp/admin-commands";
import { businessPhoneOf, scanSelfChat } from "@/lib/whatsapp/self-chat";
import {
  classifyWhatsAppWebhookEvent,
  getWhatsAppWebhookConversationKey,
  getWhatsAppWebhookIdentity,
  getWhatsAppWebhookOwnerEchoAt,
  parseWhatsAppWebhookPayload,
} from "@/lib/whatsapp/webhook";

/**
 * Tienda a la que atribuir el evento cuando no hay conexión por `sellerId`.
 *
 * Solo se consulta si hay identidad que comprobar, para no meter una consulta
 * de más en el camino caliente de los eventos sin remitente (cambios de
 * plantilla y demás).
 */
export async function resolveFallbackStoreId(identity: {
  phone: string | null;
  bsuid: string | null;
}): Promise<string | null> {
  if (!identity.phone && !identity.bsuid) return null;
  const store = await prismadb.store.findFirst({ select: { id: true } });
  return store?.id ?? null;
}

/**
 * Guarda un cuerpo ya autenticado y lo encola. La usan el webhook y el
 * reintento firmado; lanza si la base no lo puede guardar.
 */
/** Nota de los eventos que son solo chat de Paula consigo misma: se guardan y no se archivan como conversación. */
export const SELF_CHAT_EVENT_NOTE = "Chat consigo misma: no es una conversación con clienta.";

/**
 * `signed`: la entrega traía firma válida (Chakra o Meta). Solo entonces se
 * aprende el número del negocio y se guardan comandos; el reintento interno
 * no la conserva y por eso nunca ejecuta comandos.
 */
export async function ingestWhatsAppWebhook(body: string, options: { signed?: boolean } = {}) {
  const payload = parseWhatsAppWebhookPayload(body);
  const { topic, resource, sellerId, eventKey } =
    classifyWhatsAppWebhookEvent(payload);

  const connection = sellerId
    ? await prismadb.marketplaceConnection.findFirst({
        where: { provider: MarketplaceProvider.WHATSAPP, sellerId },
        select: { id: true, storeId: true, selfPhone: true, selfBsuid: true },
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
   * Chat consigo misma. Va antes de los ignorados y de marcar el eco de
   * Paula: no es una clienta y no debe crear ni tocar conversaciones.
   */
  const selfChat = await handleSelfChat(payload, event.id, connection, Boolean(options.signed));
  if (selfChat.closed || (selfChat.ownLane && connection)) {
    let queued = false;
    if (!selfChat.closed && connection) {
      // Solo comandos: a su fila, sin pasar por ignorados ni por la marca del eco de Paula.
      queued = await enqueueWhatsAppWebhookEvent(event.id, `self:${connection.storeId}`).catch((error: unknown) => {
        console.error("[WHATSAPP_WEBHOOK] No se pudo encolar el comando", {
          eventId: event.id,
          message: error instanceof Error ? error.message : "unknown",
        });
        return false;
      });
    }
    return {
      received: true,
      stored: true,
      eventId: event.id,
      topic,
      connectedAccount: Boolean(event.connectionId),
      queued,
      ignored: false,
      selfChat: true,
    };
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
  // Se resuelve una vez y se reusa más abajo para marcar el eco de Paula.
  let storeId: string | null = null;
  try {
    storeId = connection?.storeId ?? (await resolveFallbackStoreId(identity));
    ignored = storeId ? await findIgnoredContact(storeId, identity) : null;
  } catch (error) {
    // Si no se puede comprobar, se sigue como siempre: encolar de más es
    // recuperable, dejar de atender a una clienta no lo es.
    console.error(
      "[WHATSAPP_WEBHOOK] No se pudo consultar la lista de ignorados",
      {
        eventId: event.id,
        message: error instanceof Error ? error.message : "unknown",
      },
    );
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
        console.error(
          "[WHATSAPP_WEBHOOK] No se pudo marcar el evento ignorado",
          {
            eventId: event.id,
            message: error instanceof Error ? error.message : "unknown",
          },
        );
      });

    return {
      received: true,
      stored: true,
      eventId: event.id,
      topic,
      connectedAccount: Boolean(event.connectionId),
      queued: false,
      ignored: true,
    };
  }

  /*
   * Eco de Paula: `lastOwnerAt` se marca AQUÍ, antes de encolar.
   *
   * El eco entra a la misma fila que los mensajes de esa clienta, de a uno
   * y en orden. Si ella acaba de mandar una ráfaga, cada mensaje retiene
   * la fila mientras corre el bot (hasta 7 s de pausa más el envío) y el
   * eco se procesa cuando ya se contestó encima de Paula. El 2026-09-24 el
   * eco llevaba 1,7 s y 15,5 s en nuestras manos cuando salieron los dos
   * mensajes del bot: `shouldStayQuiet` releyó la marca justo antes de
   * enviar, como debe, y la encontró vacía porque el evento que la escribe
   * seguía esperando turno.
   *
   * Una consulta indexada y una sola sentencia con guarda (nunca mueve la
   * marca hacia atrás). Si falla, se sigue: la fila la escribirá igual.
   */
  const ownerEchoAt = getWhatsAppWebhookOwnerEchoAt(payload);
  if (ownerEchoAt && storeId) {
    try {
      await markOwnerActivity(storeId, identity, ownerEchoAt);
    } catch (error) {
      console.error(
        "[WHATSAPP_WEBHOOK] No se pudo marcar lastOwnerAt al recibir el eco",
        {
          eventId: event.id,
          message: error instanceof Error ? error.message : "unknown",
        },
      );
    }
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

  return {
    received: true,
    stored: true,
    eventId: event.id,
    topic,
    connectedAccount: Boolean(event.connectionId),
    queued,
    ignored: false,
  };
}

/**
 * Aprende el número y el BSUID del negocio (solo de entregas firmadas: con
 * el token, alguien podría hacer pasar a una clienta por el negocio y sacarla
 * de las listas), guarda los comandos y cierra el evento si todo él es chat
 * consigo misma y no trae comandos que ejecutar.
 */
async function handleSelfChat(
  payload: ReturnType<typeof parseWhatsAppWebhookPayload>,
  eventId: string,
  connection: { id: string; storeId: string; selfPhone: string | null; selfBsuid: string | null } | null,
  signed: boolean,
): Promise<{ closed: boolean; ownLane: boolean }> {
  const scan = scanSelfChat(payload, connection?.selfBsuid ?? null);
  const selfEchoes = scan.echoes.filter((echo) => echo.selfChat);

  if (signed && connection) {
    const phone = scan.learned.phone ?? businessPhoneOf(payload);
    const bsuid = scan.learned.bsuid;
    const data = {
      ...(phone && phone !== connection.selfPhone ? { selfPhone: phone } : {}),
      ...(bsuid && bsuid !== connection.selfBsuid ? { selfBsuid: bsuid } : {}),
    };
    if (Object.keys(data).length > 0) {
      await prismadb.marketplaceConnection.update({ where: { id: connection.id }, data }).catch((error: unknown) => {
        console.error("[WHATSAPP_WEBHOOK] No se pudo guardar el número del negocio", {
          message: error instanceof Error ? error.message : "unknown",
        });
      });
    }
  }

  if (selfEchoes.length === 0) return { closed: false, ownLane: false };

  let commands = 0;
  if (signed && connection) {
    try {
      commands = await recordSelfChatCommands(connection.storeId, selfEchoes);
    } catch (error) {
      // Sin la fila no hay comando: se pierde ese, pero el webhook no falla.
      console.error("[WHATSAPP_WEBHOOK] No se pudo guardar el comando", {
        eventId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  } else if (selfEchoes.some((echo) => echo.text?.trim().startsWith("/"))) {
    console.warn("[WHATSAPP_WEBHOOK] Comando sin firma: no se ejecuta", { eventId });
  }

  // Un cuerpo mezclado (nunca visto) sigue en la fila de la clienta; el procesador salta los ecos propios.
  if (!scan.onlySelfChat || commands > 0) return { closed: false, ownLane: scan.onlySelfChat };

  await prismadb.marketplaceWebhookEvent
    .update({
      where: { id: eventId },
      data: {
        status: MarketplaceWebhookEventStatus.PROCESSED,
        processedAt: new Date(),
        nextRetryAt: null,
        lastError: SELF_CHAT_EVENT_NOTE,
      },
    })
    .catch((error: unknown) => {
      console.error("[WHATSAPP_WEBHOOK] No se pudo cerrar el evento del chat consigo misma", {
        eventId,
        message: error instanceof Error ? error.message : "unknown",
      });
    });
  return { closed: true, ownLane: true };
}
