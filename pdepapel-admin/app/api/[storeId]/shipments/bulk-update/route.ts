import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { ShippingStatus } from "@prisma/client";
import prismadb from "@/lib/prismadb";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import { ALLOWED_TRANSITIONS } from "@/constants";

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    const { shipmentIds, status } = body;

    if (
      !shipmentIds ||
      !Array.isArray(shipmentIds) ||
      shipmentIds.length === 0
    ) {
      throw ErrorFactory.InvalidRequest("Se requiere al menos un ID de envío");
    }

    if (!status || !Object.values(ShippingStatus).includes(status)) {
      throw ErrorFactory.InvalidRequest("Estado de envío inválido");
    }

    // Fetch current shipments to validate transitions
    const shipments = await prismadb.shipping.findMany({
      where: {
        id: { in: shipmentIds },
        storeId: params.storeId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    // Validate all transitions
    const invalidTransitions: string[] = [];
    shipments.forEach((shipment) => {
      const allowedStatuses = ALLOWED_TRANSITIONS[shipment.status];
      if (!allowedStatuses.includes(status)) {
        invalidTransitions.push(shipment.id);
      }
    });

    if (invalidTransitions.length > 0) {
      throw ErrorFactory.InvalidRequest(
        `No se pueden actualizar ${invalidTransitions.length} envío(s) debido a transiciones de estado inválidas`,
      );
    }

    // Update all shipments
    const result = await prismadb.shipping.updateMany({
      where: {
        id: { in: shipmentIds },
        storeId: params.storeId,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      updated: result.count,
    });
  } catch (error: any) {
    return handleErrorResponse(error, "BULK_UPDATE_SHIPMENTS");
  }
}
