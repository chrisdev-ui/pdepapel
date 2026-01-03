import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";
import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  CheckoutOrder,
  generatePayUPayment,
  generateWompiPayment,
} from "@/lib/utils";
import { processOrderItemsInBatches } from "@/lib/db-utils";
import { OrderStatus } from "@prisma/client";
import { PaymentMethod } from "@prisma/client";
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
    const orderItemsForBatch = order.orderItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    // Batch process products for validation and pricing (using the same optimization as main checkout)
    const products = await processOrderItemsInBatches(
      orderItemsForBatch,
      params.storeId,
      BATCH_SIZE,
    );

    // Create product map for O(1) lookups (same optimization as main checkout)
    const productMap = new Map(products.map((p) => [p.id, p]));

    const errors: string[] = [];

    // Validate stock for each item using the product map
    for (const item of order.orderItems) {
      const product = productMap.get(item.productId);

      if (!product) {
        errors.push(`El producto ${item.productId} no existe`);
        continue;
      }

      if (product.stock < item.quantity) {
        errors.push(
          `El producto ${product.name} no tiene suficiente stock disponible. Stock disponible: ${product.stock}, cantidad solicitada: ${item.quantity}`,
        );
        continue;
      }
    }

    // Throw all errors at once if any exist
    if (errors.length > 0) {
      throw ErrorFactory.InvalidRequest(errors.join(", "));
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
