import prismadb from "@/lib/prismadb";

export async function getProducts(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId: storeId,
    },
    include: {
      category: true,
    },
  });

  return products;
}
