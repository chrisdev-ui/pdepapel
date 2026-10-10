import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { isCopilotConfigured } from "@/lib/copiloto/config";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

const schema = z.object({ value: z.enum(["up", "down"]), note: z.string().trim().max(500).optional() });

/** Pulgar arriba o abajo a una respuesta propia; un pulgar abajo la marca para revisión. */
export async function POST(request: Request, { params }: { params: { storeId: string; messageId: string } }) {
  try {
    const userId = await requireStoreOwner(params.storeId);
    if (!isCopilotConfigured()) throw ErrorFactory.NotFound("El copiloto no está configurado");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw ErrorFactory.InvalidRequest("Valoración inválida");
    const updated = await prismadb.assistantMessage.updateMany({
      where: { id: params.messageId, role: "assistant", conversation: { storeId: params.storeId, userId } },
      data: { feedback: parsed.data.value, feedbackNote: parsed.data.note || null },
    });
    if (updated.count === 0) throw ErrorFactory.NotFound("Respuesta no encontrada");
    return NextResponse.json({ ok: true }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COPILOTO_VALORACION_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
