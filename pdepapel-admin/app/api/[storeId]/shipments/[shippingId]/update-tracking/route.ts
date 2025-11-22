import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { ShippingProvider, ShippingStatus } from "@prisma/client";
import prismadb from "@/lib/prismadb";
import { envioClickClient } from "@/lib/envioclick";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";

// Map EnvioClick status to our ShippingStatus
function mapEnvioClickStatus(status: string): ShippingStatus {
  const statusMap: Record<string, ShippingStatus> = {
    "En preparación": ShippingStatus.Preparing,
    Despachado: ShippingStatus.Shipped,
    Recogido: ShippingStatus.PickedUp,
    "En tránsito": ShippingStatus.InTransit,
    "En reparto": ShippingStatus.OutForDelivery,
    Entregado: ShippingStatus.Delivered,
    "Entrega fallida": ShippingStatus.FailedDelivery,
    Devuelto: ShippingStatus.Returned,
    Cancelado: ShippingStatus.Cancelled,
  };

  return statusMap[status] || ShippingStatus.Exception;
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

    // Update shipping record
    const updatedShipping = await prismadb.shipping.update({
      where: { id: params.shippingId },
      data: {
        status: mapEnvioClickStatus(trackingData.status),
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
