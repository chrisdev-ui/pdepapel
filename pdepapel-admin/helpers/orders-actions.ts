import { MINIMUM_TIME_BETWEEN_ORDERS_IN_MINUTES } from "@/constants";
import prismadb from "@/lib/prismadb";
import { OrderBody, OrderWithItems } from "@/lib/types";
import { generateOrderNumber } from "@/lib/utils";
import { DiscountType, OrderStatus } from "@prisma/client";
import { differenceInMinutes } from "date-fns";
import { getUserId, isUserAuthorized } from "./auth";
import {
  calculateDiscountQuantity,
  isValidDiscount,
} from "./discounts-actions";
import { fetchProductsAndVariants } from "./product-actions";

/**
 * Checks if a user is authorized to create a new order based on the time elapsed since their last order.
 * @param authenticatedUserId - The ID of the authenticated user.
 * @param storeId - The ID of the store.
 * @returns A boolean indicating whether the user is authorized to create a new order.
 */
export async function isUserAuthorizedToCreateNewOrder(
  authenticatedUserId: string,
  storeId: string,
): Promise<boolean> {
  const lastOrderTimestamp = await getLastOrderTimestamp(
    authenticatedUserId,
    storeId,
  );

  if (lastOrderTimestamp) {
    const minutesSinceLastOrder = differenceInMinutes(
      Date.now(),
      lastOrderTimestamp,
    );
    return minutesSinceLastOrder > MINIMUM_TIME_BETWEEN_ORDERS_IN_MINUTES;
  }

  return true;
}

/**
 * Retrieves the timestamp of the last order made by a user in a specific store.
 * @param authenticatedUserId - The ID of the authenticated user.
 * @param storeId - The ID of the store.
 * @returns The timestamp of the last order made by the user in the specified store.
 */
export async function getLastOrderTimestamp(
  authenticatedUserId: string,
  storeId: string,
): Promise<Date | null> {
  // Check if both authenticatedUserId and storeId are truthy
  if (!authenticatedUserId || !storeId) {
    return null;
  }

  // Query the database to find the last order made by the user
  const lastOrder = await prismadb.order.findFirst({
    where: {
      OR: [{ userId: authenticatedUserId }, { guestId: authenticatedUserId }],
      storeId,
    },
    orderBy: { createdAt: "desc" },
  });

  // Return the creation timestamp of the last order found, if any
  return lastOrder?.createdAt || null;
}

/**
 * Creates a new order in the database.
 *
 * @param data - The order data including storeId.
 * @returns The created order.
 * @throws Error if product or variant is not found, stock would be negative after order, or there is insufficient stock.
 */
export async function createOrder(data: OrderBody & { storeId: string }) {
  const { orderItems, payment, shipping, ...otherData } = data;
  const orderNumber = generateOrderNumber();
  const products = await fetchProductsAndVariants(orderItems);

  return prismadb.$transaction(async (tx) => {
    // 1. Create a new order in the database
    const order = await tx.order.create({
      data: {
        ...otherData,
        orderNumber,
        orderItems: {
          create: orderItems.map((orderItem) => ({
            product: { connect: { id: orderItem.productId } },
            variant: { connect: { id: orderItem.variantId } },
            quantity: orderItem.quantity ?? 1,
            discountApplied: orderItem.discountApplied,
          })),
        },
      },
      include: {
        orderItems: {
          include: {
            product: true,
            variant: {
              include: {
                discount: true,
              },
            },
          },
        },
        payment: true,
        coupon: true,
      },
    });

    // 2. Create a new payment in the database
    if (payment) {
      await tx.paymentDetails.create({
        data: {
          ...payment,
          orderId: order.id,
          storeId: data.storeId,
        },
      });
    }

    // 3. Create a new shipping in the database
    if (shipping) {
      await tx.shipping.create({
        data: {
          ...shipping,
          orderId: order.id,
          storeId: data.storeId,
        },
      });
    }

    // 4. Update stock and inventory
    for (const {
      id,
      productId,
      variantId,
      quantity = 1,
      discountApplied,
    } of order.orderItems) {
      let newQuantity = quantity;
      const product = products.find((p) => p.id === productId);
      const variant = product?.variants.find((v) => v.id === variantId);
      let updateData;

      if (!product || !variant) {
        throw new Error("Product or variant not found");
      }

      // 4.1 Calculate new quantity if discount is active
      if (
        !discountApplied &&
        variant.discount &&
        variant.discount.type === DiscountType.BUY_X_GET_Y &&
        isValidDiscount(variant.discount.startDate, variant.discount.endDate)
      ) {
        const { x, y } = variant.discount;
        newQuantity = calculateDiscountQuantity(
          x as number,
          y as number,
          quantity,
        );
        await tx.orderItem.update({
          where: { id },
          data: {
            quantity: newQuantity,
            discountApplied: true,
          },
        });
      }

      if (
        (variant.inventory?.quantity || 0) + (variant.inventory?.onHold || 0) <
        newQuantity
      ) {
        throw new Error("Stock would be negative after order");
      }

      // 4.2 Update product stock
      const updatedProduct = await tx.product.update({
        where: { id: product.id },
        data: {
          stock: {
            decrement: newQuantity,
          },
        },
      });

      switch (order.status) {
        case OrderStatus.PAID: {
          updateData = {
            stock: {
              decrement: newQuantity,
            },
            inventory: {
              update: {
                quantity: {
                  decrement: newQuantity,
                },
                sold: {
                  increment: newQuantity,
                },
                onHold: {
                  decrement: newQuantity,
                },
              },
            },
          };
          break;
        }

        case OrderStatus.PENDING:
        case OrderStatus.CREATED: {
          updateData = {
            inventory: {
              update: {
                quantity: {
                  decrement: newQuantity,
                },
                onHold: {
                  increment: newQuantity,
                },
              },
            },
          };
          break;
        }

        case OrderStatus.CANCELLED: {
          updateData = {
            inventory: {
              update: {
                onHold: {
                  decrement: newQuantity,
                },
                quantity: {
                  increment: newQuantity,
                },
              },
            },
          };
          break;
        }
        default: {
          updateData = {};
          break;
        }
      }

      // 4.3 Update variant stock and inventory
      const updatedVariant = await tx.productVariant.update({
        where: { id: variant.id },
        data: updateData,
        include: {
          inventory: true,
        },
      });

      if (
        (updatedVariant.inventory?.quantity &&
          updatedVariant.inventory.quantity < 0) ||
        updatedVariant.stock < 0 ||
        updatedProduct.stock < 0
      ) {
        throw new Error("Insufficient stock");
      }
    }

    return order;
  });
}

