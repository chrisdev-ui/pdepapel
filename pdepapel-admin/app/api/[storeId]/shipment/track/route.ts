import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import { envioClickClient } from "@/lib/envioclick";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, checkIfStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { ShippingStatus } from "@prisma/client";
import { NextResponse } from "next/server";

const getCorsHeaders = (request: Request) =>
  createCorsHeaders(request, { methods: "POST, OPTIONS" });

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
  try {
    const { userId: userLogged } = auth();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const isStoreOwner = userLogged
      ? await checkIfStoreOwner(userLogged, params.storeId)
      : false;

    const body = await req.json();
    const { shippingId, guestId } = body;

    if (!shippingId)
      throw ErrorFactory.InvalidRequest("El ID de envío es requerido");

    if (!userLogged && !guestId) {
      throw ErrorFactory.Unauthenticated();
    }

    // Find shipping with order relation to verify ownership
    const shipping = await prismadb.shipping.findUnique({
      where: { id: shippingId, storeId: params.storeId },
      include: {
        order: true,
      },
    });

    if (!shipping)
      throw ErrorFactory.NotFound("Información de envío no encontrada");

    // Verify ownership against the authenticated session or the guest identifier.
    const isOwner =
      isStoreOwner ||
      (userLogged && shipping.order.userId === userLogged) ||
      (guestId && shipping.order.guestId === guestId);

    if (!isOwner) throw ErrorFactory.Unauthorized();

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
      {
        headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
      },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "TRACK_SHIPMENT", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
