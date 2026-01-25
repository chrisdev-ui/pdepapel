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
    const body = await req.json();
    const { message } = body;

    if (!params.token) {
      return new NextResponse("Token is required", {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!message) {
      return new NextResponse("Message is required", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const order = await prismadb.order.findUnique({
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

    // Create QuoteRequest (Lightweight Change Request)
    await prismadb.quoteRequest.create({
      data: {
        storeId: params.storeId,
        orderId: order.id,
        customerName: order.phone || "Cliente", // Fallback name
        customerPhone: order.phone || "",
        message: message,
        status: "PENDING",
        // We can optionally set customOrderId if we still maintain that link,
        // but orderId is the primary link now.
      },
    });

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("[CUSTOM_ORDER_REQUEST_CHANGE]", error);
    return new NextResponse("Internal error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}
