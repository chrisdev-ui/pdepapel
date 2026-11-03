import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";
import { ErrorFactory } from "@/lib/api-errors";
import { describeGuideBlock } from "@/lib/order-transitions";
import { existingGuide, GUIDE_IN_PROGRESS_MESSAGE } from "@/lib/guide-claim";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import { ResourceBusyError, withResourceLock } from "@/lib/resource-lock";
import { SHIPPING_WITHOUT_GUIDE_PDF } from "@/lib/shipping-guide-pdf";
import { queueShipmentMilestone } from "@/lib/shipment-notifications";
import { safeError } from "@/lib/log-redaction";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!params.orderId) {
      return NextResponse.json(
        { error: "Order ID es requerido" },
        { status: 400 },
      );
    }

    // Verificar que la tienda existe y pertenece al usuario
    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Obtener la orden con shipping
    const order = await prismadb.order.findUnique({
      where: {
        id: params.orderId,
        storeId: params.storeId,
      },
      include: {
        shipping: SHIPPING_WITHOUT_GUIDE_PDF,
      },
    });

    if (!order) {
      throw ErrorFactory.NotFound("Orden no encontrada");
    }

    if (!order.shipping) {
      throw ErrorFactory.InvalidRequest(
        "La orden no tiene información de envío",
      );
    }

    const guideBlock = describeGuideBlock(order.status, order.shipping.isCOD);
    if (guideBlock) throw ErrorFactory.InvalidRequest(guideBlock);

    // Verificar que tenga un idRate
    if (!order.shipping.envioClickIdRate) {
      throw ErrorFactory.InvalidRequest(
        "La orden no tiene una cotización de envío",
      );
    }

    // Ya tiene guía (otra pestaña, un doble clic que llegó tarde): se responde con la que hay.
    if (order.shipping.envioClickIdOrder) {
      return guideResponse(existingGuide(order.shipping));
    }

    // Crear una guía cobra dinero. El candado de Redis frena el doble clic; la reserva en la fila
    // del envío (createGuideForOrder → lib/guide-claim.ts) es la que garantiza una sola guía.
    const result = await withResourceLock(
      `guide:${params.orderId}`,
      GUIDE_IN_PROGRESS_MESSAGE,
      () => createGuideForOrder(params.orderId, params.storeId),
    );

    if (!result.alreadyExisted) {
      queueShipmentMilestone({ orderId: params.orderId, storeId: params.storeId, milestone: "guia_creada", source: "crear guía" });
    }
    return guideResponse(result);
  } catch (error: any) {
    console.error("[ORDER_SHIPPING_CREATE_GUIDE]", safeError(error));
    const status =
      error instanceof ResourceBusyError ? 409 : error.statusCode || 500;
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status },
    );
  }
}

function guideResponse(result: { alreadyExisted: boolean; data: { idOrder: number; tracker?: string | null } }) {
  return NextResponse.json(
    {
      success: true,
      alreadyCreated: result.alreadyExisted,
      message: result.alreadyExisted ? "El pedido ya tenía guía" : "Guía creada exitosamente",
      data: { idOrder: result.data.idOrder, tracker: result.data.tracker ?? null },
    },
    { status: 200 },
  );
}
