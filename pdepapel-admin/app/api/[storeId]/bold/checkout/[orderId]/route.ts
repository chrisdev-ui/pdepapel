import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { generateBoldIntegritySignature, getBoldConfig } from "@/lib/bold";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
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
        "Esta orden no está configurada para pago con Bold.",
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
        "Bold Colombia no está configurado correctamente con API Keys.",
      );
    }

    // Bold requires a clean alphanumeric unique sale identifier for each payment attempt
    const uniqueBoldTransactionId = `ORD${Date.now()}`;
    const amount = Math.round(order.total);
    const currency = "COP";

    // Calculate official SHA-256 integrity signature: SHA256(order_id + amount + currency + secret_key)
    const integritySignature = generateBoldIntegritySignature(
      uniqueBoldTransactionId,
      amount,
      currency,
      boldConfig.secretKey,
    );

    let storeUrl = process.env.FRONTEND_STORE_URL || "https://papeleriapdepapel.com";
    if (storeUrl.includes("localhost")) {
      storeUrl = "https://papeleriapdepapel.com";
    } else if (storeUrl.startsWith("http://")) {
      storeUrl = storeUrl.replace(/^http:\/\//, "https://");
    }
    const redirectionUrl = `${storeUrl}/order/${order.id}`;

    return NextResponse.json(
      {
        orderId: order.id,
        orderNumber: uniqueBoldTransactionId,
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
