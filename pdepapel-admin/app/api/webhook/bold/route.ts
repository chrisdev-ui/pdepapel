import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import { createInventoryMovementBatchResilient } from "@/lib/inventory";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import { calculateOrderFinancials } from "@/lib/financial";
import crypto from "crypto";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    if (!payload) {
      return NextResponse.json(
        { error: "Payload no recibido" },
        { status: 400 },
      );
    }

    const eventType = payload.type || payload.event || payload.action;
    const transactionData = payload.data || payload.transaction || payload;

    if (!eventType || !transactionData) {
      return NextResponse.json(
        { error: "Estructura de webhook no válida" },
        { status: 400 },
      );
    }

    switch (eventType) {
      case "SALE_APPROVED":
      case "PAYMENT_APPROVED":
      case "transaction.approved":
        return await processBoldPayment(transactionData, OrderStatus.PAID);

      case "SALE_REJECTED":
      case "VOID_APPROVED":
      case "transaction.declined":
      case "transaction.voided":
        return await processBoldPayment(transactionData, OrderStatus.CANCELLED);

      default:
        console.log(`Bold event received: ${eventType}`);
        return NextResponse.json(
          { message: `Event acknowledged: ${eventType}` },
          { status: 200 },
        );
    }
  } catch (error: any) {
    console.error("Bold Webhook error:", error);
    return NextResponse.json(
      { error: `Error interno procesando webhook de Bold: ${error?.message}` },
      { status: 500 },
    );
  }
}

async function processBoldPayment(transaction: any, targetStatus: OrderStatus) {
  const orderReference =
    transaction.reference ||
    transaction.order_id ||
    transaction.orderId ||
    transaction.subject;

  if (!orderReference) {
    return NextResponse.json(
      { error: "No se encontró referencia de orden en webhook de Bold" },
      { status: 400 },
    );
  }

  // Find order by orderNumber or ID
  const order = await prismadb.order.findFirst({
    where: {
      OR: [{ id: orderReference }, { orderNumber: orderReference }],
    },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
      payment: true,
      coupon: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: `Orden no encontrada: ${orderReference}` },
      { status: 404 },
    );
  }

  if (order.payment?.method !== PaymentMethod.Bold) {
    return NextResponse.json(
      {
        error: `La orden ${order.orderNumber} no está configurada para pago con Bold`,
      },
      { status: 400 },
    );
  }

  // Idempotency Guard: If order is already PAID and event is SALE_APPROVED, skip processing
  if (order.status === OrderStatus.PAID && targetStatus === OrderStatus.PAID) {
    return NextResponse.json(
      { message: `Orden ${order.orderNumber} ya fue procesada anteriormente` },
      { status: 200 },
    );
  }

  const transactionId =
    transaction.id ||
    transaction.transaction_id ||
    `BOLD-${Date.now()}`;

  // Update order status
  await prismadb.order.update({
    where: { id: order.id },
    data: { status: targetStatus },
  });

  if (targetStatus === OrderStatus.PAID) {
    await prismadb.$transaction(async (tx) => {
      // 1. Stock Movements (Sales = Negative)
      const stockMovements = order.orderItems
        .filter((item: any) => item.product)
        .map((orderItem: any) => ({
          productId: orderItem.productId,
          storeId: order.storeId,
          type: "ORDER_PLACED" as const,
          quantity: -orderItem.quantity,
          reason: `Bold: Pago confirmado ${transactionId}`,
          referenceId: order.id,
          cost: Number(orderItem.product.acqPrice) || 0,
          price: Number(orderItem.product.price),
          createdBy: "SYSTEM_BOLD",
        }));

      await createInventoryMovementBatchResilient(tx, stockMovements);

      // 2. Financial Metrics calculation
      const financials = await calculateOrderFinancials(
        order,
        PaymentMethod.Bold,
        order.shippingCost || 0,
        tx,
      );

      await tx.order.update({
        where: { id: order.id },
        data: {
          ...financials,
          paidAt: new Date(),
        } as any,
      });

      await invalidateStoreProductsCache(order.storeId);
    });
  }

  // 3. Upsert Payment Details
  await prismadb.paymentDetails.upsert({
    where: { orderId: order.id },
    update: {
      transactionId,
      details: `Bold Transaction ID: ${transactionId} | Status: ${targetStatus}`,
    },
    create: {
      method: PaymentMethod.Bold,
      transactionId,
      details: `Bold Transaction ID: ${transactionId} | Status: ${targetStatus}`,
      store: { connect: { id: order.storeId } },
      order: { connect: { id: order.id } },
    },
  });

  // 4. Update Shipping status
  await prismadb.shipping.upsert({
    where: { orderId: order.id },
    update: { status: ShippingStatus.Preparing },
    create: {
      status: ShippingStatus.Preparing,
      store: { connect: { id: order.storeId } },
      order: { connect: { id: order.id } },
    },
  });

  // 5. Send order notification email & auto shipping guide if applicable
  const updatedOrder = await prismadb.order.findUnique({
    where: { id: order.id },
    include: {
      payment: true,
      shipping: true,
      orderItems: {
        include: {
          product: true,
        },
      },
    },
  });

  if (updatedOrder) {
    if (
      updatedOrder.status === OrderStatus.PAID &&
      updatedOrder.shipping &&
      !updatedOrder.shipping.envioClickIdOrder &&
      updatedOrder.shipping.envioClickIdRate
    ) {
      setImmediate(async () => {
        await createGuideForOrder(updatedOrder.id, updatedOrder.storeId);
      });
    }

    await sendOrderEmail(
      {
        ...updatedOrder,
        payment: updatedOrder.payment?.method ?? undefined,
      },
      targetStatus,
    );
  }

  return NextResponse.json({ success: true, orderId: order.id }, { status: 200 });
}
