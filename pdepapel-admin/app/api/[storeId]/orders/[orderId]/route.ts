import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { getOrderById } from "@/helpers/orders-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import prismadb from "@/lib/prismadb";
import { OrderBody } from "@/lib/types";
import { auth } from "@clerk/nextjs";
import { OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  orderId: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.orderId)
    return handleErrorResponse("Order ID is required", 400, corsHeaders);
  if (!params.storeId)
    return handleErrorResponse("Store ID is required", 400, corsHeaders);
  try {
    const order = await getOrderById(params.orderId);
    if (!order) return handleErrorResponse("Order not found", 404, corsHeaders);
    return handleSuccessResponse(order, 200, corsHeaders);
  } catch (error) {
    console.log("[ORDER_GET]", error);
    return handleErrorResponse("[ORDER_GET_ERROR]", 500, corsHeaders);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const ownerId = getUserId();
  if (!ownerId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.orderId)
    return handleErrorResponse("Order ID is required", 400, corsHeaders);
  if (!params.storeId)
    return handleErrorResponse("Store ID is required", 400, corsHeaders);
  try {
    const body: OrderBody = await req.json();
    const {
      fullName,
      phone,
      address,
      userId,
      guestId,
      orderItems,
      status,
      payment,
      shipping,
    } = body;
    const missingFields = validateMandatoryFields(body, [
      "fullName",
      "phone",
      "address",
      "orderItems",
    ]);
    if (missingFields)
      return handleErrorResponse(
        `Missing fields: ${missingFields.join(", ")}`,
        400,
        corsHeaders,
      );
    const isAuthorized = await isUserAuthorized(ownerId, params.storeId);
    if (!isAuthorized)
      return handleErrorResponse("Unauthorized", 403, corsHeaders);
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
          orderItems: {
            create: orderItems.map((orderItem) => ({
              product: { connect: { id: orderItem.productId } },
              variant: { connect: { id: orderItem.variantId } },
              quantity: orderItem.quantity ?? 1,
            })),
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

export async function DELETE(_req: Request, { params }: { params: Params }) {
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
