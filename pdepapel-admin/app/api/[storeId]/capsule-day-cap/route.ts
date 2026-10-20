import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { setTodayCapsuleCap } from "@/lib/capsule-day-cap";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** Cambia el tope de pedidos de cápsulas de hoy (día de Bogotá). Solo la dueña. */
export async function PUT(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = (await req.json().catch(() => null)) as { cap?: unknown } | null;
    return NextResponse.json(await setTodayCapsuleCap({ storeId: params.storeId, cap: body?.cap, userId }), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_DAY_CAP", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 401, 403, 409] });
  }
}
