import { auth } from "@clerk/nextjs/server";
import { type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { parseOrderRequestMetadata } from "@/lib/conversations";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Descarta el «pedido solicitado» que el bot dejó en la conversación: la
 * tarjeta y la marca de la lista se apagan. No le escribe nada a la clienta.
 */
export async function DELETE(_req: Request, { params }: { params: { storeId: string; conversationId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const conversation = await prismadb.conversation.findFirst({
      where: { id: params.conversationId, storeId: params.storeId },
      select: { id: true },
    });
    if (!conversation) throw ErrorFactory.NotFound("La conversación no existe en esta tienda");

    const pending = await prismadb.conversationMessage.findMany({
      where: {
        conversationId: conversation.id,
        metadata: { path: "$.orderRequest.status", equals: "pending" },
      },
      select: { id: true, metadata: true },
      take: 50,
    });
    const dismissedAt = new Date().toISOString();
    for (const message of pending) {
      const record = parseOrderRequestMetadata(message.metadata);
      if (!record) continue;
      await prismadb.conversationMessage.update({
        where: { id: message.id },
        data: {
          metadata: {
            ...(message.metadata as Record<string, unknown>),
            orderRequest: { ...record, status: "dismissed", dismissedAt, dismissedBy: userId },
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return NextResponse.json({ dismissed: pending.length }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CONVERSATION_ORDER_REQUEST_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}
