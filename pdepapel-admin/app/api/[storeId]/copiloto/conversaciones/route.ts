import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { isCopilotConfigured } from "@/lib/copiloto/config";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

/** Las conversaciones de quien pregunta, las más recientes primero. */
export async function GET(_request: Request, { params }: { params: { storeId: string } }) {
  try {
    const userId = await requireStoreOwner(params.storeId);
    if (!isCopilotConfigured()) throw ErrorFactory.NotFound("El copiloto no está configurado");
    const conversations = await prismadb.assistantConversation.findMany({
      where: { storeId: params.storeId, userId },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
      select: { id: true, title: true, lastMessageAt: true },
    });
    return NextResponse.json(conversations, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COPILOTO_CONVERSACIONES_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
