import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { packFairCapsules } from "@/lib/fair-events";
import { requireStoreOwner } from "@/lib/store-access";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const userId = await requireStoreOwner(params.storeId);

    const { productId, quantity, salePrice, minimumMarginPct } =
      await req.json();
    return NextResponse.json(
      await packFairCapsules({
        storeId: params.storeId,
        fairEventId: params.fairEventId,
        productId,
        quantity: Number(quantity),
        salePrice: Number(salePrice),
        minimumMarginPct: Number(minimumMarginPct),
      }),
      { status: 201 },
    );
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_CAPSULES_POST");
  }
}
