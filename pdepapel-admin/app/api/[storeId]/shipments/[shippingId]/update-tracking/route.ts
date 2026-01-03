import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { ShippingProvider } from "@prisma/client";
import { ShippingStatus } from "@prisma/client";
import prismadb from "@/lib/prismadb";
import { envioClickClient } from "@/lib/envioclick";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";
import { checkIfStoreOwner } from "@/lib/db-utils";

// Map EnvioClick status to our ShippingStatus
function mapEnvioClickStatus(status: string): ShippingStatus {
  // EnvioClick can return either English codes or Spanish text
  const normalizedStatus = status.toUpperCase();

  const statusMap: Record<string, ShippingStatus> = {
    // English status codes
    GENERATED: ShippingStatus.Shipped,
    PICKED_UP: ShippingStatus.PickedUp,
    ON_TRANSIT: ShippingStatus.InTransit,
    WITH_DELIVERY_COURIER: ShippingStatus.OutForDelivery,
    DELIVERED: ShippingStatus.Delivered,
    CANCELED: ShippingStatus.Cancelled,
    CANCELLED: ShippingStatus.Cancelled,
    RETURNED: ShippingStatus.Returned,
    EXCEPTION: ShippingStatus.Exception,
    FAILED_DELIVERY: ShippingStatus.FailedDelivery,
    // Spanish status text (from tracking API)
    "PENDIENTE DE RECOLECCIÓN": ShippingStatus.Preparing,
    "PENDIENTE DE RECOLECCION": ShippingStatus.Preparing,
    "EN PREPARACIÓN": ShippingStatus.Preparing,
    "EN PREPARACION": ShippingStatus.Preparing,
    DESPACHADO: ShippingStatus.Shipped,
    RECOGIDO: ShippingStatus.PickedUp,
    "EN TRÁNSITO": ShippingStatus.InTransit,
    "EN TRANSITO": ShippingStatus.InTransit,
    "EN REPARTO": ShippingStatus.OutForDelivery,
    ENTREGADO: ShippingStatus.Delivered,
    "ENTREGA FALLIDA": ShippingStatus.FailedDelivery,
    DEVUELTO: ShippingStatus.Returned,
    CANCELADO: ShippingStatus.Cancelled,
  };

  return statusMap[normalizedStatus] || ShippingStatus.Exception;
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; shippingId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.shippingId)
      throw ErrorFactory.InvalidRequest("Se requiere ID de envío");

    // Verify user is store owner
    const isStoreOwner = await checkIfStoreOwner(userId, params.storeId);
    if (!isStoreOwner) throw ErrorFactory.Unauthorized();

    // Fetch shipping record
    const shipping = await prismadb.shipping.findUnique({
      where: {
        id: params.shippingId,
        storeId: params.storeId,
      },
    });

    if (!shipping) throw ErrorFactory.NotFound("Envío no encontrado");

    // Only update EnvioClick shipments
    if (shipping.provider !== ShippingProvider.ENVIOCLICK) {
      throw ErrorFactory.InvalidRequest(
        "Solo se pueden actualizar envíos de EnvioClick",
      );
    }

    if (!shipping.envioClickIdOrder) {
      throw ErrorFactory.InvalidRequest(
        "El envío no tiene un ID de orden de EnvioClick",
      );
    }

    // Fetch tracking info from EnvioClick
    const trackingResponse = await envioClickClient.trackByOrderId(
      shipping.envioClickIdOrder,
    );

    if (trackingResponse.status !== "OK") {
      throw new Error("No se pudo obtener información de rastreo");
    }

    const trackingData = trackingResponse.data;

    if (typeof trackingData === "string") {
      throw new Error(trackingData); // Error message from API
    }

    console.log(
      "[UPDATE_TRACKING] EnvioClick response data:",
      JSON.stringify(trackingData, null, 2),
    );

    // Determine the latest status from events if available
    let newStatus = shipping.status;

    if (Array.isArray(trackingData) && trackingData.length > 0) {
      // Sort by date desc to get latest event
      const sortedEvents = [...trackingData].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      const latestEvent = sortedEvents[0];
      console.log("[UPDATE_TRACKING] Latest event:", latestEvent);
      if (latestEvent?.status) {
        newStatus = mapEnvioClickStatus(latestEvent.status);
        console.log(
          "[UPDATE_TRACKING] Mapped status from event:",
          latestEvent.status,
          "->",
          newStatus,
        );
      }
    } else if (trackingData?.status) {
      // If data is an object with status field
      console.log(
        "[UPDATE_TRACKING] Direct status from data:",
        trackingData.status,
      );
      newStatus = mapEnvioClickStatus(trackingData.status);
      console.log("[UPDATE_TRACKING] Mapped status:", newStatus);
    }

    console.log(
      "[UPDATE_TRACKING] Final status to save:",
      newStatus,
      "Type:",
      typeof newStatus,
    );

    // Update shipping record
    const updatedShipping = await prismadb.shipping.update({
      where: { id: params.shippingId },
      data: {
        status: newStatus,
        // Additional fields from tracking
        ...(trackingData.realDeliveryDate && {
          estimatedDeliveryDate: new Date(trackingData.realDeliveryDate),
        }),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      shipping: updatedShipping,
      trackingInfo: trackingData,
    });
  } catch (error: any) {
    return handleErrorResponse(error, "UPDATE_TRACKING");
  }
}
