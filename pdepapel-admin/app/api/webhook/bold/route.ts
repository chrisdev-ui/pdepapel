import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import { createInventoryMovementBatchResilient } from "@/lib/inventory";
import { invalidateStoreProductsCache } from "@/lib/cache";
import {
  getBoldWebhookSecretKey,
  verifyBoldWebhookSignature,
} from "@/lib/bold";
import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import { calculateOrderFinancials } from "@/lib/financial";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const rawPayload = await req.text();

    if (!rawPayload) {
      return NextResponse.json(
        { error: "Payload no recibido" },
        { status: 400 },
      );
    }

    const isValidSignature = verifyBoldWebhookSignature(
      rawPayload,
      req.headers.get("x-bold-signature"),
      getBoldWebhookSecretKey(),
    );

    if (!isValidSignature) {
      console.warn("Bold webhook rejected due to an invalid signature");
      return NextResponse.json(
        { error: "Firma de webhook Bold inválida" },
        { status: 400 },
      );
    }

    const payload = JSON.parse(rawPayload);

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
    transaction.metadata?.reference ||
    transaction.reference ||
    transaction.order_id ||
    transaction.orderId;

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
        error: `La orden ${order.orderNumber} no está configurada para pago en línea`,
      },
      { status: 400 },
    );
  }

  const paidAmount = Number(transaction.amount?.total);
  const isSandboxZeroAmount =
    process.env.BOLD_ENVIRONMENT === "test" && paidAmount === 0;
  if (
    targetStatus === OrderStatus.PAID &&
    (!Number.isFinite(paidAmount) ||
      (!isSandboxZeroAmount &&
        Math.round(paidAmount) !== Math.round(order.total)))
  ) {
    return NextResponse.json(
      {
        error: `El monto de Bold no coincide con la orden ${order.orderNumber}`,
      },
      { status: 400 },
    );
  }

  if (
    targetStatus === OrderStatus.PAID &&
    transaction.amount?.currency &&
    transaction.amount.currency !== "COP"
  ) {
    return NextResponse.json(
      { error: "La moneda reportada por Bold no es COP" },
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
    transaction.payment_id ||
    transaction.id ||
    transaction.transaction_id ||
    `BOLD-${Date.now()}`;

  let paymentProcessed = false;
  if (targetStatus === OrderStatus.PAID) {
    paymentProcessed = await prismadb.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: {
          id: order.id,
          status: {
            in: [
              OrderStatus.CREATED,
              OrderStatus.PENDING,
              OrderStatus.CANCELLED,
            ],
          },
        },
        data: { status: OrderStatus.PAID },
      });

      if (claim.count === 0) return false;

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

      await tx.paymentDetails.upsert({
        where: { orderId: order.id },
        update: {
          transactionId,
          details: `Bold Transaction ID: ${transactionId} | Reference: ${orderReference} | Status: ${targetStatus}`,
        },
        create: {
          method: PaymentMethod.Bold,
          transactionId,
          details: `Bold Transaction ID: ${transactionId} | Reference: ${orderReference} | Status: ${targetStatus}`,
          store: { connect: { id: order.storeId } },
          order: { connect: { id: order.id } },
        },
      });

      await tx.shipping.upsert({
        where: { orderId: order.id },
        update: { status: ShippingStatus.Preparing },
        create: {
          status: ShippingStatus.Preparing,
          store: { connect: { id: order.storeId } },
          order: { connect: { id: order.id } },
        },
      });

      return true;
    });

    if (!paymentProcessed) {
      return NextResponse.json(
        {
          message: `Orden ${order.orderNumber} ya fue procesada anteriormente`,
        },
        { status: 200 },
      );
    }

    await invalidateStoreProductsCache(order.storeId);
  } else {
    paymentProcessed = await prismadb.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { in: [OrderStatus.CREATED, OrderStatus.PENDING] },
        },
        data: { status: targetStatus },
      });

      if (claim.count === 0) return false;

      await tx.paymentDetails.upsert({
        where: { orderId: order.id },
        update: {
          transactionId,
          details: `Bold Transaction ID: ${transactionId} | Reference: ${orderReference} | Status: ${targetStatus}`,
        },
        create: {
          method: PaymentMethod.Bold,
          transactionId,
          details: `Bold Transaction ID: ${transactionId} | Reference: ${orderReference} | Status: ${targetStatus}`,
          store: { connect: { id: order.storeId } },
          order: { connect: { id: order.id } },
        },
      });

      return true;
    });

    if (!paymentProcessed) {
      return NextResponse.json(
        {
          message: `Orden ${order.orderNumber} ya fue procesada anteriormente`,
        },
        { status: 200 },
      );
    }
  }

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

  return NextResponse.json(
    { success: true, orderId: order.id },
    { status: 200 },
  );
}
