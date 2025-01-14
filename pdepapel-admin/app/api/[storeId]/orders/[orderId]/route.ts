import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs";
import { OrderStatus } from "@prisma/client";
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
    if (!fullName)
      return NextResponse.json(
        { error: "Full name is required" },
        { status: 400 },
      );
    if (!phone)
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    if (!address)
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 },
      );
    if (!orderItems || orderItems.length === 0)
      return NextResponse.json(
        { error: "Order items are required" },
        { status: 400 },
      );
    const order = await prismadb.order.findUnique({
      where: { id: params.orderId },
      include: {
        orderItems: true,
      },
    });
    if (!order)
      return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const updatedOrder = await prismadb.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({
        where: { orderId: order.id },
      });

      return await tx.order.update({
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
          payment: payment
            ? {
                upsert: {
                  create: {
                    ...payment,
                    store: { connect: { id: params.storeId } },
                  },
                  update: {
                    ...payment,
                  },
                },
              }
            : undefined,
          shipping: shipping
            ? {
                upsert: {
                  create: {
                    ...shipping,
                    store: { connect: { id: params.storeId } },
                  },
                  update: {
                    ...shipping,
                  },
                },
              }
            : undefined,
        },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          payment: true,
          shipping: true,
        },
      });
    });

    if (updatedOrder) {
      if (
        updatedOrder.status === OrderStatus.PAID &&
        order.status !== OrderStatus.PAID
      ) {
        await prismadb.$transaction(async (tx) => {
          for (const orderItem of updatedOrder.orderItems) {
            const product = orderItem.product;
            if (product.stock >= orderItem.quantity) {
              await tx.product.update({
                where: { id: product.id },
                data: {
                  stock: {
                    decrement: orderItem.quantity,
                  },
                },
              });
            } else {
              throw new Error(
                `Product ${product.name} is out of stock. Please contact the store owner.`,
              );
            }
          }
        });
      } else if (
        updatedOrder.status !== OrderStatus.PAID &&
        order.status === OrderStatus.PAID
      ) {
        await prismadb.$transaction(async (tx) => {
          for (const orderItem of updatedOrder.orderItems) {
            const product = orderItem.product;
            await tx.product.update({
              where: { id: product.id },
              data: {
                stock: {
                  increment: orderItem.quantity,
                },
              },
            });
          }
        });
      }
    }
    return NextResponse.json(updatedOrder);
  } catch (error) {
    console.log("[ORDER_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
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
