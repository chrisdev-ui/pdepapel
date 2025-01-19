import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import prismadb from "@/lib/prismadb";
import { currencyFormatter } from "@/lib/utils";

export async function getProducts(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId: storeId,
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
    },
    include: {
      category: true,
    },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    stock: String(product.stock),
    price: currencyFormatter.format(product.price),
    category: product.category.name,
  }));
}
