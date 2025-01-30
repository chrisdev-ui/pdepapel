import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export const getOutOfStockCount = async (storeId: string) => {
  return await prismadb.product.count({
    where: {
      storeId,
      stock: 0,
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
    },
  });
};

export const getOutOfStock = async (storeId: string) => {
  return await prismadb.product.findMany({
    where: {
      storeId,
      stock: 0,
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
    },
    select: {
      id: true,
      name: true,
      categoryId: true,
      category: {
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
      isArchived: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
};
