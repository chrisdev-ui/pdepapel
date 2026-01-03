import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { ShippingStatus } from "@prisma/client";

import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.orderId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");

    const body = await req.json();
    const {
      provider = "MANUAL",
      carrierName,
      trackingCode,
      cost,
      courier,
      notes,
      estimatedDeliveryDate,
    } = body;

    const order = await prismadb.order.findUnique({
      where: {
        id: params.orderId,
        storeId: params.storeId,
      },
      include: {
        shipping: true,
      },
    });

    if (!order) throw ErrorFactory.NotFound("Orden no encontrada");

    if (order.shipping)
      throw ErrorFactory.NotFound("La orden ya tiene un envío asociado");

    if (provider === "MANUAL") {
      if (!carrierName) {
        throw ErrorFactory.InvalidRequest(
          "El nombre del transportista es obligatorio para envíos manuales",
        );
      }
    }

    const shipping = await prismadb.shipping.create({
      data: {
        storeId: params.storeId,
        orderId: params.orderId,
        provider,
        status: ShippingStatus.Preparing,
        carrierName,
        trackingCode: trackingCode || null,
        cost: cost || 0,
        courier: courier || null,
        notes: notes || null,
        estimatedDeliveryDate: estimatedDeliveryDate
          ? new Date(estimatedDeliveryDate)
          : null,
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            fullName: true,
          },
        },
      },
    });

    return NextResponse.json(shipping, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error: any) {
    return handleErrorResponse(error, "CREATE_MANUAL_SHIPPING", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
