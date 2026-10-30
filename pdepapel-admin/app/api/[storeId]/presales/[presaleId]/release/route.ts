import { requireStoreRead } from "@/lib/store-access";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { runInBackground } from "@/lib/background";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { sendPreorderUnfulfilledEmail } from "@/lib/email";
import { readOptionalJsonBody } from "@/lib/request-body";
import { getPresaleReleasePreview, releasePresale } from "@/lib/presale-release";
import { queueMercadoLibreSyncAfterPresaleChange } from "@/lib/mercadolibre/outbox";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

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

/** Lectura: la dueña o una cuenta de solo lectura con esta tienda permitida. */
async function authorizeRead(storeId: string, presaleId: string) {
  if (!storeId) throw ErrorFactory.MissingStoreId();
  if (!presaleId) throw ErrorFactory.InvalidRequest("El ID de la preventa es requerido");
  await requireStoreRead(storeId);
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; presaleId: string } },
) {
  try {
    await authorizeRead(params.storeId, params.presaleId);
    const preview = await getPresaleReleasePreview(params.storeId, params.presaleId);

    return NextResponse.json(
      {
        canRelease: preview.canRelease,
        canReleasePartial: preview.canReleasePartial,
        pendingUnits: preview.pendingUnits,
        availableStock: preview.availableStock,
        orders: new Set(preview.lines.map((line) => line.orderId)).size,
        partial: {
          releaseUnits: preview.partialPlan.releaseUnits,
          releaseOrders: preview.partialPlan.releaseOrderIds.length,
          unfulfilledUnits: preview.partialPlan.unfulfilledUnits,
          unfulfilledOrders: preview.partialPlan.unfulfilledOrderIds.length,
        },
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
  req: Request,
  { params }: { params: { storeId: string; presaleId: string } },
) {
  try {
    const userId = await authorize(params.storeId, params.presaleId);
    // «Liberar» completo se manda sin cuerpo; «Liberar lo que llegó» trae el reparto confirmado.
    const body = await readOptionalJsonBody<{ partial?: unknown; expectedReleaseUnits?: unknown }>(req, "PRESALE_RELEASE_POST", {});
    const result = await releasePresale({
      storeId: params.storeId,
      presaleId: params.presaleId,
      releasedBy: userId,
      partial: body.partial === true,
      expectedReleaseUnits: typeof body.expectedReleaseUnits === "number" ? body.expectedReleaseUnits : undefined,
    });
    // «Sin unidad»: a quien no le alcanzó se le avisa por correo (Paula la contacta por WhatsApp).
    for (const orderId of result.unfulfilledOrderIds) {
      runInBackground("correo de preventa sin unidad", () => sendPreorderUnfulfilledEmail(orderId));
    }
    // Liberar mueve stock y apaga la preventa: la ficha pasa a venta normal.
    const released = await prismadb.productPresale.findUnique({ where: { id: params.presaleId }, select: { productId: true } });
    if (released) {
      await invalidateStoreProductsCache(params.storeId, { productIds: [released.productId] });
      // Mercado Libre recupera las unidades solo si ya no queda ninguna línea de preventa sin liberar.
      await queueMercadoLibreSyncAfterPresaleChange(released.productId);
    }

    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PRESALE_RELEASE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
    });
  }
}
