import { NextResponse } from "next/server";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";

const getCorsHeaders = (request: Request) =>
  createCorsHeaders(request, { methods: "GET, OPTIONS" });

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; token: string } },
) {
  const corsHeaders = getCorsHeaders(req);
  try {
    if (!params.token) {
      return new NextResponse("Token is required", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // ⭐ Unified System: Query the Order table, not CustomOrder
    // We look for orders that have this token.
    const order = await prismadb.order.findUnique({
      where: {
        token: params.token,
      },
      include: {
        shipping: true,
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                images: true,
                price: true,
                sku: true,
                size: { select: { name: true } },
                color: { select: { name: true } },
                design: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!order || order.storeId !== params.storeId) {
      return new NextResponse("Order not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Check expiration if applicable (Unified Orders utilize expiresAt)
    if (order.expiresAt && new Date(order.expiresAt) < new Date()) {
      // We can return a specific status or handle it in client
      // For now, let's assume client handles "Expired" UI based on this date
    }

    return NextResponse.json(
      {
        ...order,
        description: order.adminNotes,
        validUntil: order.expiresAt,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.log("[PUBLIC_QUOTATION_GET]", error);
    return new NextResponse("Internal error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
