import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getPresaleReleasePreview, releasePresale } from "@/lib/presale-release";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Liberar: llegó la mercancía, los pedidos salen al despacho normal.
 *
 * GET devuelve lo que se va a hacer (cuántas unidades, cuántos pedidos, si
 * alcanza el stock) para poder confirmarlo antes. POST lo hace.
 */

async function authorize(storeId: string, presaleId: string) {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!storeId) throw ErrorFactory.MissingStoreId();
  if (!presaleId) throw ErrorFactory.InvalidRequest("El ID de la preventa es requerido");
  await verifyStoreOwner(userId, storeId);
  return userId;
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; presaleId: string } },
) {
  try {
    await authorize(params.storeId, params.presaleId);
    const preview = await getPresaleReleasePreview(params.storeId, params.presaleId);

    return NextResponse.json(
      {
        canRelease: preview.canRelease,
        pendingUnits: preview.pendingUnits,
        availableStock: preview.availableStock,
        orders: preview.lines.length,
        product: preview.presale.product,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRESALE_RELEASE_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; presaleId: string } },
) {
  try {
    const userId = await authorize(params.storeId, params.presaleId);
    const result = await releasePresale({
      storeId: params.storeId,
      presaleId: params.presaleId,
      releasedBy: userId,
    });

    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PRESALE_RELEASE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}
