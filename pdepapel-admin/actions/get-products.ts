import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export async function getProducts(storeId: string) {
  return await prismadb.product.findMany({
    where: {
      storeId: storeId,
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
      stock: {
        gt: 0,
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      stock: true,
      price: true,
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
