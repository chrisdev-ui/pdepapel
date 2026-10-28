import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ShippingStatus } from "@prisma/client";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { SHIPPING_WITHOUT_GUIDE_PDF } from "@/lib/shipping-guide-pdf";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { autoAdoptOrphanGuide } from "@/lib/orphan-guides";
import { milestoneForStatus } from "@/lib/shipment-milestones";
import { queueShipmentMilestone } from "@/lib/shipment-notifications";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
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
        shipping: SHIPPING_WITHOUT_GUIDE_PDF,
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
      ...SHIPPING_WITHOUT_GUIDE_PDF,
      include: {
        order: {
          select: {
            orderNumber: true,
            fullName: true,
          },
        },
      },
    });

    if (shipping.trackingCode) {
      queueShipmentMilestone({ orderId: params.orderId, storeId: params.storeId, milestone: "guia_creada", source: "guía manual" });
      // Si ese número es el de una guía hecha en envioclick.com, se adopta y
      // la clienta recibe el hito al que llegó (si no lo tiene ya).
      const adopted = await autoAdoptOrphanGuide(prismadb, { storeId: params.storeId, orderId: params.orderId, resolvedBy: userId }).catch((error) => {
        console.error("[CREATE_MANUAL_SHIPPING] No se pudo adoptar la guía de EnvioClick:", error);
        return null;
      });
      if (adopted?.stockProductIds.length) await invalidateStoreProductsCache(params.storeId, { productIds: adopted.stockProductIds });
      const milestone = adopted && adopted.status !== adopted.previousStatus ? milestoneForStatus(adopted.status) : null;
      if (milestone && milestone !== "guia_creada") {
        queueShipmentMilestone({ orderId: params.orderId, storeId: params.storeId, milestone, source: "guía de EnvioClick adoptada" });
      }
    }
    return NextResponse.json(shipping, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error: any) {
    return handleErrorResponse(error, "CREATE_MANUAL_SHIPPING", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
