"use server";

import prismadb from "@/lib/prismadb";

export async function getCategoryTypes(storeId: string, categoryId: string) {
  return {
    category: await prismadb.category.findUnique({
      where: {
        id: categoryId,
      },
    }),
    types: await prismadb.type.findMany({
      where: {
        storeId,
      },
    }),
  };
}
