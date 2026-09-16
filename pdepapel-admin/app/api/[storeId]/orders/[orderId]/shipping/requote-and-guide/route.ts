import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { withResourceLock, ResourceBusyError } from "@/lib/resource-lock";
import { createGuideForOrder, requoteCartShipping } from "@/lib/shipping-helpers";
import { reconcileShippingRate } from "@/lib/shipping-rate-reconcile";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Recotizar y crear la guía de una vez.
 *
 * La cotización guardada vive dos horas. Cuando la administradora confirma el
 * pago más tarde, EnvioClick puede rechazar la tarifa vieja y el pedido se
 * queda pagado y sin guía; recuperarlo eran cinco pasos a mano.
 *
 * Solo se pregunta por la plata: si el precio nuevo se aparta de lo que pagó
 * la clienta más de lo que tolera `reconcileShippingRate`, se devuelve 409 con
 * la diferencia y se espera un `confirm: true`. Dentro del margen, sigue sola.
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.orderId) {
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");
    }
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json().catch(() => ({}));
    const confirmed = Boolean((body as { confirm?: boolean }).confirm);

    const order = await prismadb.order.findFirst({
      where: { id: params.orderId, storeId: params.storeId },
      include: { shipping: true, orderItems: true },
    });
    if (!order) throw ErrorFactory.NotFound("La orden no existe en esta tienda");
    if (!order.shipping) {
      throw ErrorFactory.InvalidRequest("La orden no tiene envío asociado");
    }
    if (order.shipping.envioClickIdOrder) {
      throw ErrorFactory.InvalidRequest("La orden ya tiene una guía creada");
    }
    if (!order.daneCode) {
      throw ErrorFactory.InvalidRequest(
        "Falta la ciudad del cliente para poder cotizar",
      );
    }

    const items = order.orderItems
      .filter((item) => item.productId)
      .map((item) => ({ productId: item.productId!, quantity: item.quantity }));
    if (items.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "El pedido no tiene productos del catálogo para cotizar",
      );
    }

    const freshRates = await requoteCartShipping({
      storeId: params.storeId,
      items,
      destination: { daneCode: order.daneCode, address: order.address ?? "" },
      contentValue: order.total,
    });
    if (freshRates.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Ninguna transportadora cubre esta ciudad ahora mismo. Elige otra transportadora a mano.",
      );
    }

    const previousCost = order.shipping.cost ?? null;
    const reconciled = reconcileShippingRate({
      rateId: order.shipping.envioClickIdRate ?? 0,
      previousCost,
      previousCarrier: order.shipping.carrierName,
      previousProduct: order.shipping.productName,
      freshRates,
    });

    // Sin la transportadora de antes no se elige por la clienta: lo decide quien
    // mira el pedido.
    if (reconciled.outcome === "unavailable") {
      return NextResponse.json(
        {
          outcome: "unavailable",
          message:
            "La transportadora de antes ya no cubre este destino. Elige otra en la sección Envío.",
          alternatives: reconciled.alternatives.slice(0, 5),
        },
        { status: 409, headers: CACHE_HEADERS.NO_CACHE },
      );
    }

    if (reconciled.outcome === "price_changed" && !confirmed) {
      return NextResponse.json(
        {
          outcome: "price_changed",
          message: "El envío cambió de precio. Confirma para crear la guía.",
          previousCost: reconciled.previousCost,
          newCost: reconciled.rate.totalCost,
          carrier: reconciled.rate.carrier,
        },
        { status: 409, headers: CACHE_HEADERS.NO_CACHE },
      );
    }

    const rate = reconciled.rate;

    // Crear una guía cobra dinero: el mismo candado que usa «Crear guía ahora».
    const result = await withResourceLock(
      `guide:${params.orderId}`,
      "Ya se está creando la guía de este pedido. Espera unos segundos y recarga la página.",
      async () => {
        const fresh = await prismadb.shipping.findUnique({
          where: { id: order.shipping!.id },
          select: { envioClickIdOrder: true },
        });
        if (fresh?.envioClickIdOrder) {
          throw ErrorFactory.Conflict("La orden ya tiene una guía creada");
        }
        await prismadb.shipping.update({
          where: { id: order.shipping!.id },
          data: {
            envioClickIdRate: rate.idRate,
            carrierName: rate.carrier,
            courier: rate.carrier,
            productName: rate.product,
            cost: rate.totalCost,
            flete: rate.flete,
            minimumInsurance: rate.minimumInsurance,
          },
        });
        return createGuideForOrder(params.orderId, params.storeId);
      },
    );

    return NextResponse.json(
      {
        outcome: "created",
        carrier: rate.carrier,
        cost: rate.totalCost,
        idOrder: result.data.idOrder,
        tracker: result.data.tracker,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    const status = error instanceof ResourceBusyError ? 409 : undefined;
    return handleErrorResponse(error, "ORDER_SHIPPING_REQUOTE_AND_GUIDE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
      ...(status ? { statusCode: status } : {}),
    });
  }
}
