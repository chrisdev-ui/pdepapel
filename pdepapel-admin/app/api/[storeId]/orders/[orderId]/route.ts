import { BATCH_SIZE } from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import {
  CACHE_HEADERS,
  calculateOrderTotals,
  processOrderItemsInBatches,
  verifyStoreOwner,
} from "@/lib/utils";
import {
  createInventoryMovementBatchResilient,
  createInventoryMovementBatch,
  validateStockAvailability,
} from "@/lib/inventory";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { auth, clerkClient } from "@clerk/nextjs";
import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
  OrderType,
} from "@prisma/client";
import { NextResponse } from "next/server";
import crypto from "crypto";

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
          orderBy: { createdAt: "asc" },
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
      skipAutoGuide,
      // Unified Order Fields
      type,
      adminNotes,
      internalNotes,
      expiresAt,
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
        .sort((a, b) => (a.productId || "").localeCompare(b.productId || ""));

      const newItems = orderItems
        .map((item: any) => ({
          productId: item.productId,
          quantity: item.quantity || 1,
        }))
        .sort((a: any, b: any) =>
          (a.productId || "").localeCompare(b.productId || ""),
        );

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

    // Generate Token & Expiration for Custom/Quote orders if missing
    let tokenUpdate = {};
    if (
      (type === OrderType.QUOTATION ||
        (!type && order.type === OrderType.QUOTATION)) &&
      !order.token
    ) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date();
      expires.setDate(expires.getDate() + 7); // Default 7 days

      tokenUpdate = {
        token,
        expiresAt: order.expiresAt || expires,
      };
    }

    // Store original status before update
    const originalStatus = order.status;
    const originalShippingStatus = order.shipping?.status;

    // Validate Required Fields for Active Orders
    const targetStatus = status || order.status;
    const isActiveStatus = [
      OrderStatus.CREATED,
      OrderStatus.PENDING,
      OrderStatus.PAID,
      OrderStatus.SENT,
    ].includes(targetStatus);

    const targetType = type || order.type;
    const isStandardType = targetType === OrderType.STANDARD;

    if (isActiveStatus || isStandardType) {
      const finalName = fullName || order.fullName;
      const finalPhone = phone || order.phone;
      const finalEmail = email || order.email;
      const finalAddress = address || order.address;

      if (!finalName || !finalPhone || !finalEmail || !finalAddress) {
        throw ErrorFactory.InvalidRequest(
          "La orden debe tener nombre, teléfono, email y dirección para ser activada.",
        );
      }
    }

    const updatedOrder = await prismadb.$transaction(async (tx) => {
      // Batch process products for better performance
      const products = await processOrderItemsInBatches(
        orderItems.filter((i: any) => i.productId),
        params.storeId,
        BATCH_SIZE,
      );

      // Create a map for O(1) lookups
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Validate products existence based on status
      const isDraftOrQuote = [
        OrderStatus.DRAFT,
        OrderStatus.QUOTATION,
        OrderStatus.SENT,
        OrderStatus.VIEWED,
      ].includes(status || order.status);

      for (const item of orderItems) {
        if (item.productId) {
          if (!productMap.has(item.productId)) {
            throw ErrorFactory.NotFound(
              `Producto ${item.productId} no encontrado`,
            );
          }
        } else {
          // Manual item validation
          if (!isDraftOrQuote) {
            throw ErrorFactory.InvalidRequest(
              "No se pueden agregar items manuales a una orden activa (PENDING, PAID, ACCEPTED).",
            );
          }
          if (!item.name || item.price === undefined) {
            throw ErrorFactory.InvalidRequest(
              "Los items manuales requieren nombre y precio.",
            );
          }
        }
      }

      // STRICT VALIDATION: Check if we are transitioning to an active state
      if (
        status &&
        [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.ACCEPTED].includes(
          status,
        )
      ) {
        const hasManualItems = orderItems.some((item: any) => !item.productId);
        if (hasManualItems) {
          throw ErrorFactory.InvalidRequest(
            "No se puede activar la orden con items manuales. Por favor vincule todos los items a productos existentes.",
          );
        }
      }

      // Calculate discounted prices from active offers
      const { getProductsPrices } = await import("@/lib/discount-engine");
      const pricesMap = await getProductsPrices(products, params.storeId);

      const itemsWithPrices = orderItems.map((item: any) => {
        if (item.productId) {
          const product = productMap.get(item.productId);
          const priceInfo = pricesMap.get(item.productId);
          const effectivePrice = priceInfo?.price ?? product!.price;
          return {
            product: { price: effectivePrice },
            quantity: item.quantity || 1,
            // Snapshot fields from product
            name: product!.name,
            sku: product!.sku,
            imageUrl: product!.images[0]?.url || "",
            isCustom: false,
            // CRITICAL: Preserve productId to maintain link to real product. Do not remove.
            productId: item.productId,
          };
        } else {
          // Manual Item
          return {
            product: { price: item.price },
            quantity: item.quantity || 1,
            name: item.name,
            sku: item.sku || "MANUAL",
            imageUrl: item.imageUrl || "",
            isCustom: true,
          };
        }
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

      // Use tolerance of 1 COP (appropriate for Colombian Peso which has no decimal places)
      const PRICE_TOLERANCE = 1;
      const totalDiff = Math.abs(totals.total - total);
      const subtotalDiff = Math.abs(totals.subtotal - subtotal);

      if (totalDiff > PRICE_TOLERANCE || subtotalDiff > PRICE_TOLERANCE) {
        console.error("[ORDER_PATCH] Price mismatch detected:", {
          sent: { subtotal, total, shippingCost: shipping?.cost || 0 },
          calculated: totals,
          differences: { subtotalDiff, totalDiff },
        });

        throw ErrorFactory.InvalidRequest(
          "Los montos calculados no coinciden con los enviados",
        );
      }

      // CRITICAL FIX: Validate stock for PAID orders when changing items
      if (order.status === OrderStatus.PAID) {
        const newStockRequirements = orderItems
          .filter((item: any) => item.productId) // Exclude manual items
          .map((item: any) => ({
            productId: item.productId as string,
            quantity: item.quantity || 1,
          }));

        // Get current order items to calculate the difference
        const currentStockUsage = order.orderItems
          .filter((item) => item.productId) // Exclude manual items
          .map((item) => ({
            productId: item.productId as string,
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
          await validateStockAvailability(tx, additionalStockNeeded);
        }
      }

      // Delete existing order items in batches
      await tx.orderItem.deleteMany({
        where: { orderId: order.id },
      });

      // Batch create new order items
      const createOperations = [];
      for (let i = 0; i < itemsWithPrices.length; i += BATCH_SIZE) {
        const batch = itemsWithPrices.slice(i, i + BATCH_SIZE);
        createOperations.push(
          ...batch.map((item: any) =>
            tx.orderItem.create({
              data: {
                orderId: order.id,
                quantity: item.quantity,
                // Snapshot fields
                name: item.name,
                sku: item.sku,
                price: item.product.price,
                imageUrl: item.imageUrl,
                isCustom: item.isCustom,
                productId: item.productId || null,
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
          ...(type && { type }),
          adminNotes,
          internalNotes,
          expiresAt,
          ...tokenUpdate,
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
          // Upsert shipping for all providers including NONE (store pickup)
          ...(shipping && shippingProvider
            ? {
                shipping: {
                  upsert: {
                    create: {
                      status: shipping.status || ShippingStatus.Preparing,
                      provider: shippingProvider,
                      // Only set carrier-specific fields for non-NONE providers
                      ...(shippingProvider !== "NONE" && {
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
                        trackingCode: shipping.trackingCode,
                        trackingUrl: shipping.trackingUrl,
                        guideUrl: shipping.guideUrl,
                        estimatedDeliveryDate: shipping.estimatedDeliveryDate,
                        box: shipping.boxId
                          ? { connect: { id: shipping.boxId } }
                          : undefined,
                      }),
                      cost: shipping.cost,
                      notes: shipping.notes,
                      store: { connect: { id: params.storeId } },
                    },
                    update: {
                      ...(shippingProvider && { provider: shippingProvider }),
                      ...(shipping.status && { status: shipping.status }),
                      // Only update carrier-specific fields for non-NONE providers
                      ...(shippingProvider !== "NONE" && {
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
                        trackingCode: shipping.trackingCode,
                        trackingUrl: shipping.trackingUrl,
                        guideUrl: shipping.guideUrl,
                        estimatedDeliveryDate: shipping.estimatedDeliveryDate,
                        box:
                          shipping.boxId === null
                            ? { disconnect: true }
                            : shipping.boxId
                              ? { connect: { id: shipping.boxId } }
                              : undefined,
                      }),
                      cost: shipping.cost,
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
        updated.shipping.envioClickIdRate &&
        !skipAutoGuide
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
          if (skipAutoGuide) {
            console.log(
              "[ORDER_UPDATE] Skipping automatic guide creation - admin chose to skip",
            );
          } else {
            console.log(
              "[ORDER_UPDATE] Skipping automatic guide creation - no shipping rate available",
            );
          }
        }
      }

      if (isNowPaid && !wasPaid) {
        // Prepare stock updates for decrementing (Sales)
        const stockMovements = updated.orderItems
          .filter((item) => item.productId) // Exclude manual items
          .map((item) => ({
            productId: item.productId as string,
            storeId: params.storeId,
            type: "ORDER_PLACED" as const,
            quantity: -item.quantity, // Negative for removal
            reason: `Orden Actualizada #${updated.orderNumber}`,
            referenceId: updated.id,
            createdBy: userId || "SYSTEM",
          }));

        const stockResult = await createInventoryMovementBatchResilient(
          tx,
          stockMovements,
        );

        if (stockResult.failed.length > 0) {
          console.error(
            "Partial stock update failure (Upgrade to Paid):",
            stockResult.failed,
          );
          // Optionally throw here if strict
        }

        // Invalidate cache since stock changed
        await invalidateStoreProductsCache(params.storeId);

        // CRITICAL FIX: Increment coupon usage when order becomes PAID
        if (updated.coupon) {
          await tx.coupon.update({
            where: { id: updated.coupon.id },
            data: {
              usedCount: { increment: 1 },
            },
          });
        }
      }

      // 4. Handle Refund/Restock (Paid -> Not Paid/Cancelled)
      if (wasPaid && !isNowPaid) {
        // Restock items
        const stockMovements = updated.orderItems
          .filter((item) => item.productId)
          .map((item) => ({
            productId: item.productId as string,
            storeId: params.storeId,
            type: "ORDER_CANCELLED" as const,
            quantity: item.quantity, // Positive for addition
            reason: `Orden Cancelada/Revertida #${updated.orderNumber}`,
            referenceId: updated.id,
            cost: Number(item.product?.acqPrice) || 0,
            createdBy: userId || "SYSTEM",
          }));

        // We use standard batch because restocking shouldn't fail (unless product deleted?)
        await createInventoryMovementBatch(tx, stockMovements, false);

        // Invalidate cache since stock changed
        await invalidateStoreProductsCache(params.storeId);

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
        const stockMovements = order.orderItems
          .filter((item) => item.productId) // Exclude manual items
          .map((item) => ({
            productId: item.productId as string,
            storeId: params.storeId,
            type: "ORDER_CANCELLED" as const, // Effectively a return/refund
            quantity: item.quantity, // Positive for addition
            reason: `Orden Eliminada #${order.orderNumber}`,
            referenceId: order.id,
            createdBy: userId || "SYSTEM",
          }));

        const stockResult = await createInventoryMovementBatchResilient(
          tx,
          stockMovements,
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
