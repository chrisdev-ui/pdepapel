import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";

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

    // Find the order by token
    // We search across all orders, but we can also filter by storeId if needed.
    // Assuming token is unique globally or per store.
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

    // Update viewedAt timestamp if not already set, or update it to latest view.
    // We do not change status to "VIEWED" as it is not in OrderStatus enum.
    await prismadb.order.update({
      where: { id: order.id },
      data: {
        viewedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("[CUSTOM_ORDER_VIEW_POST]", error);
    return new NextResponse("Internal error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}
