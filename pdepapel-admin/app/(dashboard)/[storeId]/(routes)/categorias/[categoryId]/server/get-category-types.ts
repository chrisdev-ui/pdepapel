"use server";

import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import prismadb from "@/lib/prismadb";

export async function getCategoryTypes(storeId: string, categoryId: string) {
  const category = await prismadb.category.findUnique({
    where: {
      id: categoryId,
    },
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
