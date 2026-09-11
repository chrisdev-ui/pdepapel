import { NextResponse } from "next/server";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";
import { PUBLIC_QUOTATION_SELECT } from "@/lib/public-orders";

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

    // Sistema unificado: la cotización vive en Order. El token es la llave y
    // la tienda entra en la misma consulta; la forma es un `select` de
    // clienta (sin notas internas, costos ni utilidad).
    const order = await prismadb.order.findFirst({
      where: {
        token: params.token,
        storeId: params.storeId,
      },
      select: PUBLIC_QUOTATION_SELECT,
    });

    if (!order) {
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

    const { adminNotes, ...quotation } = order;
    return NextResponse.json(
      {
        ...quotation,
        description: adminNotes,
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
