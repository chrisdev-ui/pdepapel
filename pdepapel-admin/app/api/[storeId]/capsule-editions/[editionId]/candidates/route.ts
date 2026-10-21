import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { giftCandidates, slipCandidates } from "@/lib/capsule-pool";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * `?tipo=papeles&categorias=a,b` (quietos por categoría y banda; `&todos=1`
 * suma los que sí se venden) o `?tipo=regalos` (quietos dentro del tope de
 * regalo). Solo la dueña.
 */
export async function GET(req: Request, { params }: { params: { storeId: string; editionId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const search = new URL(req.url).searchParams;
    const candidates =
      search.get("tipo") === "regalos"
        ? await giftCandidates({ storeId: params.storeId, editionId: params.editionId })
        : await slipCandidates({
            storeId: params.storeId,
            editionId: params.editionId,
            categoryIds: (search.get("categorias") ?? "").split(",").map((id) => id.trim()).filter(Boolean),
            onlyIdle: search.get("todos") !== "1",
          });
    return NextResponse.json({ candidates }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_CANDIDATES_GET", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404] });
  }
}
