import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import { createInventoryMovementBatchResilient } from "@/lib/inventory";
import { explodeKitMovements } from "@/lib/order-stock-movements";
import { invalidateStoreProductsCache } from "@/lib/cache";
import {
  getBoldWebhookSecretKey,
  verifyBoldWebhookSignature,
} from "@/lib/bold";
import {
  OrderInventoryIssueKind,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from "@prisma/client";
import { calculateOrderFinancials } from "@/lib/financial";
import { recordPaidOrderInGoogleAnalytics } from "@/lib/google-analytics";
import {
  markWelcomeBenefitRedeemed,
  releaseWelcomeBenefitReservation,
} from "@/lib/customer-benefits";
import {
  InvalidWebhookPayloadError,
  readWebhookStoreId,
} from "@/lib/webhook-auth";
import { NextResponse } from "next/server";
import { recordInventoryIssues } from "@/lib/order-inventory-issues";

export async function POST(req: Request) {
  try {
    const scopedStoreId = readWebhookStoreId(req);
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

    let payload: any;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      // Cuerpo ilegible: 400 para que Bold deje de reintentarlo.
      return NextResponse.json(
        { error: "El cuerpo del webhook no es JSON válido" },
        { status: 400 },
      );
    }

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
        return await processBoldPayment(
          transactionData,
          OrderStatus.PAID,
          scopedStoreId,
        );

      case "SALE_REJECTED":
      case "VOID_APPROVED":
      case "transaction.declined":
      case "transaction.voided":
        return await processBoldPayment(
          transactionData,
          OrderStatus.CANCELLED,
          scopedStoreId,
        );

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

async function processBoldPayment(
  transaction: any,
  targetStatus: OrderStatus,
  scopedStoreId: string | null,
) {
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
      ...(scopedStoreId ? { storeId: scopedStoreId } : {}),
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
          isWelcomeBenefit: true,
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
        Math.round(paidAmount) !== Math.round(Number(order.total))))
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
    try {
      await recordPaidOrderInGoogleAnalytics(order.id);
    } catch (analyticsError) {
      console.error(
        "[BOLD_WEBHOOK] GA4 purchase tracking failed:",
        analyticsError,
      );
    }

    return NextResponse.json(
      { message: `Orden ${order.orderNumber} ya fue procesada anteriormente` },
      { status: 200 },
    );
  }

  // Sin referencia del proveedor se guarda null: inventar «BOLD-<timestamp>»
  // dejaba en el pedido un número que parecía de Bold y no lo era.
  const transactionId: string | null =
    transaction.payment_id ||
    transaction.id ||
    transaction.transaction_id ||
    null;

  if (!transactionId) {
    console.warn(
      `[BOLD_WEBHOOK] Evento sin identificador de transacción para ${order.orderNumber}`,
    );
  }

  let paymentProcessed = false;
  if (targetStatus === OrderStatus.PAID) {
    paymentProcessed = await prismadb.$transaction(async (tx) => {
      // Solo desde un estado sin cobrar. Con CANCELLED aquí, reenviar un
      // webhook antiguo de aprobación resucitaba un pedido cancelado y
      // descontaba el inventario por segunda vez.
      const claim = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { in: [OrderStatus.CREATED, OrderStatus.PENDING] },
        },
        data: { status: OrderStatus.PAID },
      });

      if (claim.count === 0) return false;

      // Los kits descuentan también sus componentes; el reingreso al anular
      // hace lo mismo, así que ambos lados quedan simétricos.
      const stockMovements = await explodeKitMovements(
        tx,
        order.orderItems
          .filter((item: any) => item.product)
          .map((orderItem: any) => ({
            productId: orderItem.productId,
            storeId: order.storeId,
            type: "ORDER_PLACED" as const,
            quantity: -orderItem.quantity,
            reason: `Bold: pago confirmado ${transactionId ?? "sin referencia"}`,
            referenceId: order.id,
            cost: Number(orderItem.product.acqPrice) || 0,
            price: Number(orderItem.product.price),
            createdBy: "SYSTEM_BOLD",
          })),
      );

      const stockResult = await createInventoryMovementBatchResilient(
        tx,
        stockMovements,
      );
      if (stockResult.failed.length > 0) {
        console.error(
          "[BOLD_WEBHOOK] Descuento de inventario incompleto en un pago confirmado:",
          {
            orderNumber: order.orderNumber,
            transactionId,
            failed: stockResult.failed,
          },
        );
        await recordInventoryIssues(tx, {
          storeId: order.storeId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          kind: OrderInventoryIssueKind.DECREMENT,
          failed: stockResult.failed,
        });
      }

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

      if (order.coupon) {
        await tx.coupon.update({
          where: { id: order.coupon.id },
          data: { usedCount: { increment: 1 } },
        });

        if (order.coupon.isWelcomeBenefit) {
          await markWelcomeBenefitRedeemed(tx, {
            couponId: order.coupon.id,
            userId: order.userId,
            orderId: order.id,
          });
        }
      }

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
      // Una anulación puede llegar después de haber cobrado (VOID_APPROVED
      // sobre un pedido ya pagado): antes se ignoraba en silencio y el pedido
      // seguía diciendo «Pagado» con el inventario descontado.
      const paidCancellation = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.PAID },
        data: { status: targetStatus, paidAt: null },
      });
      const reversedPaidOrder = paidCancellation.count > 0;

      if (!reversedPaidOrder) {
        const claim = await tx.order.updateMany({
          where: {
            id: order.id,
            status: { in: [OrderStatus.CREATED, OrderStatus.PENDING] },
          },
          data: { status: targetStatus },
        });

        if (claim.count === 0) return false;
      }

      if (reversedPaidOrder) {
        const restockMovements = await explodeKitMovements(
          tx,
          order.orderItems
            .filter((item: any) => item.product)
            .map((orderItem: any) => ({
              productId: orderItem.productId,
              storeId: order.storeId,
              type: "ORDER_CANCELLED" as const,
              quantity: orderItem.quantity,
              reason: `Bold: pago anulado ${transactionId ?? "sin referencia"}`,
              referenceId: order.id,
              cost: Number(orderItem.product.acqPrice) || 0,
              price: Number(orderItem.product.price),
              createdBy: "SYSTEM_BOLD",
            })),
        );

        const restockResult = await createInventoryMovementBatchResilient(
          tx,
          restockMovements,
        );
        if (restockResult.failed.length > 0) {
          console.error(
            "[BOLD_WEBHOOK] Reingreso de inventario incompleto tras la anulación:",
            {
              orderNumber: order.orderNumber,
              transactionId,
              failed: restockResult.failed,
            },
          );
          await recordInventoryIssues(tx, {
            storeId: order.storeId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            kind: OrderInventoryIssueKind.RESTOCK,
            failed: restockResult.failed,
          });
        }

        if (order.coupon) {
          await tx.coupon.updateMany({
            where: { id: order.coupon.id, usedCount: { gt: 0 } },
            data: { usedCount: { decrement: 1 } },
          });
        }
      }

      // El beneficio de bienvenida vuelve al cliente solo cuando el pedido no
      // se cobra: aquí, no en la rama de pago confirmado.
      if (order.coupon?.isWelcomeBenefit) {
        await releaseWelcomeBenefitReservation(tx, {
          couponId: order.coupon.id,
          userId: order.userId,
          orderId: order.id,
        });
      }

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

    await invalidateStoreProductsCache(order.storeId);
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
    if (updatedOrder.status === OrderStatus.PAID) {
      try {
        await recordPaidOrderInGoogleAnalytics(updatedOrder.id);
      } catch (analyticsError) {
        console.error(
          "[BOLD_WEBHOOK] GA4 purchase tracking failed:",
          analyticsError,
        );
      }
    }

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
