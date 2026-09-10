import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";
import { ErrorFactory } from "@/lib/api-errors";
import { Prisma } from "@prisma/client";

export async function DELETE(
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

    // Verificar que NO tenga guía creada
    if (order.shipping.envioClickIdOrder) {
      throw ErrorFactory.InvalidRequest(
        "No se puede eliminar la cotización porque ya existe una guía creada",
      );
    }

    // Verificar que tenga un idRate
    if (!order.shipping.envioClickIdRate) {
      throw ErrorFactory.InvalidRequest(
        "La orden no tiene una cotización para eliminar",
      );
    }

    // Limpiar el idRate y datos relacionados de cotización. El total del
    // pedido incluía el flete cotizado: se descuenta para no seguir cobrando
    // un envío que ya no existe.
    const previousCost = Number(order.shipping.cost ?? 0);
    if (previousCost > 0) {
      await prismadb.order.update({
        where: { id: order.id },
        data: { total: Math.max(0, Math.round((Number(order.total) - previousCost) * 100) / 100) },
      });
    }
    await prismadb.shipping.update({
      where: {
        id: order.shipping.id,
      },
      data: {
        envioClickIdRate: null,
        carrierId: null,
        carrierName: null,
        courier: null,
        productId: null,
        productName: null,
        flete: null,
        minimumInsurance: null,
        isCOD: false, // Reset to default value, not null
        deliveryDays: null,
        cost: null,
        quotationData: Prisma.JsonNull,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message:
          "Cotización eliminada exitosamente. Ahora puedes solicitar una nueva cotización.",
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[ORDER_SHIPPING_CLEAR_RATE]", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: error.statusCode || 500 },
    );
  }
}
