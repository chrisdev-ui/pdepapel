import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import {
  CheckoutOrder,
  generatePayUPayment,
  generateWompiPayment,
} from "@/lib/utils";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

    const order = await prismadb.order.findUnique({
      where: {
        id: params.orderId,
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        payment: true,
        coupon: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!order)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);

    if (order.status === OrderStatus.PAID)
      throw ErrorFactory.Conflict(`La orden ${params.orderId} ya está pagada`);

    if (order.payment?.method === PaymentMethod.PayU) {
      const payUData = generatePayUPayment(order);

      return NextResponse.json(
        {
          ...payUData,
        },
        { headers: corsHeaders },
      );
    }

    const url = await generateWompiPayment(order as CheckoutOrder);

    return NextResponse.json({ url }, { headers: corsHeaders });
  } catch (error: any) {
    return handleErrorResponse(error, "ORDER_CHECKOUT_BY_ID", {
      headers: corsHeaders,
    });
  }
}
