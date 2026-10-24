import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { runInBackground } from "@/lib/background";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { printFromPanel } from "@/lib/capsule-print";
import { withIdempotency } from "@/lib/idempotency";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { requireJsonBody } from "@/lib/request-body";

/** Imprime papeles o regalos (apartan en el producto real). Un doble clic con la misma llave no imprime dos veces. Solo la dueña. */
export async function POST(req: Request, { params }: { params: { storeId: string; editionId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return await withIdempotency(req, params.storeId, async () => {
      const body = await requireJsonBody(req, "CAPSULE_SLIPS_POST");
      if (!body || typeof body !== "object" || !Array.isArray(body.items)) throw ErrorFactory.InvalidRequest("Datos de la impresión inválidos");
      const items = body.items.map((line: { productId?: unknown; quantity?: unknown }) => ({ productId: String(line.productId ?? ""), quantity: Number(line.quantity) }));
      const result = await printFromPanel({ storeId: params.storeId, editionId: params.editionId, kind: body.kind, items, userId });
      // Lo apartado deja de estar disponible en la tienda; la purga va después de responder.
      const productIds = items.map((line: { productId: string }) => line.productId);
      runInBackground("cápsulas: purga tras imprimir", () => invalidateStoreProductsCache(params.storeId, { productIds }));
      return NextResponse.json(result, { status: 201, headers: CACHE_HEADERS.NO_CACHE });
    }, CACHE_HEADERS.NO_CACHE);
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_SLIPS_POST", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
