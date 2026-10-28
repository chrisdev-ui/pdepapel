import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { dismissOrphanGuide, linkOrphanGuide, listLinkCandidates } from "@/lib/orphan-guides";
import prismadb from "@/lib/prismadb";
import { requireJsonBody } from "@/lib/request-body";
import { verifyStoreOwner } from "@/lib/server/utils";
import { queueShipmentMilestone } from "@/lib/shipment-notifications";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * - `link` + `orderNumber`: la guía queda en ese pedido (estado real, pedido a
 *   «Enviado» si ya arrancó) y la clienta recibe UN aviso, el del estado actual,
 *   salvo que ya lo tenga (misma llave del aviso). Con `notifyCustomer: false`
 *   no le sale nada: el aviso queda como «Omitido» y la copia a Paula sale igual.
 * - `dismiss`: guía de prueba o anulada; sale de la lista para siempre.
 */
/** Pedidos sugeridos para «Vincular» (o los que coinciden con `q`): sin nombres de clientas. */
export async function GET(request: Request, { params }: { params: { storeId: string; idOrder: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);
    const query = new URL(request.url).searchParams.get("q")?.slice(0, 80) ?? null;
    const candidates = await listLinkCandidates(prismadb, { storeId: params.storeId, idOrder: params.idOrder, query });
    return NextResponse.json({ candidates }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ORPHAN_GUIDE_CANDIDATES");
  }
}

export async function POST(request: Request, { params }: { params: { storeId: string; idOrder: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = (await requireJsonBody(request, "ORPHAN_GUIDE_POST")) as { action?: unknown; orderNumber?: unknown; notifyCustomer?: unknown };
    if (body.action === "dismiss") {
      await dismissOrphanGuide(prismadb, { storeId: params.storeId, idOrder: params.idOrder, userId });
      return NextResponse.json({ ok: true }, { headers: CACHE_HEADERS.NO_CACHE });
    }
    if (body.action !== "link") throw ErrorFactory.InvalidRequest("Acción no válida: usa «link» o «dismiss»");
    const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
    if (!orderNumber) throw ErrorFactory.InvalidRequest("Escribe el número del pedido (ORD-…)");

    const result = await prismadb.$transaction((tx) => linkOrphanGuide(tx, { storeId: params.storeId, idOrder: params.idOrder, order: { orderNumber }, userId }));
    if (result.stockProductIds.length > 0) await invalidateStoreProductsCache(params.storeId, { productIds: result.stockProductIds });
    if (body.notifyCustomer !== undefined && typeof body.notifyCustomer !== "boolean") {
      throw ErrorFactory.InvalidRequest("«notifyCustomer» debe ser verdadero o falso");
    }
    const silent = body.notifyCustomer === false;
    if (result.milestone) {
      queueShipmentMilestone({
        orderId: result.orderId,
        storeId: params.storeId,
        milestone: result.milestone,
        source: "guía vinculada",
        ...(silent ? { silent: true, createdBy: userId } : {}),
      });
    }
    return NextResponse.json({ orderId: result.orderId, orderNumber: result.orderNumber, status: result.status }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ORPHAN_GUIDE_POST");
  }
}
