"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";

/** Categorías (modelo `Type`) de una tienda para las tablas del centro de Atributos. */
export async function getTypes(storeId: string) {
  await requireStoreRead(storeId);
  const rows = await prismadb.type.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      iconSvg: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      archivedAt: true,
      _count: { select: { categories: true } },
      categories: { select: { isArchived: true, _count: { select: { products: true } } } },
    },
    orderBy: { name: "asc" },
  });
  // La lista muestra cuántos productos cuelgan de la categoría (todas sus subcategorías).
  return rows.map(({ categories, ...row }) => ({
    ...row,
    productsCount: categories.reduce((sum, category) => sum + category._count.products, 0),
    activeCategoriesCount: categories.filter((category) => !category.isArchived).length,
  }));
}
