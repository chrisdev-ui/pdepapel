"use server";

import { CAPSULAS_SORPRESA_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export async function getInventory(storeId: string) {
  const products = await prismadb.product.findMany({
    where: { storeId, isArchived: false, categoryId: { not: CAPSULAS_SORPRESA_ID } },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      price: true,
      acqPrice: true,
      isKit: true,
      updatedAt: true,
      category: { select: { name: true } },
      supplier: { select: { id: true, name: true } },
      images: { select: { url: true, isMain: true }, take: 1, orderBy: { isMain: "desc" } },
      kitComponents: { select: { quantity: true, component: { select: { stock: true } } } },
      inventoryMovements: { select: { createdAt: true, type: true, quantity: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { stock: "asc" },
  });

  return products.map((product) => {
    let stock = product.stock;
    if (product.isKit && product.kitComponents.length > 0) {
      stock = Math.max(0, Math.min(...product.kitComponents.map((c) => (c.quantity > 0 ? Math.floor(c.component.stock / c.quantity) : 0))));
    }
    const last = product.inventoryMovements[0] ?? null;
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      stock,
      price: product.price,
      acqPrice: product.acqPrice,
      isKit: product.isKit,
      updatedAt: product.updatedAt,
      categoryName: product.category?.name ?? null,
      supplier: product.supplier,
      image: product.images[0]?.url ?? null,
      lastMovement: last ? { at: last.createdAt, type: last.type, quantity: last.quantity } : null,
    };
  });
}

export type InventoryRow = Awaited<ReturnType<typeof getInventory>>[number];
