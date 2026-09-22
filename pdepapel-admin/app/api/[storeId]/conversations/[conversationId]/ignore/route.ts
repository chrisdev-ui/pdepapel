import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { ignoreConversationContact, unignoreConversationContact } from "@/lib/conversations";
import { validateIgnoreReason } from "@/lib/whatsapp/ignored-contacts";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * «Ignorar este contacto»: el panel deja de reflejar lo que llegue de él.
 *
 * Va aparte del resto de acciones porque no cambia la conversación, sino lo
 * que el webhook hace con los eventos que vengan después: deja de encolarlos
 * y con eso deja de gastar cuota de QStash, que es lo que se agotó el 21 de
 * septiembre de 2026 y dejó sin atender a clientas reales durante horas.
 *
 * **No toca el WhatsApp de Paula.** Ella sigue viendo y contestando a ese
 * contacto desde su celular; lo único que se detiene es la copia del panel y
 * el bot. Los eventos se siguen guardando crudos, así que dejar de ignorar
 * recupera lo que llegó mientras tanto.
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string; conversationId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.conversationId) {
      throw ErrorFactory.InvalidRequest("El ID de la conversación es requerido");
    }
    await verifyStoreOwner(userId, params.storeId);

    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = validateIgnoreReason(body.reason);
    if (!reason) {
      // Sin motivo no se ignora: una lista de números sin explicación es
      // imposible de revisar después, y es justo la que silencia a alguien
      // por error sin que nadie sepa por qué.
      throw ErrorFactory.InvalidRequest(
        "Escribe por qué se ignora este contacto (al menos 10 caracteres).",
      );
    }

    const result = await ignoreConversationContact(
      params.storeId,
      params.conversationId,
      { reason, userId },
    );
    if (!result.ok && result.reason === "not_found") {
      throw ErrorFactory.NotFound("La conversación no existe en esta tienda");
    }
    if (!result.ok) {
      throw ErrorFactory.InvalidRequest(
        "Esta conversación no tiene teléfono ni identificador de Meta, así que no hay nada exacto que ignorar.",
      );
    }

    return NextResponse.json(
      { ignored: true, phone: result.phone, bsuid: result.bsuid },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "CONVERSATION_IGNORE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}

/** «Dejar de ignorar»: vuelve a reflejarse y el bot vuelve a escuchar. */
export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; conversationId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const result = await unignoreConversationContact(
      params.storeId,
      params.conversationId,
    );
    if (!result.ok) {
      throw ErrorFactory.NotFound("La conversación no existe en esta tienda");
    }

    return NextResponse.json(
      { ignored: false, removed: result.removed, pending: result.pending },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "CONVERSATION_UNIGNORE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}
