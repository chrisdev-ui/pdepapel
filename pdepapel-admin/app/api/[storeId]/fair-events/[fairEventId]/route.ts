import { scrubFairEvent } from "@/lib/viewer-payloads";
import { requireStoreRead } from "@/lib/store-access";
import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { getFairEventDetail } from "@/lib/fair-events";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const access = await requireStoreRead(params.storeId);

    const detail = await getFairEventDetail(params.storeId, params.fairEventId);
    // Solo lectura: la feria se ve sin el costo de compra de cada producto.
    return NextResponse.json(access.role === "viewer" ? scrubFairEvent(detail) : detail);
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_GET");
  }
}
