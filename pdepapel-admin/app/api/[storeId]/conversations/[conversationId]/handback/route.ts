import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { handBackToBot } from "@/lib/conversations";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * «Ya terminé, sigue tú»: le devuelve la conversación al bot.
 *
 * Va aparte del PATCH de estado a propósito. Ese cambia una cosa —resuelta o
 * abierta— y esto son dos, porque además quita la parada de 24 horas que deja
 * Paula al contestar desde el celular. Meterlo ahí haría que una ruta de un
 * solo campo escribiera cosas que nadie espera al leer su nombre.
 *
 * No manda ningún mensaje a la clienta: el bot solo vuelve a escuchar.
 */
export async function POST(
  _req: Request,
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

    const result = await handBackToBot(params.storeId, params.conversationId);

    if (!result.ok && result.reason === "not_found") {
      throw ErrorFactory.NotFound("La conversación no existe en esta tienda");
    }
    if (!result.ok) {
      // Entró algo entre la lectura y la escritura. No se pisa lo nuevo.
      throw ErrorFactory.Conflict(
        "La conversación cambió mientras tanto. Vuelve a abrirla y mira cómo está.",
      );
    }

    return NextResponse.json(
      { status: "OPEN", changed: result.changed },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "CONVERSATION_HANDBACK", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
    });
  }
}
