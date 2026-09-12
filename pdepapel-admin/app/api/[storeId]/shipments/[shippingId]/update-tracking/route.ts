import { auth } from "@clerk/nextjs/server";
import { ShippingProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { envioClickClient } from "@/lib/envioclick";
import prismadb from "@/lib/prismadb";
import { applyShipmentStatus, mapEnvioClickStatus } from "@/lib/shipment-status";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * «Actualizar rastreo» de un envío de EnvioClick desde el panel. Escribe solo
 * cuando el estado cambia, así `updatedAt` sigue midiendo el silencio real de
 * la transportadora; el pedido sigue al envío.
 */
export async function POST(req: Request, { params }: { params: { storeId: string; shippingId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);
    if (!params.shippingId) throw ErrorFactory.InvalidRequest("Se requiere ID de envío");

    const shipping = await prismadb.shipping.findFirst({
      where: { id: params.shippingId, storeId: params.storeId },
      select: { id: true, status: true, provider: true, envioClickIdOrder: true, estimatedDeliveryDate: true },
    });
    if (!shipping) throw ErrorFactory.NotFound("Envío no encontrado");
    if (shipping.provider !== ShippingProvider.ENVIOCLICK) {
      throw ErrorFactory.InvalidRequest("Solo se pueden actualizar envíos de EnvioClick");
    }
    if (!shipping.envioClickIdOrder) {
      throw ErrorFactory.InvalidRequest("El envío no tiene un ID de orden de EnvioClick");
    }

    const trackingResponse = await envioClickClient.trackByOrderId(shipping.envioClickIdOrder);
    if (trackingResponse.status !== "OK") throw new Error("No se pudo obtener información de rastreo");
    const trackingData = trackingResponse.data;
    if (typeof trackingData === "string") throw new Error(trackingData);

    let newStatus = shipping.status;
    let realDeliveryDate: string | null | undefined;
    if (Array.isArray(trackingData) && trackingData.length > 0) {
      const latest = [...trackingData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      newStatus = mapEnvioClickStatus(latest?.status, shipping.status);
    } else if (trackingData && typeof trackingData === "object" && "status" in trackingData) {
      newStatus = mapEnvioClickStatus((trackingData as { status?: string }).status, shipping.status);
      realDeliveryDate = (trackingData as { realDeliveryDate?: string | null }).realDeliveryDate ?? undefined;
    }

    const deliveryDate = realDeliveryDate ? new Date(realDeliveryDate) : undefined;
    const deliveryChanged =
      deliveryDate !== undefined && deliveryDate.getTime() !== (shipping.estimatedDeliveryDate?.getTime() ?? Number.NaN);

    const result = await prismadb.$transaction((tx) =>
      applyShipmentStatus(tx, {
        shippingId: shipping.id,
        storeId: params.storeId,
        status: newStatus,
        extra: deliveryChanged ? { estimatedDeliveryDate: deliveryDate } : undefined,
      }),
    );

    const updatedShipping = await prismadb.shipping.findFirst({ where: { id: shipping.id, storeId: params.storeId } });

    return NextResponse.json(
      { success: true, shipping: updatedShipping, trackingInfo: trackingData, changed: Boolean(result?.shipmentChanged), orderStatus: result?.orderStatus ?? null },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "UPDATE_TRACKING");
  }
}
