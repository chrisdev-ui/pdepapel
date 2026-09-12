"use server";

import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import prismadb from "@/lib/prismadb";

/**
 * Subcategoría para el formulario de edición (`null` si no existe o es de otra
 * tienda) y las categorías que puede elegir.
 */
export async function getCategoryTypes(storeId: string, categoryId: string) {
  const category = await prismadb.category.findFirst({
    where: { id: categoryId, storeId },
  });
  return {
    category,
    // Solo categorías activas, más la que la subcategoría ya tiene aunque esté archivada.
    types: await prismadb.type.findMany({
      where: {
        storeId,
        OR: [ACTIVE_ATTRIBUTE_WHERE, ...(category?.typeId ? [{ id: category.typeId }] : [])],
      },
    }),
  };
}
