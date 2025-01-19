import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const getOutOfStockCount = async (storeId: string) => {
  const outOfStockCount = await prismadb.product.count({
    where: {
      storeId,
      stock: 0,
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
    },
  });

  return outOfStockCount;
};

export const getOutOfStock = async (storeId: string) => {
  const products = await prismadb.product.findMany({
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

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category.name,
    image:
      product.images.find((image) => image.isMain)?.url ??
      product.images[0].url,
    isArchived: product.isArchived,
    updatedAt: format(product.updatedAt, "dd 'de' MMMM 'de' yyyy hh:mm", {
      locale: es,
    }),
  }));
};
