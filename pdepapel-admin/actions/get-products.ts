import { requireStoreOwner } from "@/lib/store-access";
import { EXCLUDE_BUNDLE_PRODUCTS } from "@/lib/catalog-filters";
import prismadb from "@/lib/prismadb";

export async function getProducts(storeId: string) {
  await requireStoreOwner(storeId);
  return await prismadb.product.findMany({
    where: {
      storeId: storeId,
      ...EXCLUDE_BUNDLE_PRODUCTS,
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
