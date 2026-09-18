import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { getProductDeleteCheck } from "@/lib/product-deletion";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Qué impide eliminar el producto, para mostrarlo antes de intentarlo. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const check = await getProductDeleteCheck(prismadb, {
      storeId: params.storeId,
      productId: params.productId,
    });
    if (!check) throw ErrorFactory.NotFound("Producto no encontrado");
    return NextResponse.json(check, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_DELETE_CHECK", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
