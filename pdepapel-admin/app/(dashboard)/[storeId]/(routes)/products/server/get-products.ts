"use server";

import prismadb from "@/lib/prismadb";

export async function getProducts(storeId: string) {
  return await prismadb.product.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      sku: true,
      name: true,
      description: true,
      stock: true,
      price: true,
      category: {
        select: {
          name: true,
        },
      },
      size: {
        select: {
          name: true,
        },
      },
      color: {
        select: {
          value: true,
        },
      },
      design: {
        select: {
          name: true,
        },
      },
      images: {
        select: {
          url: true,
          isMain: true,
        },
      },
      acqPrice: true,
      isFeatured: true,
      isArchived: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
