import { sendOrderEmail } from "@/lib/email";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import { createInventoryMovementBatchResilient } from "@/lib/inventory";
import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import crypto from "crypto";
import { NextResponse } from "next/server";

const HASH_ALGORITHM = "sha256";

export async function POST(req: Request) {
  try {
    const response = await req.json();

    if (response && response.event) {
      switch (response.event) {
        case "transaction.updated":
        case "nequi_token.updated":
          return await processWebhookPayment(response);

        default:
          return NextResponse.json(
            { error: `Event not found: ${response.event}` },
            { status: 400 },
          );
      }
    } else {
      return NextResponse.json(
        { error: "Error on body request" },
        { status: 400 },
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Internal server error processing webhook: ${
          error?.message || error?.data?.message
        }`,
      },
      { status: 500 },
    );
  }
}

async function processWebhookPayment(response: any) {
  if (isValidChecksum(response)) {
    const {
      data: { transaction },
    } = response;
    if (transaction) {
      try {
        const order = await prismadb.order.findFirst({
          where: {
            id: transaction.reference,
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

        if (!order)
          return NextResponse.json(
            { error: `Order not found: ${transaction.reference}` },
            { status: 400 },
          );

        if (isPaymentValid(order, transaction)) {
          return await updateOrderData(order, transaction);
        } else {
          return NextResponse.json(
            {
              error: `Wompi payment is not valid. TRANSACTION ID: (${transaction.id})`,
            },
            { status: 400 },
          );
        }
      } catch (error) {
        return NextResponse.json(
          { error: `Error finding order for wompi webhook: ${error}` },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "Transaction not found on webhook" },
        { status: 400 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "Checksum of transaction is not valid" },
      { status: 400 },
    );
  }
}

function isValidChecksum(response: any): boolean {
  const { signature, data, timestamp } = response;

  if (!signature || !data || !timestamp) {
    return false;
  }

  const toHash = concatenateProperties(data, signature.properties);
  const hash = createHash(toHash, timestamp, env.WOMPI_EVENTS_KEY);
  return hash === signature.checksum;
}

function concatenateProperties(data: any, properties: string[]): string {
  let result = "";
  properties.forEach((property: string) => {
    let value = data;
    property.split(".").forEach((key: string) => {
      value = value[key];
    });
    result += value;
  });
  return result;
}

function createHash(
  toHash: string,
  timestamp: string | number,
  privateKey: string,
) {
  const hash = crypto
    .createHash(HASH_ALGORITHM)
    .update(toHash + timestamp + privateKey)
    .digest("hex");
  return hash;
}

function isPaymentValid(order: any, transaction: any): boolean {
  const { total, payment } = order;
  const { amount_in_cents: amountInCents } = transaction;
  const totalAmount = total * 100;
  return (
    payment.method === PaymentMethod.Wompi && amountInCents === totalAmount
  );
}

async function updateOrderData(order: any, transaction: any) {
  try {
    const currentStatus = applyStatus(transaction.status);
    await prismadb.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: currentStatus,
      },
    });
    if (currentStatus === OrderStatus.PAID) {
      await prismadb.$transaction(async (tx) => {
        // Prepare stock updates for batch processing (Sales = Negative)
        const stockMovements = order.orderItems
          .filter((item: any) => item.product) // Filter out manual items
          .map((orderItem: any) => ({
            productId: orderItem.productId,
            storeId: order.storeId,
            type: "ORDER_PLACED" as const,
            quantity: -orderItem.quantity, // Negative for removal
            reason: `Wompi: Pago confirmado ${transaction.id}`,
            referenceId: order.id,
            cost: Number(orderItem.product.acqPrice) || 0,
            price: Number(orderItem.product.price),
            createdBy: "SYSTEM_WOMPI",
          }));

        // Use the resilient batch update function
        const stockResult = await createInventoryMovementBatchResilient(
          tx,
          stockMovements,
        );

        // Log any stock update failures but don't throw errors
        if (stockResult.failed.length > 0) {
          console.warn("Some stock updates failed in Wompi webhook:", {
            transactionId: transaction.id,
            transactionStatus: transaction.status,
            failed: stockResult.failed,
            success: stockResult.success,
          });
        }
      });
    } else if (currentStatus === OrderStatus.CANCELLED) {
      await prismadb.$transaction(async (tx) => {
        // Restock products if order was previously paid
        if (order.status === OrderStatus.PAID) {
          const stockMovements = order.orderItems
            .filter((item: any) => item.product) // Filter out manual items
            .map((orderItem: any) => ({
              productId: orderItem.productId,
              storeId: order.storeId,
              type: "ORDER_CANCELLED" as const,
              quantity: orderItem.quantity, // Positive for addition (Restock)
              reason: `Wompi: Transacción anulada/error ${transaction.id}`,
              referenceId: order.id,
              cost: Number(orderItem.product.acqPrice) || 0,
              price: Number(orderItem.product.price),
              createdBy: "SYSTEM_WOMPI",
            }));

          const stockResult = await createInventoryMovementBatchResilient(
            tx,
            stockMovements,
          );

          // Log any stock update failures but don't throw errors
          if (stockResult.failed.length > 0) {
            console.warn("Some stock restock failed in Wompi webhook:", {
              transactionId: transaction.id,
              transactionStatus: transaction.status,
              failed: stockResult.failed,
              success: stockResult.success,
            });
          }
        }

        // Handle coupon if exists
        if (order.coupon) {
          await tx.coupon.update({
            where: { id: order.coupon.id },
            data: {
              usedCount: {
                decrement: 1,
              },
            },
          });

          await tx.order.update({
            where: { id: order.id },
            data: {
              coupon: { disconnect: true },
              couponDiscount: 0,
            },
          });
        }
      });
    }
    await prismadb.paymentDetails.upsert({
      where: {
        orderId: order.id,
      },
      update: {
        transactionId: transaction.id,
        details: `customer_email: ${
          transaction?.customer_email ?? "undefined"
        } | payment_method_type: ${
          transaction?.payment_method_type ?? "undefined"
        }`,
      },
      create: {
        method: PaymentMethod.Wompi,
        transactionId: transaction.id,
        details: `customer_email: ${
          transaction?.customer_email ?? "undefined"
        } | payment_method_type: ${
          transaction?.payment_method_type ?? "undefined"
        }`,
        store: {
          connect: {
            id: order.storeId,
          },
        },
        order: {
          connect: {
            id: order.id,
          },
        },
      },
    });
    await prismadb.shipping.upsert({
      where: {
        orderId: order.id,
      },
      update: {
        status: ShippingStatus.Preparing,
      },
      create: {
        status: ShippingStatus.Preparing,
        store: {
          connect: {
            id: order.storeId,
          },
        },
        order: {
          connect: {
            id: order.id,
          },
        },
      },
    });

    // Fetch updated order with relations needed for the email
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

    // Send email notification (admin + customer)
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
        currentStatus,
      );
    }
    return NextResponse.json(null, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Internal server error updating order data: ${
          error?.data?.message || error?.message
        }`,
      },
      { status: 500 },
    );
  }
}

function applyStatus(status: string): OrderStatus {
  switch (status) {
    case "APPROVED":
      return OrderStatus.PAID;
    case "DECLINED":
    case "ERROR":
    case "VOIDED":
      return OrderStatus.CANCELLED;
    default:
      return OrderStatus.PENDING;
  }
}
