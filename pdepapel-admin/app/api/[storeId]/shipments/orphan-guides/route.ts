import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { listOrphanGuides } from "@/lib/orphan-guides";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS } from "@/lib/utils";

/** Guías de EnvioClick que llegan al webhook sin un pedido del panel. Solo la dueña. */
export async function GET(_request: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);
    return NextResponse.json(await listOrphanGuides(prismadb, params.storeId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ORPHAN_GUIDES_GET");
  }
}
