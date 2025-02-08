import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { checkIfStoreOwner, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
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
      userId: requestUserId,
      guestId,
      documentId,
    } = body;

    const storeByUserId = await checkIfStoreOwner(userId, params.storeId);
    if (!storeByUserId) throw ErrorFactory.Unauthorized();

    const order = await prismadb.order.findUnique({
      where: { id: params.orderId },
      include: { orderItems: true, shipping: true },
    });
    if (!order)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);

    const updatedOrder = await prismadb.$transaction(
      async (tx) => {
        // 1. Remove existing order items
        await tx.orderItem.deleteMany({ where: { orderId: order.id } });

        // 2. Update order with new items and details
        const updated = await tx.order.update({
          where: { id: params.orderId },
          data: {
            fullName,
            phone,
            address,
            userId: requestUserId,
            guestId,
            documentId,
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
          },
        });

        // 3. Handle stock changes within the same transaction
        const wasPaid = order.status === OrderStatus.PAID;
        const isNowPaid = updated.status === OrderStatus.PAID;

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
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 20000,
      },
    );

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
        include: { shipping: true, payment: true },
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
        order.payment.method !== PaymentMethod.COD
      ) {
        throw ErrorFactory.Conflict(
          `La orden ${order.orderNumber} no puede eliminarse porque tiene una transacción bancaria registrada`,
        );
      }

      const deletedOrder = await tx.order.delete({
        where: { id: params.orderId, storeId: params.storeId },
      });

      return deletedOrder;
    });

    return NextResponse.json(order);
  } catch (error) {
    return handleErrorResponse(error, "ORDER_DELETE");
  }
}
