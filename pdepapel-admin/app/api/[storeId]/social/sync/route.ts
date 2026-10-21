import { SocialAccountStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { enqueueSocialSync, isSocialQueueConfigured } from "@/lib/social/queue";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** «Sincronizar ahora»: encola las cuentas conectadas de la tienda; el trabajo corre en la cola, no aquí. */
export async function POST(_request: Request, { params }: { params: { storeId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    if (!isSocialQueueConfigured()) throw ErrorFactory.Conflict("La cola no está configurada en el servidor.");
    const accounts = await prismadb.socialAccount.findMany({ where: { storeId: params.storeId, status: SocialAccountStatus.OK }, select: { id: true } });
    let enqueued = 0;
    for (const account of accounts) if (await enqueueSocialSync({ accountId: account.id })) enqueued += 1;
    return NextResponse.json({ enqueued }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_SYNC_NOW", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
