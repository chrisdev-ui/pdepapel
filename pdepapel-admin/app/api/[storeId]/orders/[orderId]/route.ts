import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import {
  calculateOrderTotals,
  currencyFormatter,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth, clerkClient } from "@clerk/nextjs";
import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from "@prisma/client";
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

    return NextResponse.json(order, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_GET", { headers: corsHeaders });
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
      email,
      userId: requestUserId,
      guestId,
      documentId,
      subtotal,
      total,
      discount,
      couponCode,
    } = body;

    await verifyStoreOwner(userId, params.storeId);

    const order = await prismadb.order.findUnique({
      where: { id: params.orderId },
      include: { orderItems: true, shipping: true, coupon: true },
    });
    if (!order)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);

    let wasPaid = order.status === OrderStatus.PAID;
    let isNowPaid = status === OrderStatus.PAID;

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
      if (wasPaid && isNowPaid) {
        // Update only non-total related fields for paid orders
        return tx.order.update({
          where: { id: params.orderId },
          data: {
            fullName,
            phone,
            address,
            userId: verifiedUserId,
            guestId: verifiedUserId ? null : guestId,
            documentId,
            email,
            payment: payment && {
              upsert: {
                create: {
                  ...payment,
                  store: { connect: { id: params.storeId } },
                },
                update: payment,
              },
            },
            shipping: shipping && {
              upsert: {
                create: {
                  ...shipping,
                  store: { connect: { id: params.storeId } },
                },
                update: shipping,
              },
            },
          },
          include: {
            orderItems: { include: { product: true } },
            payment: true,
            shipping: true,
            coupon: true,
          },
        });
      }
      let coupon = order.coupon;

      if (order.couponId && !couponCode) {
        if (order.status === OrderStatus.PAID) {
          const existingCoupon = await tx.coupon.findUnique({
            where: { id: order.couponId },
          });

          if (existingCoupon && existingCoupon.usedCount > 0) {
            await tx.coupon.update({
              where: { id: order.couponId },
              data: { usedCount: { decrement: 1 } },
            });
          }
        }
        coupon = null;
      }

      if (couponCode && (!order.coupon || order.coupon.code !== couponCode)) {
        if (order.couponId && order.status === OrderStatus.PAID) {
          const existingCoupon = await tx.coupon.findUnique({
            where: { id: order.couponId },
          });

          if (existingCoupon && existingCoupon.usedCount > 0) {
            await tx.coupon.update({
              where: { id: order.couponId },
              data: { usedCount: { decrement: 1 } },
            });
          }
        }

        coupon = await tx.coupon.findFirst({
          where: {
            storeId: params.storeId,
            code: couponCode.toUpperCase(),
            isActive: true,
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
            OR: [
              { maxUses: null },
              {
                AND: [
                  { maxUses: { not: null } },
                  { usedCount: { lt: prismadb.coupon.fields.maxUses } },
                ],
              },
            ],
          },
        });

        if (!coupon) {
          throw ErrorFactory.NotFound("Cupón no válido o expirado");
        }

        if (subtotal < Number(coupon.minOrderValue ?? 0)) {
          throw ErrorFactory.Conflict(
            `El pedido debe ser mayor a ${currencyFormatter.format(coupon.minOrderValue ?? 0)} para usar este cupón`,
          );
        }

        if (status === OrderStatus.PAID) {
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
          });
        }
      }

      await tx.orderItem.deleteMany({ where: { orderId: order.id } });

      const products = await tx.product.findMany({
        where: {
          id: {
            in: orderItems.map((item: any) => item.productId),
          },
        },
        select: {
          id: true,
          price: true,
          name: true,
          stock: true,
        },
      });

      const itemsWithPrices = orderItems.map((item: any) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) {
          throw ErrorFactory.NotFound(
            `Producto ${item.productId} no encontrado`,
          );
        }
        return {
          product: { price: product.price },
          quantity: item.quantity,
        };
      });

      const totals = calculateOrderTotals(itemsWithPrices, {
        discount:
          discount?.type && discount?.amount
            ? {
                type: discount.type as DiscountType,
                amount: discount.amount,
              }
            : undefined,
        coupon:
          coupon && subtotal >= Number(coupon.minOrderValue ?? 0)
            ? {
                type: coupon.type as DiscountType,
                amount: coupon.amount,
              }
            : undefined,
      });

      if (
        Math.abs(totals.total - total) > 0.01 ||
        Math.abs(totals.subtotal - subtotal) > 0.01
      ) {
        throw ErrorFactory.InvalidRequest(
          "Los montos calculados no coinciden con los enviados",
        );
      }

      const updated = await tx.order.update({
        where: { id: params.orderId },
        data: {
          fullName,
          phone,
          address,
          userId: verifiedUserId,
          guestId: verifiedUserId ? null : guestId,
          documentId,
          subtotal: totals.subtotal,
          discount: totals.discount,
          discountType: discount?.type as DiscountType,
          discountReason: discount?.reason,
          coupon: coupon
            ? { connect: { id: coupon.id } }
            : { disconnect: true },
          couponDiscount: coupon ? totals.couponDiscount : 0,
          total: totals.total,
          orderItems: {
            create: orderItems.map(
              (orderItem: { productId: string; quantity?: number }) => ({
                product: { connect: { id: orderItem.productId } },
                quantity: orderItem.quantity ?? 1,
              }),
            ),
          },
          ...(status && { status }),
          payment: payment && {
            upsert: {
              create: {
                ...payment,
                store: { connect: { id: params.storeId } },
              },
              update: payment,
            },
          },
          shipping: shipping && {
            upsert: {
              create: {
                ...shipping,
                store: { connect: { id: params.storeId } },
              },
              update: shipping,
            },
          },
        },
        include: {
          orderItems: { include: { product: true } },
          payment: true,
          shipping: true,
          coupon: true,
        },
      });

      // 3. Handle stock changes within the same transaction
      wasPaid = order.status === OrderStatus.PAID;
      isNowPaid = updated.status === OrderStatus.PAID;

      if (isNowPaid && !wasPaid) {
        // Pre-check product availability
        const productIds = updated.orderItems.map((i) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
        });

        const outOfStock = updated.orderItems.find((item) => {
          const product = products.find((p) => p.id === item.productId);
          return !product || product.stock < item.quantity;
        });

        if (outOfStock) {
          throw ErrorFactory.InsufficientStock(
            outOfStock.product.name,
            outOfStock.product.stock,
            outOfStock.quantity,
          );
        }

        // Batch update stock
        await Promise.all(
          updated.orderItems.map((item) =>
            tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
            }),
          ),
        );
      } else if (!isNowPaid && wasPaid) {
        // Restock products
        await Promise.all(
          updated.orderItems.map((item) =>
            tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            }),
          ),
        );
      }

      return updated;
    });

    // Send email notifications for status changes
    if (status && updatedOrder.status !== originalStatus) {
      // Fetch full order details with relations
      const fullOrder = await prismadb.order.findUnique({
        where: { id: params.orderId },
        include: {
          payment: true,
          shipping: true,
          orderItems: {
            include: {
              product: true,
            },
          },
          coupon: true,
        },
      });

      if (fullOrder) {
        await sendOrderEmail(
          {
            ...fullOrder,
            payment: fullOrder.payment?.method ?? null,
          },
          updatedOrder.status,
        );
      }
    }

    // Send email for shipping status changes
    if (
      shipping?.status &&
      updatedOrder.shipping?.status !== originalShippingStatus
    ) {
      // Fetch full order details with relations
      const fullOrder = await prismadb.order.findUnique({
        where: { id: params.orderId },
        include: {
          payment: true,
          shipping: true,
          coupon: true,
        },
      });

      if (fullOrder) {
        await sendOrderEmail(
          {
            ...fullOrder,
            payment: fullOrder.payment?.method ?? null,
          },
          fullOrder.shipping?.status as ShippingStatus,
        );
      }
    }

    return NextResponse.json(updatedOrder);
  } catch (error) {
    return handleErrorResponse(error, "ORDER_PATCH");
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
        include: { shipping: true, payment: true, coupon: true },
      });
      if (!order)
        throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);

      if (order.status === OrderStatus.PAID) {
        throw ErrorFactory.Conflict(
          `La orden ${params.orderId} ya fue pagada y no puede ser eliminada`,
        );
      }

      if (
        order.shipping &&
        order.shipping.status !== ShippingStatus.Preparing
      ) {
        throw ErrorFactory.Conflict(
          `La orden ${order.orderNumber} no puede eliminarse porque el envío está en proceso`,
        );
      }

      if (
        order.payment &&
        order.payment.method &&
        order.payment.method !== PaymentMethod.COD &&
        order.payment.transactionId
      ) {
        throw ErrorFactory.Conflict(
          `La orden ${order.orderNumber} no puede eliminarse porque tiene una transacción bancaria registrada`,
        );
      }

      if (order.coupon) {
        const coupon = await tx.coupon.findUnique({
          where: { id: order.coupon.id },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            coupon: { disconnect: true },
            couponDiscount: 0,
          },
        });
      }

      const deletedOrder = await tx.order.delete({
        where: { id: params.orderId, storeId: params.storeId },
      });

      return deletedOrder;
    });

    // Send cancellation email
    if (order.status !== OrderStatus.CANCELLED) {
      // Fetch full order details with relations
      const fullOrder = await prismadb.order.findUnique({
        where: { id: params.orderId },
        include: {
          payment: true,
          shipping: true,
          coupon: true,
          orderItems: {
            include: {
              product: true,
            },
          },
        },
      });

      if (fullOrder) {
        await sendOrderEmail(
          {
            ...fullOrder,
            payment: fullOrder.payment?.method ?? null,
          },
          OrderStatus.CANCELLED,
        );
      }
    }

    return NextResponse.json(order);
  } catch (error) {
    return handleErrorResponse(error, "ORDER_DELETE");
  }
}
