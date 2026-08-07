import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { packFairCapsules } from "@/lib/fair-events";
import { verifyStoreOwner } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

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
