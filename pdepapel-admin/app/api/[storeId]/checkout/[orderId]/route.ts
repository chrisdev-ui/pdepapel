import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  CheckoutOrder,
  generatePayUPayment,
  generateWompiPayment,
  processOrderItemsInBatches,
} from "@/lib/utils";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import { BATCH_SIZE } from "@/constants";

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

    // Validate order items count (similar to main checkout)
    if (order.orderItems.length > 1000) {
      throw ErrorFactory.InvalidRequest(
        "La orden excede el límite máximo de 1000 productos",
      );
    }

    // Transform order items to match the format expected by processOrderItemsInBatches
    const orderItemsForBatch = order.orderItems.map((item: any) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    // Validate stock using centralized logic (Supports Kits)
    const stockValidationItems = order.orderItems
      .filter((item: any) => item.productId)
      .map((item: any) => ({
        productId: item.productId as string,
        quantity: item.quantity,
      }));

    if (stockValidationItems.length > 0) {
      const { validateStockAvailability } = await import("@/lib/inventory");
      await validateStockAvailability(prismadb, stockValidationItems);
    }

    // Send email notification asynchronously (same pattern as main checkout)
    setImmediate(async () => {
      try {
        await sendOrderEmail(
          {
            ...order,
            payment: order.payment?.method ?? undefined,
          },
          OrderStatus.PENDING,
        );
      } catch (emailError) {
        console.error("Failed to send order email:", emailError);
      }
    });

    // Generate payment based on method
    if (order.payment?.method === PaymentMethod.PayU) {
      const payUData = generatePayUPayment(order as CheckoutOrder);

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
