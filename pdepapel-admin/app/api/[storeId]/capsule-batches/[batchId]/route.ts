import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { unpackCapsuleBatch } from "@/lib/capsule-batches";
import { requireStoreOwner } from "@/lib/store-access";

/** Deshacer un lote: las cápsulas vuelven a ser sus productos de origen. */
export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; batchId: string } },
) {
  try {
    const userId = await requireStoreOwner(params.storeId);
    return NextResponse.json(
      await unpackCapsuleBatch({
        storeId: params.storeId,
        batchId: params.batchId,
        userId,
      }),
    );
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_BATCH_DELETE");
  }
}
