import { EmailTemplate } from "@/components/email-template";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import { generateOrderNumber, getLastOrderTimestamp } from "@/lib/utils";
import { auth, clerkClient } from "@clerk/nextjs";
import { OrderStatus, Prisma, ShippingStatus } from "@prisma/client";
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

    if (
      !fullName ||
      !phone ||
      !address ||
      !orderItems ||
      orderItems.length === 0
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers: corsHeaders },
      );
    }

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

    const order = await prismadb.$transaction(
      async (tx) => {
        // First, verify stock availability for all products
        for (const item of orderItems) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product) {
            throw new Error(`Product ${item.productId} not found`);
          }

          if (product.stock < (item.quantity ?? 1)) {
            throw new Error(
              `Product ${product.name} does not have enough stock. Available: ${product.stock}, Requested: ${item.quantity ?? 1}`,
            );
          }
        }

        // Create the order
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

        if (status) orderData.status = status;
        if (payment)
          orderData.payment = {
            create: { ...payment, storeId: params.storeId },
          };
        if (shipping)
          orderData.shipping = {
            create: { ...shipping, storeId: params.storeId },
          };

        const createdOrder = await tx.order.create({
          data: orderData,
          include: {
            orderItems: true,
          },
        });

        // If order is paid, update stock levels
        if (status === OrderStatus.PAID) {
          for (const item of createdOrder.orderItems) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stock: {
                  decrement: item.quantity,
                },
              },
            });
          }
        }

        return createdOrder;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 20000,
      },
    );

    // Send email notification outside the transaction
    if (!storeOwner) {
      await resend.emails.send({
        from: "Orders <admin@papeleriapdepapel.com>",
        to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
        subject: `Nueva orden de compra - ${fullName}`,
        react: EmailTemplate({
          name: fullName,
          phone,
          address,
          orderNumber: order.orderNumber,
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

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Order ID(s) are required and must be an array" },
        { status: 400 },
      );
    }

    const storeOwner = await isStoreOwner(userId, params.storeId);
    if (!storeOwner) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await prismadb.$transaction(async (tx) => {
      const deletedOrders = await tx.order.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      return {
        deletedOrders,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.log("[ORDERS_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      ids,
      status,
      shipping,
    }: { ids: string[]; status?: OrderStatus; shipping?: ShippingStatus } =
      body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Order ID(s) are required and must be an array" },
        { status: 400 },
      );
    }

    const storeOwner = await isStoreOwner(userId, params.storeId);
    if (!storeOwner) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await prismadb.$transaction(
      async (tx) => {
        const orders = await tx.order.findMany({
          where: {
            id: {
              in: ids,
            },
            storeId: params.storeId,
          },
          include: {
            orderItems: {
              include: {
                product: true,
              },
            },
          },
        });

        const updatedOrders = await Promise.all(
          orders.map(async (order) => {
            const updateData: {
              status?: OrderStatus;
              shipping?: ShippingStatus;
            } = {};

            if (status) {
              const wasPaid = order.status === OrderStatus.PAID;
              const willBePaid = status === OrderStatus.PAID;
              updateData.status = status;

              if (willBePaid && !wasPaid) {
                const outOfStock = order.orderItems.find((item) => {
                  return item.product.stock < item.quantity;
                });

                if (outOfStock) {
                  throw new Error(
                    `Product ${outOfStock.product.name} is out of stock. Please contact the store owner.`,
                  );
                }

                await Promise.all(
                  order.orderItems.map((item) =>
                    tx.product.update({
                      where: { id: item.productId },
                      data: {
                        stock: {
                          decrement: item.quantity,
                        },
                      },
                    }),
                  ),
                );
              } else if (!willBePaid && wasPaid) {
                await Promise.all(
                  order.orderItems.map((item) =>
                    tx.product.update({
                      where: { id: item.productId },
                      data: {
                        stock: {
                          increment: item.quantity,
                        },
                      },
                    }),
                  ),
                );
              }
            }

            if (shipping) {
              updateData.shipping = shipping;
            }

            return await tx.order.update({
              where: { id: order.id },
              data: {
                status: updateData.status,
                shipping: {
                  update: {
                    data: {
                      status: updateData.shipping,
                    },
                  },
                },
              },
            });
          }),
        );

        return updatedOrders;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 20000,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.log("[ORDERS_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
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
