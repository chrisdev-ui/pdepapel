import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; token: string } },
) {
  try {
    if (!params.token) {
      return new NextResponse("Token is required", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const order = await prismadb.order.findFirst({
      where: {
        token: params.token,
        storeId: params.storeId,
      },
    });

    if (!order) {
      return new NextResponse("Order not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Verify status is valid for acceptance
    if (["CANCELLED", "PAID", "SENT"].includes(order.status)) {
      return new NextResponse("Order cannot be accepted in its current state", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Update the status to ACCEPTED in the database
    const updatedOrder = await prismadb.order.update({
      where: { id: order.id },
      data: {
        status: "ACCEPTED",
      },
      include: {
        orderItems: true,
      },
    });

    return NextResponse.json(updatedOrder, { headers: corsHeaders });
  } catch (error) {
    console.error("[CUSTOM_ORDER_ACCEPT_POST]", error);
    return new NextResponse("Internal error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}
