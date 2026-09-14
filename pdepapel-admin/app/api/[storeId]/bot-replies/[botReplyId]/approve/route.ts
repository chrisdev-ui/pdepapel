import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { parseStoredButtons } from "@/lib/whatsapp/bot-replies";

/**
 * Visto bueno de Paula a un menú.
 *
 * Una respuesta con botones no sale hasta tenerlo. POST aprueba, DELETE lo
 * retira (y el menú deja de mandarse de inmediato, sin tener que apagarlo).
 */

async function authorize(storeId: string, botReplyId: string) {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!storeId) throw ErrorFactory.MissingStoreId();
  if (!botReplyId) throw ErrorFactory.InvalidRequest("El ID de la respuesta es requerido");
  await verifyStoreOwner(userId, storeId);
  return userId;
}

async function requireReply(storeId: string, botReplyId: string) {
  const existing = await prismadb.whatsAppBotReply.findFirst({
    where: { id: botReplyId, storeId },
    select: { id: true, buttons: true },
  });
  if (!existing) {
    throw ErrorFactory.NotFound("La respuesta automática no existe en esta tienda");
  }
  return existing;
}

export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; botReplyId: string } },
) {
  try {
    const userId = await authorize(params.storeId, params.botReplyId);
    const existing = await requireReply(params.storeId, params.botReplyId);

    // Aprobar algo sin botones no significa nada: se avisa en vez de fingir.
    if (parseStoredButtons(existing.buttons).length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Esta respuesta no tiene botones, así que no necesita aprobación.",
      );
    }

    const reply = await prismadb.whatsAppBotReply.update({
      where: { id: existing.id },
      data: { approvedAt: new Date(), approvedBy: userId },
      select: { id: true, approvedAt: true, approvedBy: true },
    });

    return NextResponse.json(reply, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_REPLY_APPROVE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; botReplyId: string } },
) {
  try {
    await authorize(params.storeId, params.botReplyId);
    const existing = await requireReply(params.storeId, params.botReplyId);

    const reply = await prismadb.whatsAppBotReply.update({
      where: { id: existing.id },
      data: { approvedAt: null, approvedBy: null },
      select: { id: true, approvedAt: true },
    });

    return NextResponse.json(reply, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_REPLY_APPROVE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}
