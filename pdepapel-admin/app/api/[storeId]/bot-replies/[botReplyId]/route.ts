import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import {
  parseBotReplyInput,
  parseStoredButtons,
  type BotReplyButton,
} from "@/lib/whatsapp/bot-replies";

/**
 * ¿Cambió lo que Paula aprobó? Solo el texto y los botones: renombrar la
 * respuesta o moverla de orden no cambia lo que le llega a la clienta.
 */
function changesWhatCustomerSees(
  before: { answer: string; buttons: unknown },
  after: { answer: string; buttons: BotReplyButton[] },
): boolean {
  if (before.answer !== after.answer) return true;
  const previous = parseStoredButtons(before.buttons);
  if (previous.length !== after.buttons.length) return true;
  return previous.some(
    (button, index) =>
      button.title !== after.buttons[index].title ||
      button.targetReplyId !== after.buttons[index].targetReplyId,
  );
}

/** Una respuesta de otra tienda no existe para esta: siempre se filtra por tienda. */
async function requireReply(storeId: string, botReplyId: string) {
  const existing = await prismadb.whatsAppBotReply.findFirst({
    where: { id: botReplyId, storeId },
    select: { id: true, answer: true, buttons: true, approvedAt: true },
  });
  if (!existing) throw ErrorFactory.NotFound("La respuesta automática no existe en esta tienda");
  return existing;
}

async function authorize(storeId: string, botReplyId: string) {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!storeId) throw ErrorFactory.MissingStoreId();
  if (!botReplyId) throw ErrorFactory.InvalidRequest("El ID de la respuesta es requerido");
  await verifyStoreOwner(userId, storeId);
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; botReplyId: string } },
) {
  try {
    await authorize(params.storeId, params.botReplyId);
    const existing = await requireReply(params.storeId, params.botReplyId);

    const input = parseBotReplyInput(await req.json());

    // Editar lo que ve la clienta retira la aprobación: si no, un cambio se
    // colaría al aire con el visto bueno de la versión anterior.
    const revokes = existing.approvedAt && changesWhatCustomerSees(existing, input);

    const reply = await prismadb.whatsAppBotReply.update({
      where: { id: existing.id },
      data: revokes ? { ...input, approvedAt: null, approvedBy: null } : input,
    });

    return NextResponse.json(reply, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_REPLY_PATCH", {
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

    await prismadb.whatsAppBotReply.delete({ where: { id: existing.id } });

    return NextResponse.json({ id: existing.id }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_REPLY_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}
