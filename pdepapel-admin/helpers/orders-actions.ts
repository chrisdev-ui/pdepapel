import { MINIMUM_TIME_BETWEEN_ORDERS_IN_MINUTES } from "@/constants";
import prismadb from "@/lib/prismadb";
import { OrderBody } from "@/lib/types";
import { generateOrderNumber } from "@/lib/utils";
import { DiscountType, OrderStatus } from "@prisma/client";
import { differenceInMinutes } from "date-fns";
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

    // 4. Create Order Items in the database
    for (const { productId, variantId, quantity = 1 } of orderItems) {
      let newQuantity = quantity;
      const product = products.find((p) => p.id === productId);
      const variant = product?.variants.find((v) => v.id === variantId);
      let updateData;

      if (!product || !variant) {
        throw new Error("Product or variant not found");
      }

      // 4.1 Calculate new quantity if discount is active
      if (
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
          updateData = {
            stock: {
              decrement: newQuantity,
            },
            inventory: {
              update: {
                quantity: {
                  decrement: newQuantity,
                },
              },
            },
          };
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