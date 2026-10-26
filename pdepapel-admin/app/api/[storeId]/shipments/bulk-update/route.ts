import { auth } from "@clerk/nextjs/server";
import { ShippingStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { applyShipmentStatus } from "@/lib/shipment-status-apply";
import { isShipmentTransitionAllowed } from "@/lib/shipment-status";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { queueAppliedShipmentChanges } from "@/lib/shipment-notifications";

/** Cambio de estado sobre una selección de envíos; el pedido de cada uno sigue al envío. */
export async function PATCH(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const { shipmentIds, status } = body ?? {};

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0 || shipmentIds.some((id) => typeof id !== "string")) {
      throw ErrorFactory.InvalidRequest("Se requiere al menos un ID de envío");
    }
    if (!status || !Object.values(ShippingStatus).includes(status)) {
      throw ErrorFactory.InvalidRequest("Estado de envío inválido");
    }

    const shipments = await prismadb.shipping.findMany({
      where: { id: { in: shipmentIds }, storeId: params.storeId },
      select: { id: true, status: true },
    });
    const invalid = shipments.filter((shipment) => !isShipmentTransitionAllowed(shipment.status, status));
    if (invalid.length > 0) {
      throw ErrorFactory.InvalidRequest(
        `No se pueden actualizar ${invalid.length} envío(s) debido a transiciones de estado inválidas`,
      );
    }

    let updated = 0;
    let ordersUpdated = 0;
    const stockProductIds = new Set<string>();
    const applied: Awaited<ReturnType<typeof applyShipmentStatus>>[] = [];
    await prismadb.$transaction(async (tx) => {
      for (const shipment of shipments) {
        const result = await applyShipmentStatus(tx, { shippingId: shipment.id, storeId: params.storeId, status });
        applied.push(result);
        result?.stockProductIds.forEach((id) => stockProductIds.add(id));
        if (result?.shipmentChanged) updated += 1;
        if (result?.orderChanged) ordersUpdated += 1;
      }
    });
    if (stockProductIds.size > 0) {
      await invalidateStoreProductsCache(params.storeId, { productIds: Array.from(stockProductIds) });
    }
    queueAppliedShipmentChanges(params.storeId, applied, "edición en lote");

    return NextResponse.json({ success: true, updated, ordersUpdated }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BULK_UPDATE_SHIPMENTS");
  }
}
