import { ALLOWED_TRANSITIONS } from "@/constants";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { ShippingStatus } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; shippingId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.shippingId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de envío");

    const shipping = await prismadb.shipping.findUnique({
      where: {
        id: params.shippingId,
        storeId: params.storeId,
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            fullName: true,
            phone: true,
            address: true,
            city: true,
            department: true,
            total: true,
            status: true,
          },
        },
        trackingEvents: {
          orderBy: { timestamp: "desc" },
        },
      },
    });

    if (!shipping) throw ErrorFactory.NotFound("Envío no encontrado");

    return NextResponse.json(shipping, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error: any) {
    return handleErrorResponse(error, "GET_SHIPPING_BY_ID", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; shippingId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.shippingId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de envío");

    const body = await req.json();
    const {
      status,
      trackingCode,
      carrierName,
      cost,
      notes,
      courier,
      estimatedDeliveryDate,
      actualDeliveryDate,
      ...otherFields
    } = body;

    const currentShipping = await prismadb.shipping.findUnique({
      where: {
        id: params.shippingId,
        storeId: params.storeId,
      },
    });

    if (!currentShipping) throw ErrorFactory.NotFound("Envío no encontrado");

    if (status && status !== currentShipping.status) {
      const allowedNextStatuses =
        ALLOWED_TRANSITIONS[currentShipping.status as ShippingStatus];

      if (!allowedNextStatuses.includes(status as ShippingStatus)) {
        throw ErrorFactory.InvalidRequest(
          `No se puede cambiar el estado de ${currentShipping.status} a ${status}`,
          {
            allowedStatuses: allowedNextStatuses,
          },
        );
      }
    }

    const updatedShipping = await prismadb.shipping.update({
      where: {
        id: params.shippingId,
        storeId: params.storeId,
      },
      data: {
        ...(status && { status }),
        ...(trackingCode && { trackingCode }),
        ...(carrierName && { carrierName }),
        ...(cost !== undefined && { cost }),
        ...(courier && { courier }),
        ...(notes !== undefined && { notes }),
        ...(estimatedDeliveryDate && {
          estimatedDeliveryDate: new Date(estimatedDeliveryDate),
        }),
        ...(actualDeliveryDate && {
          actualDeliveryDate: new Date(actualDeliveryDate),
        }),
        ...otherFields,
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

    return NextResponse.json(updatedShipping, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error: any) {
    return handleErrorResponse(error, "PATCH_SHIPPING_BY_ID", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; shippingId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.shippingId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de envío");

    const shipping = await prismadb.shipping.findUnique({
      where: {
        id: params.shippingId,
        storeId: params.storeId,
      },
    });

    if (!shipping) throw ErrorFactory.NotFound("Envío no encontrado");

    if (shipping.envioClickIdOrder)
      throw ErrorFactory.InvalidRequest(
        "No se puede eliminar un envío que ya tiene una guía creada. Por favor, cancele la guía primero.",
      );

    await prismadb.shipping.delete({
      where: {
        id: params.shippingId,
        storeId: params.storeId,
      },
    });

    return NextResponse.json(
      { success: true, message: "Envío eliminado exitosamente" },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "DELETE_SHIPPING_BY_ID", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
