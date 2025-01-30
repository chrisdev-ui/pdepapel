import { CAPSULAS_SORPRESA_ID, KITS_ID, TRESHOLD_LOW_STOCK } from "@/constants";
import prismadb from "@/lib/prismadb";

export const getLowStockCount = async (
  storeId: string,
  treshold: number = TRESHOLD_LOW_STOCK,
) => {
  return await prismadb.product.count({
    where: {
      storeId,
      stock: {
        gt: 0,
        lte: treshold,
      },
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
    },
  });
};

export const getLowStock = async (
  storeId: string,
  treshold: number = TRESHOLD_LOW_STOCK,
) => {
  return await prismadb.product.findMany({
    where: {
      storeId,
      stock: {
        gt: 0,
        lte: treshold,
      },
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
    },
    select: {
      id: true,
      name: true,
      stock: true,
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
      isFeatured: true,
      isArchived: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
};
