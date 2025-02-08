import { EmailTemplate } from "@/components/email-template";
import { ALLOWED_TRANSITIONS, shippingOptions } from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import {
  checkIfStoreOwner,
  generateOrderNumber,
  getLastOrderTimestamp,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth, clerkClient } from "@clerk/nextjs";
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  ShippingStatus,
} from "@prisma/client";
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

  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

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
      throw ErrorFactory.InvalidRequest("Faltan campos obligatorios");
    }

    let authenticatedUserId = userLogged;
    if (userId && !userLogged) {
      const user = await clerkClient.users.getUser(userId);
      if (user) {
        authenticatedUserId = user.id;
      } else {
        throw ErrorFactory.Unauthenticated();
      }
    }

    const isStoreOwner = await checkIfStoreOwner(
      authenticatedUserId,
      params.storeId,
    );
    if (!isStoreOwner) {
      const lastOrderTimestamp = await getLastOrderTimestamp(
        authenticatedUserId,
        guestId,
        params.storeId,
      );
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      if (lastOrderTimestamp && lastOrderTimestamp > threeMinutesAgo)
        throw ErrorFactory.OrderLimit();
    }

    const order = await prismadb.$transaction(
      async (tx) => {
        // First, verify stock availability for all products
        for (const item of orderItems) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product) {
            throw ErrorFactory.NotFound(`Producto ${item.productId}`);
          }

          if (product.stock < (item.quantity ?? 1)) {
            throw ErrorFactory.InsufficientStock(
              product.name,
              product.stock,
              item.quantity,
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
    if (!isStoreOwner) {
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
    return handleErrorResponse(error, "ORDERS_POST", { headers: corsHeaders });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

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
    return handleErrorResponse(error, "ORDERS_GET", { headers: corsHeaders });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();
  try {
    if (!userId) throw ErrorFactory.Unauthenticated();

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de órdenes válidas en formato de arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          id: {
            in: ids,
          },
          storeId: params.storeId,
        },
        include: {
          shipping: true,
          payment: true,
        },
      });

      if (orders.length !== ids.length) {
        throw ErrorFactory.NotFound(
          "Algunas órdenes no se han encontrado en esta tienda",
        );
      }

      for (const order of orders) {
        if (order.status === OrderStatus.PAID) {
          throw ErrorFactory.Conflict(
            `La orden ${order.orderNumber} no puede eliminarse porque ya fue pagada`,
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
      }

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
        message: `Se eliminaron ${deletedOrders.count} órdenes correctamente`,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleErrorResponse(error, "ORDERS_DELETE");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();

  try {
    if (!userId) throw ErrorFactory.Unauthenticated();

    const body = await req.json();
    const {
      ids,
      status,
      shipping,
    }: { ids: string[]; status?: OrderStatus; shipping?: ShippingStatus } =
      body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de órdenes válidas en formato de arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

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
            shipping: true,
            payment: true,
          },
        });

        if (orders.length !== ids.length) {
          throw ErrorFactory.NotFound(
            "Algunas órdenes no se han encontrado en esta tienda",
          );
        }

        for (const order of orders) {
          if (status) {
            if (order.status === OrderStatus.CANCELLED) {
              throw ErrorFactory.Conflict(
                `La orden ${order.orderNumber} está cancelada y no puede modificarse`,
              );
            }

            if (
              status === OrderStatus.PAID &&
              order.status !== OrderStatus.PAID
            ) {
              const outOfStock = order.orderItems.find(
                (item) => item.product.stock < item.quantity,
              );

              if (outOfStock) {
                throw ErrorFactory.InsufficientStock(
                  outOfStock.product.name,
                  outOfStock.product.stock,
                  outOfStock.quantity,
                );
              }
            }

            if (
              order.status === OrderStatus.PAID &&
              status !== OrderStatus.PAID
            ) {
              if (order.shipping?.status === ShippingStatus.Delivered) {
                throw ErrorFactory.Conflict(
                  `La orden ${order.orderNumber} ya fue entregada y no puede modificarse`,
                );
              }
            }
          }

          if (shipping) {
            if (order.status !== OrderStatus.PAID) {
              throw ErrorFactory.Conflict(
                `La orden ${order.orderNumber} debe estar pagada para actualizar el envío`,
              );
            }

            const currentShippingStatus = order.shipping?.status;

            if (currentShippingStatus !== undefined) {
              const allowedStatuses =
                ALLOWED_TRANSITIONS[currentShippingStatus];

              if (!allowedStatuses.includes(shipping)) {
                throw ErrorFactory.Conflict(
                  `No se puede cambiar el estado de envío de "${shippingOptions[currentShippingStatus]}" a "${shippingOptions[shipping]}"`,
                );
              }
            }
          }
        }

        const updatedOrders = await Promise.all(
          orders.map(async (order) => {
            const updateData: {
              status?: OrderStatus;
              shipping?: { update: { status?: ShippingStatus } };
            } = {};

            if (status) {
              const wasPaid = order.status === OrderStatus.PAID;
              const willBePaid = status === OrderStatus.PAID;
              updateData.status = status;

              if (willBePaid && !wasPaid) {
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
                      data: { stock: { increment: item.quantity } },
                    }),
                  ),
                );
              }
            }

            if (shipping) {
              updateData.shipping = {
                update: {
                  status: shipping,
                },
              };
            }

            return tx.order.update({
              where: { id: order.id },
              data: updateData,
              include: {
                orderItems: true,
                shipping: true,
                payment: true,
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
    return handleErrorResponse(error, "ORDERS_PATCH");
  }
}
