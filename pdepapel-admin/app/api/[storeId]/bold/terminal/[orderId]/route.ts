import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { pushToBoldDatafono } from "@/lib/bold-terminal";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { OrderStatus } from "@prisma/client";
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
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.orderId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");

    const body = await req.json().catch(() => ({}));
    const { terminalId } = body || {};

    const order = await prismadb.order.findUnique({
      where: {
        id: params.orderId,
      },
    });

    if (!order) {
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);
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
