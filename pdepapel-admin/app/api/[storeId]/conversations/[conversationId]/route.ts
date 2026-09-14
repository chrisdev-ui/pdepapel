import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { conversationStatusUpdateSchema } from "@/lib/conversations";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Lo único que se cambia de una conversación desde el panel es su estado:
 * marcarla como resuelta o reabrirla. Las respuestas siguen saliendo del
 * celular de la dueña, así que aquí no se envía nada.
 */
export async function PATCH(
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

    const body = await req.json();
    const parsed = conversationStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw ErrorFactory.InvalidRequest("El estado de la conversación no es válido");
    }

    const existing = await prismadb.conversation.findFirst({
      where: { id: params.conversationId, storeId: params.storeId },
      select: { id: true },
    });
    if (!existing) {
      throw ErrorFactory.NotFound("La conversación no existe en esta tienda");
    }

    const conversation = await prismadb.conversation.update({
      where: { id: existing.id },
      data: { status: parsed.data.status },
      select: { id: true, status: true },
    });

    return NextResponse.json(conversation, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CONVERSATION_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}
