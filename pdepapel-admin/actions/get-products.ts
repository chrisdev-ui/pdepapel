import prismadb from "@/lib/prismadb";
import { formatter } from "@/lib/utils";

export async function getProducts(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId: storeId,
    },
    include: {
      category: true,
    },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    stock: String(product.stock),
    price: formatter.format(product.price),
    category: product.category.name,
  }));
}
