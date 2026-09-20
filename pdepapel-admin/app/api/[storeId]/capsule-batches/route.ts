import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { packCapsules } from "@/lib/capsule-batches";
import { requireStoreOwner } from "@/lib/store-access";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const userId = await requireStoreOwner(params.storeId);
    const body = await req.json();
    const batch = await packCapsules({
      storeId: params.storeId,
      capsuleProductId: String(body.capsuleProductId ?? ""),
      quantity: Number(body.quantity),
      sources: Array.isArray(body.sources)
        ? body.sources.map((source: { productId: string; quantity: number }) => ({
            productId: String(source.productId ?? ""),
            quantity: Number(source.quantity),
          }))
        : [],
      notes: body.notes ?? null,
      userId,
    });
    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_BATCHES_POST");
  }
}
