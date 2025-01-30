"use server";

import prismadb from "@/lib/prismadb";

export async function getCategories(storeId: string) {
  return await prismadb.category.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      type: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          products: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
