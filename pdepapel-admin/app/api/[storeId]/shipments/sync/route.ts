import { auth } from "@clerk/nextjs/server";
import { ShippingProvider, ShippingStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { envioClickClient } from "@/lib/envioclick";
import prismadb from "@/lib/prismadb";
import { applyShipmentStatus, mapEnvioClickStatus } from "@/lib/shipment-status";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const BATCH_SIZE = 50;

/** Consulta en lote los envíos activos de EnvioClick y escribe solo los que cambian. */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const activeShipments = await prismadb.shipping.findMany({
      where: {
        storeId: params.storeId,
        provider: ShippingProvider.ENVIOCLICK,
        envioClickIdOrder: { not: null },
        status: { notIn: [ShippingStatus.Delivered, ShippingStatus.Cancelled, ShippingStatus.Returned] },
      },
      select: { id: true, envioClickIdOrder: true, status: true },
    });

    if (activeShipments.length === 0) {
      return NextResponse.json({ message: "No hay envíos activos por sincronizar", processed: 0, updated: 0, ordersUpdated: 0, errors: [] }, { headers: CACHE_HEADERS.NO_CACHE });
    }

    const errors: { id?: string; batchIndex?: number; error: string }[] = [];
    let updated = 0;
    let ordersUpdated = 0;

    for (let i = 0; i < activeShipments.length; i += BATCH_SIZE) {
      const batch = activeShipments.slice(i, i + BATCH_SIZE);
      const orderIds = batch.map((s) => s.envioClickIdOrder).filter((id): id is number => id !== null);
      if (orderIds.length === 0) continue;

      try {
        const trackingData = await envioClickClient.trackBatch(orderIds);
        if (trackingData.status !== "OK") throw new Error("La consulta en lote a EnvioClick falló");

        for (const shipment of batch) {
          if (!shipment.envioClickIdOrder) continue;
          const trackInfo = trackingData.data[shipment.envioClickIdOrder.toString()];
          if (typeof trackInfo === "string") {
            errors.push({ id: shipment.id, error: trackInfo });
            continue;
          }
          const newStatus = mapEnvioClickStatus(trackInfo?.status, shipment.status);
          if (newStatus === shipment.status) continue;
          const result = await prismadb.$transaction((tx) =>
            applyShipmentStatus(tx, { shippingId: shipment.id, storeId: params.storeId, status: newStatus }),
          );
          if (result?.shipmentChanged) updated += 1;
          if (result?.orderChanged) ordersUpdated += 1;
        }
      } catch (error) {
        console.error("[SHIPMENT_SYNC] batch error:", error);
        errors.push({ batchIndex: i, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return NextResponse.json(
      { message: "Sincronización completada", processed: activeShipments.length, updated, ordersUpdated, errors },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "SHIPMENT_SYNC");
  }
}
