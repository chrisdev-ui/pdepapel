import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { getSocialDashboard } from "@/lib/social/access";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** «Métricas de redes»: solo la dueña, solo la base (nunca llama a Meta ni a TikTok). */
export async function GET(request: Request, { params }: { params: { storeId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    const days = Number(new URL(request.url).searchParams.get("dias") ?? 30);
    return NextResponse.json(await getSocialDashboard(params.storeId, Number.isFinite(days) ? days : 30), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
