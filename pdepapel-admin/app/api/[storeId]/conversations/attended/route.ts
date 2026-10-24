import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { MAX_ATTENDED_PER_REQUEST, markWaitsAttended } from "@/lib/whatsapp/waiting-list";
import { requireJsonBody } from "@/lib/request-body";

const bodySchema = z.object({
  ids: z.array(z.string().min(1).max(191)).min(1).max(MAX_ATTENDED_PER_REQUEST),
});

/**
 * «Marcar como atendido», de una conversación o de todas las de «Esperando a
 * Paula». No le manda nada a la clienta: solo guarda quién y cuándo.
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const parsed = bodySchema.safeParse(await requireJsonBody(req, "CONVERSATIONS_ATTENDED"));
    if (!parsed.success) {
      throw ErrorFactory.InvalidRequest("Elige al menos una conversación.");
    }
    const ids = Array.from(new Set(parsed.data.ids));
    const count = await markWaitsAttended(params.storeId, ids, userId);
    return NextResponse.json({ count }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CONVERSATIONS_ATTENDED", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400],
    });
  }
}
