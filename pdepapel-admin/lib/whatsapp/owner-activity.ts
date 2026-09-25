/**
 * `lastOwnerAt`: la marca de «Paula acaba de escribir» que aparta al bot.
 *
 * Módulo a propósito ligero —solo Prisma— porque lo llama el webhook en el
 * momento de recibir el eco, antes de encolar nada. El resto de la lógica
 * de conversaciones (`conversation-sync.ts`) arrastra al bot entero y no
 * tiene por qué cargarse en la ruta.
 *
 * Por qué existe: el eco de Paula entra a la MISMA fila de QStash que los
 * mensajes de esa clienta (la llave de flujo es su teléfono), de a uno y en
 * orden. Si la clienta acaba de mandar una ráfaga, cada mensaje retiene la
 * fila mientras corre el bot —hasta 7 s de pausa humana más el envío—, y el
 * eco se procesa cuando ya se contestó encima de ella. El 2026-09-24
 * (conversación 98ee6263) el eco llevaba 1,7 s y 15,5 s en nuestras manos
 * cuando el bot mandó sus dos mensajes; `shouldStayQuiet` releyó
 * `lastOwnerAt` justo antes de enviar, como debe, y lo encontró vacío porque
 * el evento que lo escribe seguía esperando turno.
 *
 * La marca se escribe aquí, en la ruta, y también sigue escribiéndose desde
 * la fila: las dos son idempotentes porque nunca la mueven hacia atrás.
 */
import { ConversationChannel } from "@prisma/client";

import prismadb from "@/lib/prismadb";

export type OwnerActivityOutcome = "stamped" | "unchanged" | "no_conversation";

/**
 * Deja `lastOwnerAt` en `at` solo si `at` es más reciente que lo guardado (o
 * no había nada). Una sola sentencia con la condición en el `where`: no hay
 * leer-y-escribir, así que dos escrituras a la vez no se pisan, y un
 * reintento tardío de Meta con un eco viejo no acorta el silencio del bot.
 */
export async function bumpLastOwnerAt(
  conversationId: string,
  at: Date,
): Promise<boolean> {
  const result = await prismadb.conversation.updateMany({
    where: {
      id: conversationId,
      OR: [{ lastOwnerAt: null }, { lastOwnerAt: { lt: at } }],
    },
    data: { lastOwnerAt: at },
  });
  return (result?.count ?? 0) > 0;
}

/**
 * Lo que hace el webhook al recibir un eco: encuentra la conversación por su
 * identidad y le pone la marca. No crea conversaciones —eso sigue siendo
 * trabajo de la fila—: si no existe todavía, tampoco hay bot que frenar.
 *
 * Busca primero por BSUID (la identidad que no se pierde) y luego por
 * teléfono, igual que `resolveConversation`, para caer en la misma fila
 * aunque el contacto esté fusionado.
 */
export async function markOwnerActivity(
  storeId: string,
  identity: { phone: string | null; bsuid: string | null },
  at: Date,
): Promise<OwnerActivityOutcome> {
  const channel = ConversationChannel.WHATSAPP;
  const { phone, bsuid } = identity;

  const conversation =
    (bsuid
      ? await prismadb.conversation.findUnique({
          where: { storeId_channel_bsuid: { storeId, channel, bsuid } },
          select: { id: true },
        })
      : null) ??
    (phone
      ? await prismadb.conversation.findUnique({
          where: { storeId_channel_phone: { storeId, channel, phone } },
          select: { id: true },
        })
      : null);

  if (!conversation) return "no_conversation";
  return (await bumpLastOwnerAt(conversation.id, at)) ? "stamped" : "unchanged";
}
