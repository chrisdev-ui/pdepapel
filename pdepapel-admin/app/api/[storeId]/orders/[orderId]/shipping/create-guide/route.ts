import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { ErrorFactory } from "@/lib/api-errors";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import { OrderStatus } from "@prisma/client";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = auth();

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
        shipping: true,
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

    // Verificar que la orden esté pagada
    if (order.status !== OrderStatus.PAID) {
      throw ErrorFactory.InvalidRequest(
        "La orden debe estar en estado PAGADA para crear la guía",
      );
    }

    // Verificar que tenga un idRate
    if (!order.shipping.envioClickIdRate) {
      throw ErrorFactory.InvalidRequest(
        "La orden no tiene una cotización de envío",
      );
    }

    // Verificar que NO tenga guía creada
    if (order.shipping.envioClickIdOrder) {
      throw ErrorFactory.InvalidRequest("La orden ya tiene una guía creada");
    }

    // Crear la guía
    const result = await createGuideForOrder(params.orderId, params.storeId);

    return NextResponse.json(
      {
        success: true,
        message: "Guía creada exitosamente",
        data: {
          idOrder: result.data.idOrder,
          tracker: result.data.tracker,
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[ORDER_SHIPPING_CREATE_GUIDE]", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: error.statusCode || 500 },
    );
  }
}
