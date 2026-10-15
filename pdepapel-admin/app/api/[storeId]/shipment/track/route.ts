import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import { envioClickClient } from "@/lib/envioclick";
import prismadb from "@/lib/prismadb";
import {
  TRACKING_EVENT_SELECT,
  TRACKING_SHIPPING_SELECT,
  canCustomerViewOrder,
} from "@/lib/public-orders";
import { applyShipmentStatus } from "@/lib/shipment-status-apply";
import { mapEnvioClickStatus } from "@/lib/shipment-status";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { CACHE_HEADERS, checkIfStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const getCorsHeaders = (request: Request) =>
  createCorsHeaders(request, { methods: "POST, OPTIONS" });

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

/**
 * Rastreo de un envío. La tienda manda el `orderId` y la regla es la de la
 * página del pedido (`canCustomerViewOrder`); el panel manda el `shippingId`
 * con la sesión de la dueña. La respuesta trae solo lo que el rastreo
 * necesita: nunca la guía, la dirección ni los datos de la clienta.
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const { userId } = await auth();
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.orderId === "string" ? body.orderId : null;
    const shippingId = typeof body?.shippingId === "string" ? body.shippingId : null;
    if (!orderId && !shippingId)
      throw ErrorFactory.InvalidRequest("El ID del pedido es requerido");

    const shipping = await prismadb.shipping.findFirst({
      where: {
        storeId: params.storeId,
        ...(orderId ? { orderId } : {}),
        ...(shippingId ? { id: shippingId } : {}),
      },
      select: {
        id: true,
        status: true,
        envioClickIdOrder: true,
        order: { select: { userId: true, createdBy: true } },
      },
    });

    const isStoreOwner = await checkIfStoreOwner(userId, params.storeId);
    // Sin `orderId` solo pasan la dueña y la clienta con sesión dueña del
    // pedido (la tienda anterior mandaba solo el `shippingId`).
    const allowed =
      shipping &&
      (isStoreOwner ||
        (orderId
          ? canCustomerViewOrder(shipping.order, userId)
          : Boolean(userId) && shipping.order.userId === userId));
    if (!shipping || !allowed) {
      if (!orderId && !userId) throw ErrorFactory.Unauthenticated();
      throw ErrorFactory.NotFound("Información de envío no encontrada");
    }

    if (!shipping.envioClickIdOrder)
      throw ErrorFactory.InvalidRequest(
        "No se ha creado la guía para este envío",
      );

    const trackingData = await envioClickClient.trackByOrderId(
      shipping.envioClickIdOrder,
    );

    let newStatus = shipping.status;

    if (trackingData.data && Array.isArray(trackingData.data)) {
      // El evento más reciente decide el estado; un texto desconocido lo deja como está.
      const sortedEvents = [...trackingData.data].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      newStatus = mapEnvioClickStatus(sortedEvents[0]?.status, shipping.status);

      for (const event of trackingData.data) {
        const existingEvent = await prismadb.shippingTrackingEvent.findFirst({
          where: {
            shippingId: shipping.id,
            timestamp: new Date(event.date),
            status: event.status,
          },
          select: { id: true },
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

    // Solo se escribe cuando el estado cambia: cada visita del cliente a su
    // página de rastreo no debe reiniciar la señal «sin novedades».
    const applied = await prismadb.$transaction((tx) =>
      applyShipmentStatus(tx, { shippingId: shipping.id, storeId: params.storeId, status: newStatus }),
    );
    if (applied?.stockProductIds.length) {
      await invalidateStoreProductsCache(params.storeId, { productIds: applied.stockProductIds });
    }
    const [updatedShipping, events] = await Promise.all([
      prismadb.shipping.findFirst({
        where: { id: shipping.id, storeId: params.storeId },
        select: TRACKING_SHIPPING_SELECT,
      }),
      prismadb.shippingTrackingEvent.findMany({
        where: { shippingId: shipping.id },
        orderBy: { timestamp: "desc" },
        select: TRACKING_EVENT_SELECT,
      }),
    ]);

    return NextResponse.json(
      { success: true, shipping: updatedShipping, events },
      { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "TRACK_SHIPMENT", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
