import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { envioClickClient } from "@/lib/envioclick";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { ShippingStatus } from "@prisma/client";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { shippingId } = await req.json();

    const shipping = await prismadb.shipping.findUnique({
      where: { id: shippingId, storeId: params.storeId },
    });

    if (!shipping)
      throw ErrorFactory.NotFound("Información de envío no encontrada");

    if (!shipping.envioClickIdOrder)
      throw ErrorFactory.InvalidRequest(
        "No se ha creado la guía para este envío",
      );

    const trackingData = await envioClickClient.trackByOrderId(
      shipping.envioClickIdOrder,
    );

    let newStatus = shipping.status;

    if (trackingData.data && Array.isArray(trackingData.data)) {
      // Sort by date desc to get latest
      const sortedEvents = [...trackingData.data].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      const latestEvent = sortedEvents[0];

      if (latestEvent) {
        // Map EnvioClick status to Prisma ShippingStatus
        // EnvioClick statuses: GENERATED, PICKED_UP, ON_TRANSIT, DELIVERED, CANCELED, RETURNED
        switch (latestEvent.status.toUpperCase()) {
          case "GENERATED":
            newStatus = ShippingStatus.Shipped;
            break;
          case "PICKED_UP":
            newStatus = ShippingStatus.PickedUp;
            break;
          case "ON_TRANSIT":
            newStatus = ShippingStatus.InTransit;
            break;
          case "WITH_DELIVERY_COURIER":
            newStatus = ShippingStatus.OutForDelivery;
            break;
          case "DELIVERED":
            newStatus = ShippingStatus.Delivered;
            break;
          case "CANCELED":
            newStatus = ShippingStatus.Cancelled;
            break;
          case "RETURNED":
            newStatus = ShippingStatus.Returned;
            break;
          case "EXCEPTION":
            newStatus = ShippingStatus.Exception;
            break;
        }
      }

      for (const event of trackingData.data) {
        const existingEvent = await prismadb.shippingTrackingEvent.findFirst({
          where: {
            shippingId: shipping.id,
            timestamp: new Date(event.date),
            status: event.status,
          },
        });

        if (!existingEvent) {
          await prismadb.shippingTrackingEvent.create({
            data: {
              shippingId: shipping.id,
              status: event.status,
              description: event.description || event.status,
              location: event.location || null,
              timestamp: new Date(event.date),
            },
          });
        }
      }
    }

    const updatedShipping = await prismadb.shipping.update({
      where: { id: shipping.id },
      data: {
        status: newStatus,
      },
    });

    const events = await prismadb.shippingTrackingEvent.findMany({
      where: { shippingId: shipping.id },
      orderBy: { timestamp: "desc" },
    });

    return NextResponse.json(
      {
        success: true,
        shipping: updatedShipping,
        tracking: trackingData.data,
        events,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "TRACK_SHIPMENT", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
