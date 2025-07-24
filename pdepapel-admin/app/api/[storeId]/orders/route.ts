import { BATCH_SIZE } from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";

import {
  batchUpdateProductStock,
  batchUpdateProductStockResilient,
  CACHE_HEADERS,
  calculateOrderTotals,
  checkIfStoreOwner,
  currencyFormatter,
  generateOrderNumber,
  getLastOrderTimestamp,
  processOrderItemsInBatches,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth, clerkClient } from "@clerk/nextjs";
import {
  Coupon,
  DiscountType,
  OrderStatus,
  PaymentMethod,
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
  email?: string;
  address: string;
  documentId?: string | null;
  subtotal: number;
  discount?: number;
  discountType?: DiscountType;
  discountReason?: string | null;
  couponId?: string | null;
  couponDiscount?: number;
  total: number;
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

    const isStoreOwner = userLogged
      ? await checkIfStoreOwner(userLogged, params.storeId)
      : false;

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
      userId,
      guestId,
      documentId,
      subtotal,
      total,
      discount,
      couponCode,
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

    if (orderItems.length > 1000) {
      throw ErrorFactory.InvalidRequest(
        "La orden excede el límite máximo de 1000 productos",
      );
    }

    let authenticatedUserId = userLogged;
    if (userId) {
      if (isStoreOwner) {
        try {
          await clerkClient.users.getUser(userId);
          authenticatedUserId = userId;
        } catch (error) {
          throw ErrorFactory.NotFound("El usuario asignado no existe");
        }
      } else if (!userLogged) {
        const user = await clerkClient.users.getUser(userId);
        if (user) {
          authenticatedUserId = user.id;
        } else {
          throw ErrorFactory.Unauthenticated();
        }
      }
    }

    if (!isStoreOwner) {
      if (discount?.type && discount?.amount) throw ErrorFactory.Unauthorized();

      const lastOrderTimestamp = await getLastOrderTimestamp(
        authenticatedUserId,
        guestId,
        params.storeId,
      );
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      if (lastOrderTimestamp && lastOrderTimestamp > threeMinutesAgo)
        throw ErrorFactory.OrderLimit();
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
          discountType: discount.type as DiscountType,
          discountAmount: discount.amount,
          couponCode,
        },
      );
    }

    if (discount?.type && !discount?.amount) {
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

    let coupon: Coupon | null = null;

    if (couponCode) {
      coupon = await prismadb.coupon.findFirst({
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
        throw ErrorFactory.NotFound("Código de cupón no válido o expirado");
      }

      if (subtotal < Number(coupon.minOrderValue ?? 0)) {
        throw ErrorFactory.Conflict(
          `El pedido debe ser mayor a ${currencyFormatter.format(coupon.minOrderValue ?? 0)} para usar este cupón`,
        );
      }
    }

    const order = await prismadb.$transaction(async (tx) => {
      // Batch process products for better performance
      const products = await processOrderItemsInBatches(
        orderItems,
        params.storeId,
        BATCH_SIZE,
      );

      // Create a map for faster lookups
      const productMap = new Map(products.map((p) => [p.id, p]));

      const itemsWithPrices = orderItems.map(
        (item: { productId: string; quantity?: number }) => {
          const product = productMap.get(item.productId);
          if (!product) {
            throw ErrorFactory.NotFound(
              `Producto ${item.productId} no encontrado`,
            );
          }
          return {
            product: { price: product.price },
            quantity: item.quantity,
          };
        },
      );

      const totals = calculateOrderTotals(itemsWithPrices, {
        discount:
          discount?.type && discount?.amount
            ? {
                type: discount.type as DiscountType,
                amount: discount.amount,
              }
            : undefined,
        coupon: coupon
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

      const orderNumber = generateOrderNumber();

      // CRITICAL FIX: Validate stock BEFORE creating PAID orders
      if (status === OrderStatus.PAID) {
        const stockValidationUpdates = orderItems.map(
          (item: { productId: string; quantity: number }) => ({
            productId: item.productId,
            quantity: item.quantity, // Positive for decrement validation
          }),
        );

        // Use strict validation - will throw error if insufficient stock
        await batchUpdateProductStock(tx, stockValidationUpdates, true);

        // Revert the validation updates since we'll apply them after order creation
        const revertUpdates = stockValidationUpdates.map(
          (update: { productId: string; quantity: number }) => ({
            productId: update.productId,
            quantity: -update.quantity, // Negative to revert
          }),
        );
        await batchUpdateProductStock(tx, revertUpdates, false);
      }

      const orderData: OrderData = {
        storeId: params.storeId,
        userId: authenticatedUserId,
        guestId: !authenticatedUserId ? guestId : null,
        orderNumber,
        fullName,
        phone,
        address,
        email,
        documentId,
        subtotal: totals.subtotal,
        discount: totals.discount,
        discountType: discount?.type as DiscountType,
        discountReason: discount?.reason,
        couponId: coupon?.id,
        couponDiscount: totals.couponDiscount,
        total: totals.total,
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

      // Batch update stock if order is paid
      if (status === OrderStatus.PAID) {
        const stockUpdates = createdOrder.orderItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity, // Positive for decrement
        }));

        const stockResult = await batchUpdateProductStockResilient(
          tx,
          stockUpdates,
          true,
        );

        // Log stock update results but don't throw errors
        if (stockResult.failed.length > 0) {
          console.warn("Some stock updates failed:", {
            orderId: createdOrder.id,
            orderNumber: createdOrder.orderNumber,
            failed: stockResult.failed,
            success: stockResult.success,
          });
        }
      }

      // Update coupon usage if applicable
      if (coupon && status === OrderStatus.PAID) {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: {
            usedCount: {
              increment: 1,
            },
          },
        });
      }

      return createdOrder;
    });

    // Queue email sending asynchronously (don't wait for it)
    if (!isStoreOwner) {
      // Use setImmediate or setTimeout to avoid blocking the response
      setImmediate(async () => {
        try {
          const orderWithDetails = await prismadb.order.findUnique({
            where: { id: order.id },
            include: {
              payment: true,
              shipping: true,
              orderItems: {
                include: {
                  product: true,
                },
              },
            },
          });

          if (orderWithDetails) {
            await sendOrderEmail(
              {
                ...orderWithDetails,
                email: email || "",
                payment: orderWithDetails.payment?.method ?? null,
              },
              status || OrderStatus.PENDING,
            );
          }
        } catch (emailError) {
          console.error("Failed to send order email:", emailError);
          // Consider implementing a retry mechanism or queue system
        }
      });
    }

    return NextResponse.json(order, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDERS_POST", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
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
        coupon: true,
      },
    });

    return NextResponse.json(orders, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.DYNAMIC },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDERS_GET", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.DYNAMIC },
    });
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

    // Limit batch size for deletions
    if (ids.length > 100) {
      throw ErrorFactory.InvalidRequest(
        "No se pueden eliminar más de 100 órdenes a la vez",
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
          coupon: true,
          orderItems: true,
        },
      });

      if (orders.length !== ids.length) {
        throw ErrorFactory.NotFound(
          "Algunas órdenes no se han encontrado en esta tienda",
        );
      }

      // Restock products for paid orders before deletion
      const paidOrders = orders.filter(
        (order) => order.status === OrderStatus.PAID,
      );
      if (paidOrders.length > 0) {
        const stockUpdates: {
          productId: string;
          quantity: number;
        }[] = [];

        paidOrders.forEach((order) => {
          order.orderItems.forEach((item) => {
            stockUpdates.push({
              productId: item.productId,
              quantity: -item.quantity, // Negative for increment
            });
          });
        });

        if (stockUpdates.length > 0) {
          const stockResult = await batchUpdateProductStockResilient(
            tx,
            stockUpdates,
            true,
          );

          // Log any stock update failures but don't throw errors
          if (stockResult.failed.length > 0) {
            console.warn(
              "Some stock restock failed during batch order deletion:",
              {
                orderIds: paidOrders.map((o) => o.id),
                failed: stockResult.failed,
                success: stockResult.success,
              },
            );
          }
        }
      }

      // Batch disconnect coupons
      const ordersWithCoupons = orders.filter((order) => order.coupon);
      if (ordersWithCoupons.length > 0) {
        await tx.order.updateMany({
          where: {
            id: {
              in: ordersWithCoupons.map((order) => order.id),
            },
          },
          data: {
            couponId: null,
            couponDiscount: 0,
          },
        });
      }

      return await tx.order.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json(result, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDERS_DELETE", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
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

    const result = await prismadb.$transaction(async (tx) => {
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

      // Collect all stock updates to batch them
      const stockUpdates: {
        productId: string;
        quantity: number;
      }[] = [];

      // CRITICAL FIX: First validate stock for orders becoming PAID
      if (status === OrderStatus.PAID) {
        const ordersBecomingPaid = orders.filter(
          (order) => order.status !== OrderStatus.PAID,
        );
        if (ordersBecomingPaid.length > 0) {
          const stockValidationUpdates: {
            productId: string;
            quantity: number;
          }[] = [];
          ordersBecomingPaid.forEach((order) => {
            order.orderItems.forEach((item) => {
              stockValidationUpdates.push({
                productId: item.productId,
                quantity: item.quantity,
              });
            });
          });

          if (stockValidationUpdates.length > 0) {
            // Validate stock availability first
            await batchUpdateProductStock(tx, stockValidationUpdates, true);
            // Revert validation
            const revertUpdates = stockValidationUpdates.map(
              ({ productId, quantity }) => ({
                productId,
                quantity: -quantity,
              }),
            );
            await batchUpdateProductStock(tx, revertUpdates, false);
          }
        }
      }

      // Process all orders and collect stock updates
      for (const order of orders) {
        if (status) {
          const wasPaid = order.status === OrderStatus.PAID;
          const willBePaid = status === OrderStatus.PAID;

          if (willBePaid && !wasPaid) {
            // Will be paid - decrement stock (positive quantity)
            order.orderItems.forEach((item) => {
              stockUpdates.push({
                productId: item.productId,
                quantity: item.quantity, // Positive for decrement
              });
            });
          } else if (!willBePaid && wasPaid) {
            // Was paid, now unpaid - increment stock (negative quantity)
            order.orderItems.forEach((item) => {
              stockUpdates.push({
                productId: item.productId,
                quantity: -item.quantity, // Negative for increment
              });
            });
          }
        }
      }

      // Batch execute stock updates using resilient method
      if (stockUpdates.length > 0) {
        const stockResult = await batchUpdateProductStockResilient(
          tx,
          stockUpdates,
          true,
        );

        // Log stock update results but don't throw errors
        if (stockResult.failed.length > 0) {
          console.warn("Some stock updates failed in batch order update:", {
            orderIds: orders.map((o) => o.id),
            failed: stockResult.failed,
            success: stockResult.success,
          });
        }
      }

      // Update orders
      const updatePromises = orders.map(async (order) => {
        const updateData: {
          status?: OrderStatus;
          shipping?: { update: { status?: ShippingStatus } };
        } = {};

        if (status) {
          updateData.status = status;
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
            orderItems: {
              include: {
                product: true,
              },
            },
            shipping: true,
            payment: true,
          },
        });
      });

      return Promise.all(updatePromises);
    });

    // Send email notifications asynchronously
    setImmediate(async () => {
      try {
        const emailPromises = result.map(async (order) => {
          if (status) {
            await sendOrderEmail(
              {
                ...order,
                payment: order.payment?.method ?? null,
              },
              status,
              {
                notifyAdmin: false,
              },
            );
          }

          if (shipping) {
            await sendOrderEmail(
              {
                ...order,
                payment: order.payment?.method ?? null,
              },
              shipping,
              {
                notifyAdmin: false,
              },
            );
          }
        });

        await Promise.allSettled(emailPromises);
      } catch (emailError) {
        console.error("Failed to send order emails:", emailError);
      }
    });

    return NextResponse.json(result, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDERS_PATCH", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
