import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { pushToBoldDatafono } from "@/lib/bold-terminal";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...CACHE_HEADERS.NO_CACHE,
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

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

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json().catch(() => ({}));
    const { terminalId } = body || {};

    const order = await prismadb.order.findUnique({
      where: {
        id: params.orderId,
      },
      include: {
        payment: true,
      },
    });

    if (!order) {
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);
    }

    if (order.payment?.method !== PaymentMethod.Bold) {
      throw ErrorFactory.InvalidRequest(
        "El datáfono solo puede cobrar órdenes configuradas para pago en línea.",
      );
    }

    if (
      order.status === OrderStatus.PAID ||
      order.status === OrderStatus.SENT
    ) {
      throw ErrorFactory.Conflict(
        `La orden #${order.orderNumber || params.orderId} ya está completada (${order.status === OrderStatus.PAID ? "Pagada" : "Enviada"}).`,
      );
    }

    const result = await pushToBoldDatafono({
      terminalId,
      amount: order.total,
      currency: "COP",
      orderNumber: order.orderNumber || order.id,
      description: `Orden P de Papel #${order.orderNumber || order.id}`,
      email: order.email || undefined,
    });

    if (!result.success) {
      throw ErrorFactory.InvalidRequest(result.message);
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result.data,
      },
      { headers: corsHeaders },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "BOLD_DATAFONO_PUSH", {
      headers: corsHeaders,
    });
  }
}
