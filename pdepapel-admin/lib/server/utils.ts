import "server-only";

import { BATCH_SIZE } from "@/constants";
import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import type { Prisma } from "@prisma/client";

/**
 * La parte de `lib/utils.ts` que consulta la base. Vive aparte para que `cn()`
 * y los formatos, que importa casi todo componente de cliente, no arrastren
 * Prisma al navegador (regresión 2026-10-25, F-4).
 */

/**
 * Último pedido de QUIEN está comprando, para el freno de «una orden cada
 * pocos minutos».
 *
 * El `OR` se arma solo con los identificadores que existen: `{ userId: null }`
 * casa con TODOS los pedidos de invitadas, así que una compra bloqueaba a
 * todas las demás invitadas de la tienda. Sin identificador no hay a quién
 * frenar y se devuelve null.
 */
export async function getLastOrderTimestamp(
  userId: string | null | undefined,
  guestId: string | null | undefined,
  storeId: string,
) {
  if (!storeId) return null;

  const actor: Prisma.OrderWhereInput[] = [];
  if (userId) actor.push({ userId });
  if (guestId) actor.push({ guestId });
  if (actor.length === 0) return null;

  const lastOrder = await prismadb.order.findFirst({
    where: { OR: actor, storeId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
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
        sku: true,
        images: {
          select: {
            url: true,
          },
          take: 1,
        },
        categoryId: true,
        productGroupId: true,
      },
    });
    allProducts.push(...products);
  }

  return allProducts;
}
