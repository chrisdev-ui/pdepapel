import prismadb from "@/lib/prismadb";
import { clerkClient } from "@clerk/nextjs";
import { ErrorFactory } from "./api-errors";
import { BATCH_SIZE } from "@/constants";
import { Prisma, PrismaClient } from "@prisma/client";

export async function getLastOrderTimestamp(
  userId: string | null | undefined,
  guestId: string | null | undefined,
  storeId: string,
) {
  if (!userId && !guestId && !storeId) return null;
  const lastOrder = await prismadb.order.findFirst({
    where: { OR: [{ userId }, { guestId }], storeId },
    orderBy: { createdAt: "desc" },
  });

  return lastOrder?.createdAt;
}

export async function checkIfStoreOwner(
  userId: string | null,
  storeId: string,
) {
  if (!userId) return false;
  const storeByUserId = await prismadb.store.findFirst({
    where: {
      id: storeId,
      userId,
    },
  });
  return !!storeByUserId;
}

export async function verifyStoreOwner(userId: string, storeId: string) {
  const isStoreOwner = await checkIfStoreOwner(userId, storeId);
  if (!isStoreOwner) throw ErrorFactory.Unauthorized();
}

export async function getClerkUserById(
  userId: string | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const user = await clerkClient.users.getUser(userId);
  return user ? user.id : null;
}

export async function processOrderItemsInBatches(
  orderItems: any[],
  storeId: string,
  batchSize: number = BATCH_SIZE,
) {
  const batches = [];
  for (let i = 0; i < orderItems.length; i += batchSize) {
    batches.push(orderItems.slice(i, i + batchSize));
  }

  const allProducts = [];
  for (const batch of batches) {
    const products = await prismadb.product.findMany({
      where: {
        id: {
          in: batch.map((item: any) => item.productId),
        },
        storeId: storeId,
      },
      select: {
        id: true,
        price: true,
        stock: true,
        name: true,
        categoryId: true,
        productGroupId: true,
      },
    });
    allProducts.push(...products);
  }

  return allProducts;
}

export async function batchUpdateProductStock(
  tx: any,
  stockUpdates: { productId: string; quantity: number }[],
  validateStock: boolean = true,
) {
  if (stockUpdates.length === 0) return;

  // Group updates by product to handle multiple items of same product
  const groupedUpdates = stockUpdates.reduce(
    (acc, update) => {
      if (acc[update.productId]) {
        acc[update.productId] += update.quantity;
      } else {
        acc[update.productId] = update.quantity;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  // If validation is enabled and we have decrements, check stock availability first
  if (validateStock) {
    const productIds = Object.keys(groupedUpdates).filter(
      (productId) => groupedUpdates[productId] > 0,
    );

    if (productIds.length > 0) {
      const products = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
        select: {
          id: true,
          name: true,
          stock: true,
        },
      });

      // Check for insufficient stock
      for (const product of products) {
        const decrementAmount = groupedUpdates[product.id];
        if (decrementAmount > 0 && product.stock < decrementAmount) {
          throw new Error(
            `Insufficient stock for product "${product.name}". Available: ${product.stock}, Required: ${decrementAmount}`,
          );
        }
      }
    }
  }

  // Execute all stock updates in parallel
  const updatePromises = Object.entries(groupedUpdates)
    .map(([productId, quantity]) => {
      if (quantity > 0) {
        // Positive quantity means decrement
        return tx.product.update({
          where: { id: productId },
          data: {
            stock: {
              decrement: quantity,
            },
          },
        });
      } else if (quantity < 0) {
        // Negative quantity means increment
        return tx.product.update({
          where: { id: productId },
          data: {
            stock: {
              increment: Math.abs(quantity),
            },
          },
        });
      }
      // If quantity is 0, no update needed
      return Promise.resolve();
    })
    .filter(Boolean);

  await Promise.all(updatePromises);
}

export async function batchUpdateProductStockResilient(
  tx: any,
  stockUpdates: { productId: string; quantity: number }[],
  allowPartialFailures: boolean = true,
) {
  if (stockUpdates.length === 0) return { success: [], failed: [] };

  // Group updates by product to handle multiple items of same product
  const groupedUpdates = stockUpdates.reduce(
    (acc, update) => {
      if (acc[update.productId]) {
        acc[update.productId] += update.quantity;
      } else {
        acc[update.productId] = update.quantity;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  // Get current stock levels for all products
  const productIds = Object.keys(groupedUpdates);
  const products = await tx.product.findMany({
    where: {
      id: {
        in: productIds,
      },
    },
    select: {
      id: true,
      name: true,
      stock: true,
    },
  });

  const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));
  const successfulUpdates: Array<{
    productId: string;
    quantity: number;
    productName: string;
  }> = [];
  const failedUpdates: Array<{
    productId: string;
    quantity: number;
    productName: string;
    reason: string;
  }> = [];

  // Process each update individually to handle partial failures
  for (const [productId, quantity] of Object.entries(groupedUpdates)) {
    const product = productMap.get(productId);

    if (!product) {
      failedUpdates.push({
        productId,
        quantity,
        productName: "Producto desconocido",
        reason: "Producto no encontrado",
      });
      continue;
    }

    try {
      if (quantity > 0) {
        // Decrement stock - STRICT CHECK: Never do partial updates for decrements
        if (product.stock < quantity) {
          // NEVER decrement if insufficient stock - fail completely
          failedUpdates.push({
            productId,
            quantity,
            productName: product.name,
            reason: `Stock insuficiente. Stock actual: ${product.stock}, Requerido: ${quantity}`,
          });
        } else {
          // Only decrement if we have sufficient stock
          await tx.product.update({
            where: { id: productId },
            data: {
              stock: {
                decrement: quantity,
              },
            },
          });
          successfulUpdates.push({
            productId,
            quantity,
            productName: product.name,
          });
        }
      } else if (quantity < 0) {
        // Increment stock - this should never fail
        await tx.product.update({
          where: { id: productId },
          data: {
            stock: {
              increment: Math.abs(quantity),
            },
          },
        });
        successfulUpdates.push({
          productId,
          quantity: Math.abs(quantity),
          productName: product.name,
        });
      }
    } catch (error) {
      failedUpdates.push({
        productId,
        quantity,
        productName: product.name,
        reason: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return {
    success: successfulUpdates,
    failed: failedUpdates,
  };
}
