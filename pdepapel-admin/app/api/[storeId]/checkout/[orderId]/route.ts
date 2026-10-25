import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import { validateStockAvailability } from "@/lib/inventory";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, CheckoutOrder, generateWompiPayment } from "@/lib/utils";
import { processOrderItemsInBatches } from "@/lib/server/utils";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import { BATCH_SIZE } from "@/constants";
import { SHIPPING_WITHOUT_GUIDE_PDF } from "@/lib/shipping-guide-pdf";

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

    // El id del pedido es la llave pública; la tienda entra en la consulta y
    // del producto solo se lee lo que el enlace de pago y el correo usan.
    const order = await prismadb.order.findUnique({
      where: {
        id: params.orderId,
        storeId: params.storeId,
      },
      include: {
        orderItems: {
          include: {
            product: {
              select: { id: true, name: true, price: true, sku: true, isKit: true },
            },
          },
        },
        payment: true,
        shipping: SHIPPING_WITHOUT_GUIDE_PDF,
        coupon: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!order)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);

    if (order.status === OrderStatus.PAID || order.status === OrderStatus.SENT)
      throw ErrorFactory.Conflict(
        `La orden #${order.orderNumber || params.orderId} ya está completada (${order.status === OrderStatus.PAID ? "Pagada" : "Enviada"}). No es posible generar un nuevo link de pago.`,
      );

    // Online orders may switch to the fallback gateway (Bold → Wompi) while
    // unpaid; offline methods never get a payment link.
    const isOnlineMethod =
      !order.payment?.method ||
      order.payment.method === PaymentMethod.Wompi ||
      order.payment.method === PaymentMethod.Bold;
    if (!isOnlineMethod) {
      throw ErrorFactory.InvalidRequest(
        `La orden #${order.orderNumber || params.orderId} fue registrada para transferencia o efectivo. Los enlaces de pago solo aplican para pagos en línea.`,
      );
    }

    if (order.payment && order.payment.method !== PaymentMethod.Wompi) {
      await prismadb.paymentDetails.update({
        where: { id: order.payment.id },
        data: { method: PaymentMethod.Wompi },
      });
      order.payment.method = PaymentMethod.Wompi;
    }

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
      await validateStockAvailability(prismadb, stockValidationItems);
    }

    // Sin correo: el «Pendiente de pago» ya salió al crear el pedido y cada
    // clic en «otra pasarela» lo repetía a la clienta y al panel.
    const url = await generateWompiPayment(order as CheckoutOrder);

    return NextResponse.json({ url }, { headers: corsHeaders });
  } catch (error: any) {
    return handleErrorResponse(error, "ORDER_CHECKOUT_BY_ID", {
      headers: corsHeaders,
    });
  }
}
