import { auth } from "@clerk/nextjs";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { envioClickClient } from "@/lib/envioclick";
import { Prisma, ShippingStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { CACHE_HEADERS } from "@/lib/utils";
import { getColombiaDate } from "@/lib/date-utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { headers } from "next/headers";

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

    if (!shipping || !shipping.envioClickIdOrder)
      throw ErrorFactory.NotFound("Envío no encontrado o sin guía creada");

    const result = await envioClickClient.cancelOrders([
      shipping.envioClickIdOrder,
    ]);

    if (result.data.not_valid_orders.includes(shipping.envioClickIdOrder)) {
      throw new Error(
        "No fue posible cancelar el envío. Esto puede ocurrir si el paquete ya fue recolectado, está en tránsito o si la guía ya fue anulada. Verifica el estado en el rastreo o contacta a soporte.",
      );
    }

    const cancelTime = format(getColombiaDate(), "yyyy-MM-dd HH:mm:ss", {
      locale: es,
    });

    await prismadb.shipping.update({
      where: { id: shipping.id, storeId: params.storeId },
      data: {
        status: ShippingStatus.Preparing,
        envioClickIdOrder: null,
        trackingCode: null,
        guideUrl: null,
        guidePdfBase64: null,
        externalOrderId: null,
        requestPickup: false,
        pickupDate: null,
        originData: Prisma.DbNull,
        destinationData: Prisma.DbNull,
        trackingUrl: null,
        deliveryDays: null,
        estimatedDeliveryDate: null,
        actualDeliveryDate: null,
        notes: shipping.notes
          ? `${shipping.notes}\nGuía cancelada: ${cancelTime}`
          : `Guía cancelada: ${cancelTime}`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Envío cancelado exitosamente",
        result: result.data,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "CANCEL_SHIPPING", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