/**
 * Deletes an order by its ID.
 *
 * @param {string} orderId - The ID of the order to delete.
 * @param {string} storeId - The ID of the store the order belongs to.
 * @returns {Promise<void>} - A promise that resolves when the order is deleted.
 */
export async function deleteOrderById(
  orderId: string,
  storeId: string,
): Promise<void> {
  await prismadb.order.delete({
    where: {
      id: orderId,
      storeId,
    },
  });
}

/**
 * Retrieves orders from the database based on the store ID.
 * @param storeId - The ID of the store for which to retrieve orders.
 * @param userId - The ID of the user for whom to retrieve orders. Optional.
 * @param guestId - The ID of the guest for whom to retrieve orders. Optional.
 * @returns An array of orders with their associated order items, payment, and shipping information.
 */
export async function getOrdersByStoreId(
  storeId: string,
  userId: string | null,
  guestId: string | null,
) {
  const authUserId = getUserId();
  const isStoreOwner = await isUserAuthorized(authUserId as string, storeId);

  const whereClause: { storeId: string; userId?: string; guestId?: string } = {
    storeId,
  };

  if (!isStoreOwner) {
    if (userId) {
      whereClause.userId = userId;
    } else if (guestId) {
      whereClause.guestId = guestId;
    } else {
      return [];
    }
  }

  const orders = await prismadb.order.findMany({
    where: whereClause,
    include: {
      orderItems: {
        include: {
          product: true,
          variant: true,
        },
      },
      payment: true,
      shipping: true,
    },
  });

  return orders;
}

/**
 * Retrieves an order by its ID.
 *
 * @param orderId - The ID of the order to retrieve.
 * @returns The order object, including its order items, payment details, and shipping information.
 */
export async function getOrderById(orderId: string) {
  const order = await prismadb.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      orderItems: {
        include: {
          product: {
            include: {
              images: true,
            },
          },
          variant: {
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

  return order;
}

/**
 * Retrieves an order with its associated items, payment details, and shipping information.
 *
 * @param orderId - The ID of the order to retrieve.
 * @returns A Promise that resolves to the order with items, payment details, and shipping information, or null if the order is not found.
 */
export async function getOrder(
  orderId: string,
): Promise<OrderWithItems | null> {
  return await prismadb.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      orderItems: {
        include: {
          product: true,
          variant: {
            include: {
              discount: true,
            },
          },
        },
      },
      payment: true,
      shipping: true,
    },
  });
}

/**
 * Updates an order with the specified orderId and storeId.
 *
 * @param {string} orderId - The ID of the order to be updated.
 * @param {string} storeId - The ID of the store associated with the order.
 * @param {Partial<OrderBody>} data - The partial data to update the order with.
 * @returns {Promise<OrderWithItems | null>} - A promise that resolves to the updated order with items, or null if the order does not exist.
 */
export async function updateOrder(
  orderId: string,
  storeId: string,
  data: Partial<OrderBody>,
): Promise<OrderWithItems | null> {
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
  } = data;

  return await prismadb.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({
      where: { orderId },
    });

    return await tx.order.update({
      where: { id: orderId },
      data: {
        fullName,
        phone,
        address,
        userId,
        guestId,
        orderItems: {
          create: orderItems?.map((orderItem) => ({
            product: { connect: { id: orderItem.productId } },
            variant: { connect: { id: orderItem.variantId } },
            quantity: orderItem.quantity ?? 1,
            discountApplied: orderItem.discountApplied,
          })),
        },
        ...(status && { status }),
        payment: payment
          ? {
              upsert: {
                create: {
                  ...payment,
                  store: { connect: { id: storeId } },
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
                  store: { connect: { id: storeId } },
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
            variant: {
              include: {
                discount: true,
              },
            },
          },
        },
        payment: true,
        shipping: true,
      },
    });
  });
}
