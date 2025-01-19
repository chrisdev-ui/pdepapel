import { CAPSULAS_SORPRESA_ID, KITS_ID, TRESHOLD_LOW_STOCK } from "@/constants";
import prismadb from "@/lib/prismadb";
import { numberFormatter } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const getLowStockCount = async (
  storeId: string,
  treshold: number = TRESHOLD_LOW_STOCK,
) => {
  const lowStockCount = await prismadb.product.count({
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

  return lowStockCount;
};

export const getLowStock = async (
  storeId: string,
  treshold: number = TRESHOLD_LOW_STOCK,
) => {
  const products = await prismadb.product.findMany({
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

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    stock: numberFormatter.format(product.stock),
    category: product.category.name,
    image:
      product.images.find((image) => image.isMain)?.url ??
      product.images[0].url,
    isFeatured: product.isFeatured,
    isArchived: product.isArchived,
    lastUpdated: format(product.updatedAt, "dd 'de' MMMM 'de' yyyy hh:mm", {
      locale: es,
    }),
  }));
};
