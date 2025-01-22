import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs";
import { OrderStatus, Prisma } from "@prisma/client";
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
  if (!params.orderId)
    return NextResponse.json(
      { error: "Order ID is required" },
      { status: 400, headers: corsHeaders },
    );
  try {
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
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404, headers: corsHeaders },
      );
    return NextResponse.json(order, { headers: corsHeaders });
  } catch (error) {
    console.log("[ORDER_GET]", error);
    return NextResponse.json(
      { error: "Internal Error" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const { userId: ownerId } = auth();
  if (!ownerId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!params.orderId)
    return NextResponse.json(
      { error: "Order ID is required" },
      { status: 400 },
    );

  try {
    const body = await req.json();
    const {
      fullName,
      phone,
      address,
      orderItems,
      status,
      payment,
      shipping,
      userId,
      guestId,
      documentId,
    } = body;

    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId: ownerId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    // Validation checks (same as before)

    const order = await prismadb.order.findUnique({
      where: { id: params.orderId },
      include: { orderItems: true },
    });
    if (!order)
      return NextResponse.json({ error: "Order not found" }, { status: 404 });

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
            userId,
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
            throw new Error(
              `Product ${outOfStock.product.name} is out of stock. Please contact the store owner.`,
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
    console.error("[ORDER_PATCH]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!params.orderId)
    return NextResponse.json(
      { error: "Order ID is required" },
      { status: 400 },
    );
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const order = await prismadb.order.delete({
      where: { id: params.orderId },
    });
    if (!order)
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(order);
  } catch (error) {
    console.log("[ORDER_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
