import prismadb from "@/lib/prismadb";

export async function getTotalCost(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId,
      isArchived: false,
    },
    select: {
      stock: true,
      acqPrice: true,
    },
  });

  const totalCost = products.reduce(
    (sum, product) => sum + product.stock * (product.acqPrice || 0),
    0,
  );

  return totalCost;
}
