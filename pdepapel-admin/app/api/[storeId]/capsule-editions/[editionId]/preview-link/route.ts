import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { editionPathSegment } from "@/lib/capsule-public";
import { createCapsulePreviewToken, isCapsulePreviewConfigured } from "@/lib/capsule-preview";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

/** El enlace firmado para ver la edición en la tienda con la venta apagada (14 días). Solo la dueña. */
export async function POST(_req: Request, { params }: { params: { storeId: string; editionId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    if (!isCapsulePreviewConfigured()) {
      return NextResponse.json({ error: "La vista previa no está configurada en este servidor" }, { status: 503, headers: CACHE_HEADERS.NO_CACHE });
    }
    const edition = await prismadb.capsuleEdition.findFirst({ where: { id: params.editionId, storeId: params.storeId }, select: { id: true, number: true, name: true, status: true } });
    if (!edition) throw ErrorFactory.NotFound("Edición no encontrada");
    if (edition.status === "CLOSED") throw ErrorFactory.Conflict("Una edición cerrada no se muestra en la tienda");
    const { token, expiresAt } = createCapsulePreviewToken({ storeId: params.storeId, editionId: edition.id });
    const url = new URL(`/capsulas/${editionPathSegment(edition)}`, env.FRONTEND_STORE_URL);
    url.searchParams.set("vista", token);
    return NextResponse.json({ url: url.toString(), expiresAt: expiresAt.toISOString() }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_PREVIEW_LINK", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [404, 409] });
  }
}
