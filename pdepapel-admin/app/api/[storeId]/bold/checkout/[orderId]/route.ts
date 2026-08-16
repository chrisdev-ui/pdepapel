import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import {
  generateBoldIntegritySignature,
  getBoldConfig,
  getBoldOrderReference,
} from "@/lib/bold";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
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
        shipping: true,
      },
    });

    if (!order)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);

    if (order.payment?.method !== PaymentMethod.Bold) {
      throw ErrorFactory.InvalidRequest(
        "Esta orden no está configurada para pago en línea.",
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

    const boldConfig = getBoldConfig();
    if (!boldConfig.identityKey || !boldConfig.secretKey) {
      throw ErrorFactory.InternalServerError(
        "El pago en línea no está configurado correctamente.",
      );
    }

    const boldOrderReference = getBoldOrderReference(order);
    const amount = Math.round(order.total);
    const currency = "COP";

    // Calculate official SHA-256 integrity signature: SHA256(order_id + amount + currency + secret_key)
    const integritySignature = generateBoldIntegritySignature(
      boldOrderReference,
      amount,
      currency,
      boldConfig.secretKey,
    );

    let storeUrl =
      process.env.FRONTEND_STORE_URL || "https://papeleriapdepapel.com";
    if (storeUrl.includes("localhost")) {
      storeUrl = "https://papeleriapdepapel.com";
    } else if (storeUrl.startsWith("http://")) {
      storeUrl = storeUrl.replace(/^http:\/\//, "https://");
    }
    const redirectionUrl = `${storeUrl}/pedido/${order.id}`;

    return NextResponse.json(
      {
        orderId: order.id,
        orderNumber: boldOrderReference,
        amount,
        currency,
        identityKey: boldConfig.identityKey,
        integritySignature,
        redirectionUrl,
        description: `Orden P de Papel ${order.orderNumber || order.id}`,
      },
      { headers: corsHeaders },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "BOLD_CHECKOUT_PREPARE", {
      headers: corsHeaders,
    });
  }
}
