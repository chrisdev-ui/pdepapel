import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { setCapsuleLicenseAllowed } from "@/lib/capsule-suggestion-data";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** «Permitir en cápsulas» para un producto que parece de personaje o licencia. */
export async function PUT(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (typeof body.productId !== "string" || !body.productId) throw ErrorFactory.InvalidRequest("Falta el producto");
    return NextResponse.json(await setCapsuleLicenseAllowed({ storeId: params.storeId, productId: body.productId, allowed: body.allowed }), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_LICENSE_PUT", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404] });
  }
}
