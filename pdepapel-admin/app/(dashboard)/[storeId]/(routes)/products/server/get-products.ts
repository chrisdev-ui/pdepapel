"use server";

import prismadb from "@/lib/prismadb";

export async function getProducts(storeId: string) {
  return await prismadb.product.findMany({
    where: {
      storeId,
      isArchived: false,
    },
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      stock: true,
      images: {
        select: {
          url: true,
          isMain: true,
        },
        take: 1,
        orderBy: {
          isMain: "desc",
        },
      },
      category: {
        select: {
          name: true,
        },
      },
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
