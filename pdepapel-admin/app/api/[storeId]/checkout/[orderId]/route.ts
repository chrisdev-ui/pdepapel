import prismadb from "@/lib/prismadb";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  CheckoutOrder,
  generatePayUPayment,
  generateWompiPayment,
} from "../route";

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
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400, headers: corsHeaders },
    );
  if (!params.orderId)
    return NextResponse.json(
      { error: "Order ID is required" },
      { status: 400, headers: corsHeaders },
    );
  try {
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
      },
    });

    if (!order)
      return NextResponse.json(
        { error: `Order not found: ${params.orderId}` },
        { status: 404, headers: corsHeaders },
      );

    if (order.status === OrderStatus.PAID)
      return NextResponse.json(
        { error: `Order is already paid: ${params.orderId}` },
        { status: 400, headers: corsHeaders },
      );

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
    console.error("[ORDER_CHECKOUT_BY_ID]", error);
    return NextResponse.json(
      {
        error: `Internal server error processing checkout: ${
          error?.message || error?.data?.message
        }`,
      },
      { status: 500, headers: corsHeaders },
    );
  }
}
