import { BATCH_SIZE } from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import {
  batchUpdateProductStock,
  batchUpdateProductStockResilient,
  CACHE_HEADERS,
  calculateOrderTotals,
  processOrderItemsInBatches,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth, clerkClient } from "@clerk/nextjs";
import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from "@prisma/client";
import { TIMEOUT } from "dns";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } },
) {
  try {
    if (!params.orderId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");

    const order = await prismadb.order.findUnique({
      where: { id: params.orderId },
      include: {
        orderItems: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
          },
        },
        payment: true,
        shipping: true,
        coupon: true,
      },
    });
    if (!order)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);

    return NextResponse.json(order, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.DYNAMIC },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_GET", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.DYNAMIC },
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const { userId } = auth();

  try {
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.orderId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");

    const body = await req.json();
    const {
      fullName,
      phone,
      address,
      orderItems,
      status,
      payment,
      shipping,
      shippingProvider,
      envioClickIdRate,
      email,
      userId: requestUserId,
      guestId,
      documentId,
      subtotal,
      total,
      discount,
      couponCode,
      city,
      department,
      daneCode,
      neighborhood,
      address2,
      addressReference,
      company,
    } = body;

    // Validate order items count
    if (orderItems && orderItems.length > 1000) {
      throw ErrorFactory.InvalidRequest(
        "La orden excede el límite máximo de 1000 productos",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const order = await prismadb.order.findUnique({
      where: { id: params.orderId },
      include: {
        orderItems: true,
        shipping: true,
        coupon: true,
        payment: true,
      },
    });
    if (!order)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);

    let wasPaid = order.status === OrderStatus.PAID;
    let isNowPaid = status === OrderStatus.PAID;

    // Validate order items changes for paid orders
    if (wasPaid && isNowPaid && orderItems) {
      const originalItems = order.orderItems
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        }))
        .sort((a, b) => a.productId.localeCompare(b.productId));

      const newItems = orderItems
        .map((item: any) => ({
          productId: item.productId,
          quantity: item.quantity || 1,
        }))
        .sort((a: any, b: any) => a.productId.localeCompare(b.productId));

      const itemsMatch =
        JSON.stringify(originalItems) === JSON.stringify(newItems);

      if (!itemsMatch) {
        throw ErrorFactory.InvalidRequest(
          "No se pueden modificar los items de una orden ya pagada",
        );
      }
    }

    // Validate discount and coupon conflicts
    if (
      discount &&
      couponCode &&
      discount.type != null &&
      discount.amount &&
      discount.amount > 0
    ) {
      throw ErrorFactory.Conflict(
        "No se puede aplicar un cupón y un descuento a la vez",
        {
          discountType: discount.type,
          discountAmount: discount.amount,
          couponCode,
        },
      );
    }

    // Validate discount data
    if ((discount?.type as DiscountType) && !discount?.amount) {
      throw ErrorFactory.InvalidRequest(
        "El monto del descuento es requerido cuando se selecciona un tipo",
      );
    }

    if (discount?.amount && !discount?.type) {
      throw ErrorFactory.InvalidRequest(
        "El tipo de descuento es requerido cuando se ingresa un monto",
      );
    }

    if (
      (discount?.type as DiscountType) === DiscountType.PERCENTAGE &&
      discount.amount > 100
    ) {
      throw ErrorFactory.InvalidRequest(
        "El descuento porcentual no puede ser mayor a 100%",
      );
    }

    if (discount?.amount && discount.amount < 0) {
      throw ErrorFactory.InvalidRequest("El descuento no puede ser negativo");
    }

    // REMOVED: Shipping status transition validations
    // REMOVED: Order status change validations

    let verifiedUserId = order.userId;
    if (requestUserId && order.userId !== requestUserId) {
      try {
        await clerkClient.users.getUser(requestUserId);
        verifiedUserId = requestUserId;
      } catch (error) {
        throw ErrorFactory.NotFound("El usuario asignado no existe");
      }
    }

    // Store original status before update
    const originalStatus = order.status;
    const originalShippingStatus = order.shipping?.status;

    const updatedOrder = await prismadb.$transaction(async (tx) => {
      // Batch process products for better performance
      const products = await processOrderItemsInBatches(
        orderItems,
        params.storeId,
        BATCH_SIZE,
      );

      // Create a map for O(1) lookups
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Validate all products exist
      for (const item of orderItems) {
        if (!productMap.has(item.productId)) {
          throw ErrorFactory.NotFound(
            `Producto ${item.productId} no encontrado`,
          );
        }
      }

      const itemsWithPrices = orderItems.map((item: any) => {
        const product = productMap.get(item.productId);
        return {
          product: { price: product!.price },
          quantity: item.quantity || 1,
        };
      });

      // Calculate totals (including shipping cost)
      const totals = calculateOrderTotals(itemsWithPrices, {
        discount:
          discount?.type && discount?.amount
            ? {
                type: discount.type as DiscountType,
                amount: discount.amount,
              }
            : undefined,
        coupon:
          order.coupon && subtotal >= Number(order.coupon.minOrderValue ?? 0)
            ? {
                type: order.coupon.type as DiscountType,
                amount: order.coupon.amount,
              }
            : undefined,
        shippingCost: shipping?.cost || 0,
      });

      // Validate calculated totals
      if (
        Math.abs(totals.total - total) > 0.01 ||
        Math.abs(totals.subtotal - subtotal) > 0.01
      ) {
        throw ErrorFactory.InvalidRequest(
          "Los montos calculados no coinciden con los enviados",
        );
      }

      // CRITICAL FIX: Validate stock for PAID orders when changing items
      if (order.status === OrderStatus.PAID) {
        const newStockRequirements = orderItems.map((item: any) => ({
          productId: item.productId,
          quantity: item.quantity || 1,
        }));

        // Get current order items to calculate the difference
        const currentStockUsage = order.orderItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        }));

        // Calculate net stock change (what we need - what we already have)
        const stockChanges: { [productId: string]: number } = {};

        // Add new requirements
        newStockRequirements.forEach(
          ({
            productId,
            quantity,
          }: {
            productId: string;
            quantity: number;
          }) => {
            stockChanges[productId] = (stockChanges[productId] || 0) + quantity;
          },
        );

        // Subtract current usage
        currentStockUsage.forEach(
          ({
            productId,
            quantity,
          }: {
            productId: string;
            quantity: number;
          }) => {
            stockChanges[productId] = (stockChanges[productId] || 0) - quantity;
          },
        );

        // Validate only products that need MORE stock
        const additionalStockNeeded = Object.entries(stockChanges)
          .filter(([, change]) => change > 0)
          .map(([productId, change]) => ({ productId, quantity: change }));

        if (additionalStockNeeded.length > 0) {
          await batchUpdateProductStock(tx, additionalStockNeeded, true);
          // Revert validation
          const revertUpdates = additionalStockNeeded.map(
            ({ productId, quantity }) => ({
              productId,
              quantity: -quantity,
            }),
          );
          await batchUpdateProductStock(tx, revertUpdates, false);
        }
      }

      // Delete existing order items in batches
      await tx.orderItem.deleteMany({
        where: { orderId: order.id },
      });

      // Batch create new order items
      const createOperations = [];
      for (let i = 0; i < orderItems.length; i += BATCH_SIZE) {
        const batch = orderItems.slice(i, i + BATCH_SIZE);
        createOperations.push(
          ...batch.map((item: any) =>
            tx.orderItem.create({
              data: {
                orderId: order.id,
                productId: item.productId,
                quantity: item.quantity || 1,
              },
            }),
          ),
        );
      }
      await Promise.all(createOperations);

      // Update the order
      const updated = await tx.order.update({
        where: { id: params.orderId },
        data: {
          fullName,
          phone,
          address,
          email,
          userId: verifiedUserId,
          guestId: verifiedUserId ? null : guestId,
          documentId,
          city,
          department,
          daneCode,
          neighborhood,
          address2,
          addressReference,
          company,
          subtotal: totals.subtotal,
          discount: totals.discount,
          discountType: discount?.type as DiscountType,
          discountReason: discount?.reason,
          couponDiscount: order.coupon ? totals.couponDiscount : 0,
          total: totals.total,
          ...(status && { status }),
          payment: payment && {
            upsert: {
              create: {
                method: payment.method,
                transactionId: payment.transactionId,
                details: payment.details,
                store: { connect: { id: params.storeId } },
              },
              update: {
                method: payment.method,
                transactionId: payment.transactionId,
                details: payment.details,
              },
            },
          },
          // Only upsert shipping if there's a valid provider (not NONE)
          ...(shipping && shippingProvider && shippingProvider !== "NONE"
            ? {
                shipping: {
                  upsert: {
                    create: {
                      status: shipping.status,
                      provider: shippingProvider,
                      envioClickIdRate: envioClickIdRate || null,
                      carrierId: shipping.carrierId,
                      carrierName: shipping.carrierName,
                      courier: shipping.courier,
                      productId: shipping.productId,
                      productName: shipping.productName,
                      flete: shipping.flete,
                      minimumInsurance: shipping.minimumInsurance,
                      deliveryDays: shipping.deliveryDays,
                      isCOD: shipping.isCOD,
                      cost: shipping.cost,
                      trackingCode: shipping.trackingCode,
                      estimatedDeliveryDate: shipping.estimatedDeliveryDate,
                      notes: shipping.notes,
                      store: { connect: { id: params.storeId } },
                    },
                    update: {
                      status: shipping.status,
                      ...(shippingProvider && { provider: shippingProvider }),
                      ...(envioClickIdRate !== undefined && {
                        envioClickIdRate: envioClickIdRate || null,
                      }),
                      carrierId: shipping.carrierId,
                      carrierName: shipping.carrierName,
                      courier: shipping.courier,
                      productId: shipping.productId,
                      productName: shipping.productName,
                      flete: shipping.flete,
                      minimumInsurance: shipping.minimumInsurance,
                      deliveryDays: shipping.deliveryDays,
                      isCOD: shipping.isCOD,
                      cost: shipping.cost,
                      trackingCode: shipping.trackingCode,
                      estimatedDeliveryDate: shipping.estimatedDeliveryDate,
                      notes: shipping.notes,
                    },
                  },
                },
              }
            : {}),
        },
        include: {
          orderItems: { include: { product: true } },
          payment: true,
          shipping: true,
          coupon: true,
        },
      });

      // Handle stock changes with batching
      wasPaid = order.status === OrderStatus.PAID;
      isNowPaid = updated.status === OrderStatus.PAID;

      if (
        isNowPaid &&
        updated.shipping &&
        !updated.shipping?.envioClickIdOrder &&
        updated.shipping.envioClickIdRate
      ) {
        try {
          console.log(
            "[ORDER_UPDATE] Attempting to create guide automatically...",
          );
          // Pass the updated order data and transaction client to avoid re-querying and locks
          await createGuideForOrder(updated.id, params.storeId, updated, tx);
          console.log("[ORDER_UPDATE] Guide created automatically");
        } catch (error: any) {
          console.error("[ORDER_UPDATE] Failed to create guide:", error);
          // Guide creation failed, but order update should still succeed
          // User can manually create guide later
        }
      } else {
        if (
          isNowPaid &&
          updated.shipping &&
          !updated.shipping?.envioClickIdOrder
        ) {
          console.log(
            "[ORDER_UPDATE] Skipping automatic guide creation - no shipping rate available",
          );
        }
      }

      if (isNowPaid && !wasPaid) {
        // Prepare stock updates for decrementing
        const stockUpdates = updated.orderItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity, // Positive for decrement
        }));

        const stockResult = await batchUpdateProductStockResilient(
          tx,
          stockUpdates,
          true,
        );

        // Log any stock update failures but don't throw errors
        if (stockResult.failed.length > 0) {
          console.warn("Some stock updates failed for order:", {
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            failed: stockResult.failed,
            success: stockResult.success,
          });
        }

        // CRITICAL FIX: Increment coupon usage when order becomes PAID
        if (updated.coupon) {
          await tx.coupon.update({
            where: { id: updated.coupon.id },
            data: {
              usedCount: {
                increment: 1,
              },
            },
          });
        }
      } else if (!isNowPaid && wasPaid) {
        // Restock products (this should never fail)
        const stockUpdates = updated.orderItems.map((item) => ({
          productId: item.productId,
          quantity: -item.quantity, // Negative for increment
        }));
        await batchUpdateProductStock(tx, stockUpdates, false);

        // CRITICAL FIX: Decrement coupon usage when PAID order becomes unpaid
        if (updated.coupon) {
          await tx.coupon.update({
            where: { id: updated.coupon.id },
            data: {
              usedCount: {
                decrement: 1,
              },
            },
          });
        }
      }

      return updated;
    });

    // Async email notifications
    setImmediate(async () => {
      try {
        // Only fetch necessary fields for email
        const emailOrder = await prismadb.order.findUnique({
          where: { id: params.orderId },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            shipping: { select: { status: true } },
            payment: { select: { method: true } },
            email: true,
            fullName: true,
            // Add other necessary fields
          },
        });

        if (!emailOrder) return;

        // Status change notification
        if (status && emailOrder.status !== originalStatus) {
          await sendOrderEmail(
            {
              ...emailOrder,
              payment: emailOrder.payment?.method ?? null,
            } as any,
            emailOrder.status,
            { notifyAdmin: false },
          );
        }

        // Shipping status change
        if (
          shipping?.status &&
          emailOrder.shipping?.status !== originalShippingStatus
        ) {
          await sendOrderEmail(
            {
              ...emailOrder,
              payment: emailOrder.payment?.method ?? null,
            } as any,
            emailOrder.shipping?.status as ShippingStatus,
            { notifyAdmin: false },
          );
        }
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
      }
    });

    return NextResponse.json(updatedOrder, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_PATCH", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const { userId } = auth();

  try {
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.orderId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");

    await verifyStoreOwner(userId, params.storeId);

    const order = await prismadb.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        include: {
          shipping: true,
          payment: true,
          coupon: true,
          orderItems: true,
        },
      });
      if (!order)
        throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);

      // REMOVED: Order status and shipping validations for deletion
      // Now any order can be deleted regardless of status

      // Restock products if order was paid
      if (order.status === OrderStatus.PAID) {
        const stockUpdates = order.orderItems.map((item) => ({
          productId: item.productId,
          quantity: -item.quantity, // Negative for increment
        }));

        const stockResult = await batchUpdateProductStockResilient(
          tx,
          stockUpdates,
          true,
        );

        // Log any stock update failures but don't throw errors
        if (stockResult.failed.length > 0) {
          console.warn("Some stock restock failed during order deletion:", {
            orderId: order.id,
            orderNumber: order.orderNumber,
            failed: stockResult.failed,
            success: stockResult.success,
          });
        }
      }

      // Disconnect coupon if exists
      if (order.coupon) {
        // CRITICAL FIX: Decrement coupon usage if order was PAID
        if (order.status === OrderStatus.PAID) {
          await tx.coupon.update({
            where: { id: order.coupon.id },
            data: {
              usedCount: {
                decrement: 1,
              },
            },
          });
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            coupon: { disconnect: true },
            couponDiscount: 0,
          },
        });
      }

      // Delete the order
      const deletedOrder = await tx.order.delete({
        where: { id: params.orderId, storeId: params.storeId },
      });

      return deletedOrder;
    });

    // Async cancellation email
    setImmediate(async () => {
      try {
        const emailData = await prismadb.order.findUnique({
          where: { id: params.orderId },
          select: {
            id: true,
            orderNumber: true,
            email: true,
            fullName: true,
            // Add other necessary fields
          },
        });

        if (emailData) {
          await sendOrderEmail(
            {
              ...emailData,
              payment: null,
            } as any,
            OrderStatus.CANCELLED,
            { notifyAdmin: false },
          );
        }
      } catch (emailError) {
        console.error("Cancellation email failed:", emailError);
      }
    });

    return NextResponse.json(order, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_DELETE", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
