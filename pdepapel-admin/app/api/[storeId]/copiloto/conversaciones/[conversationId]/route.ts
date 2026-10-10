import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { isCopilotConfigured } from "@/lib/copiloto/config";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

/** Los mensajes de una conversación propia, en orden. */
export async function GET(_request: Request, { params }: { params: { storeId: string; conversationId: string } }) {
  try {
    const userId = await requireStoreOwner(params.storeId);
    if (!isCopilotConfigured()) throw ErrorFactory.NotFound("El copiloto no está configurado");
    const conversation = await prismadb.assistantConversation.findFirst({
      where: { id: params.conversationId, storeId: params.storeId, userId },
      select: { id: true, title: true },
    });
    if (!conversation) throw ErrorFactory.NotFound("Conversación no encontrada");
    const messages = await prismadb.assistantMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, parts: true, feedback: true },
    });
    return NextResponse.json({ ...conversation, messages }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COPILOTO_CONVERSACION_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
