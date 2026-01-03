import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { ShippingProvider } from "@prisma/client";
import { ShippingStatus } from "@prisma/client";
import { envioClickClient } from "@/lib/envioclick";

// Helper to map EnvioClick string status to our Enum
// This might overlap with existing logic, but good to have safe fallback
const mapStatus = (ecStatus: string): ShippingStatus => {
  const s = ecStatus.toUpperCase();
  if (s.includes("DELIVERED") || s.includes("ENTREGADO"))
    return ShippingStatus.Delivered;
  if (s.includes("PICKED_UP") || s.includes("RECOLECTADO"))
    return ShippingStatus.PickedUp;
  if (s.includes("TRANSIT") || s.includes("TRANSITO"))
    return ShippingStatus.InTransit;
  if (s.includes("EXCEPTION") || s.includes("EXCEPCION"))
    return ShippingStatus.Exception;
  if (s.includes("CANCELED") || s.includes("CANCELADO"))
    return ShippingStatus.Cancelled;

  return ShippingStatus.InTransit; // Default fallback for unknown "In Progress" states
};

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Verify store ownership
    const store = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId,
      },
    });

    if (!store) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // 1. Find all active EnvioClick shipments
    // We ignore Delivered, Canceled, or Returned to save API calls
    const activeShipments = await prismadb.shipping.findMany({
      where: {
        storeId: params.storeId,
        provider: ShippingProvider.ENVIOCLICK,
        envioClickIdOrder: { not: null },
        status: {
          notIn: [
            ShippingStatus.Delivered,
            ShippingStatus.Cancelled,
            ShippingStatus.Returned,
          ],
        },
      },
      select: {
        id: true,
        envioClickIdOrder: true,
        status: true,
      },
    });

    if (activeShipments.length === 0) {
      return NextResponse.json({
        message: "No active shipments to sync",
        updated: 0,
        errors: [],
      });
    }

    // 2. Prepare batches (EnvioClick might have limits, doing 50 at a time)
    const BATCH_SIZE = 50;
    const errors: any[] = [];
    let updatedCount = 0;

    for (let i = 0; i < activeShipments.length; i += BATCH_SIZE) {
      const batch = activeShipments.slice(i, i + BATCH_SIZE);
      const orderIds = batch
        .map((s: { envioClickIdOrder: number | null }) => s.envioClickIdOrder)
        .filter((id: number | null): id is number => id !== null);

      if (orderIds.length === 0) continue;

      try {
        const trackingData = await envioClickClient.trackBatch(orderIds);

        if (trackingData.status !== "OK") {
          throw new Error("Batch tracking failed");
        }

        // 3. Process results
        for (const shipment of batch) {
          if (!shipment.envioClickIdOrder) continue;

          const trackInfo =
            trackingData.data[shipment.envioClickIdOrder.toString()];

          // API returns string error if specific ID failed
          if (typeof trackInfo === "string") {
            errors.push({ id: shipment.id, error: trackInfo });
            continue;
          }

          // Map status
          // Note: trackInfo.status is the code (e.g. "DELIVERED"), statusDetail is human readable
          const newStatus = mapStatus(trackInfo.status);

          if (newStatus !== shipment.status) {
            await prismadb.shipping.update({
              where: { id: shipment.id },
              data: { status: newStatus },
            });
            updatedCount++;
          }
        }
      } catch (error: any) {
        console.error("Batch error:", error);
        errors.push({ batchIndex: i, error: error.message });
      }
    }

    return NextResponse.json({
      message: "Sync complete",
      processed: activeShipments.length,
      updated: updatedCount,
      errors,
    });
  } catch (error) {
    console.error("[SHIPMENT_SYNC]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
