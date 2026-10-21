import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { getSocialPostCurve } from "@/lib/social/report";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** La curva de una publicación (fotos de métricas en el tiempo). */
export async function GET(_request: Request, { params }: { params: { storeId: string; postId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    const curve = await getSocialPostCurve(prismadb, params.storeId, params.postId);
    if (!curve) throw ErrorFactory.NotFound("No encontramos esa publicación");
    return NextResponse.json({ curve }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_POST_CURVE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
