import { EmailTemplate } from "@/components/email-template";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import { generateOrderNumber, getLastOrderTimestamp } from "@/lib/utils";
import { auth, clerkClient } from "@clerk/nextjs";
import { OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

type OrderData = {
  storeId: string;
  userId: string | null;
  guestId: string | null;
  orderNumber: string;
  fullName: string;
  phone: string;
  address: string;
  documentId?: string | null;
  orderItems: { create: any };
  status?: any;
  payment?: { create: any };
  shipping?: { create: any };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId: userLogged } = auth();
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400, headers: corsHeaders },
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
    let authenticatedUserId = userLogged;
    if (userId && !userLogged) {
      const user = await clerkClient.users.getUser(userId);
      if (user) {
        authenticatedUserId = user.id;
      } else {
        return NextResponse.json(
          { error: "Unauthenticated" },
          { status: 401, headers: corsHeaders },
        );
      }
    }
    if (!fullName)
      return NextResponse.json(
        { error: "Full name is required" },
        { status: 400, headers: corsHeaders },
      );
    if (!phone)
      return NextResponse.json(
        { error: "Phone is required" },
        { status: 400, headers: corsHeaders },
      );
    if (!address)
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400, headers: corsHeaders },
      );
    if (!orderItems || orderItems.length === 0)
      return NextResponse.json(
        { error: "Order items are required" },
        { status: 400, headers: corsHeaders },
      );
    const storeOwner = await isStoreOwner(authenticatedUserId, params.storeId);
    if (!storeOwner) {
      const lastOrderTimestamp = await getLastOrderTimestamp(
        authenticatedUserId,
        guestId,
        params.storeId,
      );
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      if (lastOrderTimestamp && lastOrderTimestamp > threeMinutesAgo)
        return NextResponse.json(
          { error: "Too many orders" },
          { status: 429, headers: corsHeaders },
        );
    }
    const orderNumber = generateOrderNumber();
    const orderData: OrderData = {
      storeId: params.storeId,
      userId: authenticatedUserId,
      guestId: !authenticatedUserId ? guestId : null,
      orderNumber,
      fullName,
      phone,
      address,
      documentId,
      orderItems: {
        create: orderItems.map(
          (product: { productId: string; quantity: number }) => ({
            product: { connect: { id: product.productId } },
            quantity: product.quantity ?? 1,
          }),
        ),
      },
    };
    if (status) {
      orderData.status = status;
    }
    if (payment) {
      orderData.payment = {
        create: { ...payment, storeId: params.storeId },
      };
    }
    if (shipping) {
      orderData.shipping = {
        create: { ...shipping, storeId: params.storeId },
      };
    }
    const order = await prismadb.order.create({
      data: orderData,
      include: {
        orderItems: true,
      },
    });

    if (order.status && status === OrderStatus.PAID) {
      await prismadb.$transaction(async (tx) => {
        for (const orderItem of order.orderItems) {
          const product = await tx.product.findUnique({
            where: { id: orderItem.productId },
          });

          if (!product) {
            throw new Error(`Product ${orderItem.productId} not found.`);
          }

          if (product.stock >= orderItem.quantity) {
            await tx.product.update({
              where: { id: orderItem.productId },
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
    }

    if (!storeOwner) {
      await resend.emails.send({
        from: "Orders <admin@papeleriapdepapel.com>",
        to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
        subject: `Nueva orden de compra - ${fullName}`,
        react: EmailTemplate({
          name: fullName,
          phone,
          address,
          orderNumber,
          paymentMethod: "Transferencia bancaria o contra entrega",
        }) as React.ReactElement,
      });
    }
    return NextResponse.json(order, { headers: corsHeaders });
  } catch (error) {
    console.log("[ORDERS_POST]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400, headers: corsHeaders },
    );
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    const guestId = req.nextUrl.searchParams.get("guestId");
    const whereClause: { storeId: string; userId?: string; guestId?: string } =
      {
        storeId: params.storeId,
      };

    if (userId) {
      whereClause.userId = userId;
    } else if (guestId) {
      whereClause.guestId = guestId;
    }

    const orders = await prismadb.order.findMany({
      where: whereClause,
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
    return NextResponse.json(orders, { headers: corsHeaders });
  } catch (error) {
    console.log("[ORDERS_GET]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders },
    );
  }
}

async function isStoreOwner(userId: string | null, storeId: string) {
  if (!userId) return false;
  const storeByUserId = await prismadb.store.findFirst({
    where: {
      id: storeId,
      userId,
    },
  });
  return !!storeByUserId;
}
