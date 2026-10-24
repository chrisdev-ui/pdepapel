import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { isCopilotConfigured } from "@/lib/copiloto/config";
import { readSkillState, recordSkillEvent } from "@/lib/copiloto/skill-state";
import { getCopilotSkill } from "@/lib/copiloto/skills";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";
import { requireJsonBody } from "@/lib/request-body";

const schema = z.object({ action: z.enum(["add", "remove"]), skillId: z.string().trim().min(1).max(40) });

async function ownConversation(storeId: string, conversationId: string) {
  const userId = await requireStoreOwner(storeId);
  if (!isCopilotConfigured()) throw ErrorFactory.NotFound("El copiloto no está configurado");
  const conversation = await prismadb.assistantConversation.findFirst({ where: { id: conversationId, storeId, userId }, select: { id: true } });
  if (!conversation) throw ErrorFactory.NotFound("Conversación no encontrada");
  return conversation.id;
}

/** Habilidades de una conversación propia: las que van al modelo, las fijadas y las que Paula quitó. */
export async function GET(_request: Request, { params }: { params: { storeId: string; conversationId: string } }) {
  try {
    const conversationId = await ownConversation(params.storeId, params.conversationId);
    return NextResponse.json(await readSkillState(conversationId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COPILOTO_HABILIDADES_GET", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [404] });
  }
}

/**
 * Quitar (queda bloqueada en esta conversación) o agregar (queda fija). Solo
 * anota la corrección; no vuelve a responder: eso lo pide Paula con
 * «Responder de nuevo».
 */
export async function POST(request: Request, { params }: { params: { storeId: string; conversationId: string } }) {
  try {
    const conversationId = await ownConversation(params.storeId, params.conversationId);
    const parsed = schema.safeParse(await requireJsonBody(request, "COPILOTO_HABILIDADES_POST"));
    if (!parsed.success || !getCopilotSkill(parsed.data.skillId)) throw ErrorFactory.InvalidRequest("Habilidad inválida");
    const [before, lastAnswer] = await Promise.all([
      readSkillState(conversationId),
      prismadb.assistantMessage.findFirst({ where: { conversationId, role: "assistant" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    ]);
    await recordSkillEvent(conversationId, {
      action: parsed.data.action === "add" ? "added" : "removed",
      skillId: parsed.data.skillId,
      modelChosenSkills: before.modelChosen,
      messageId: lastAnswer?.id ?? null,
    });
    return NextResponse.json(await readSkillState(conversationId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COPILOTO_HABILIDADES_POST", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404] });
  }
}
