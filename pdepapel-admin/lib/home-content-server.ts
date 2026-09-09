import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";

export async function assertProductsBelongToStore(storeId: string, productIds: string[]) {
  if (productIds.length === 0) return;
  const count = await prismadb.product.count({ where: { storeId, id: { in: productIds } } });
  if (count !== productIds.length) {
    throw ErrorFactory.InvalidRequest("Alguno de los productos elegidos no pertenece a esta tienda");
  }
}
