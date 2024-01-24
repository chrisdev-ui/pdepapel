import prismadb from "@/lib/prismadb";
import { BillboardsBody } from "@/lib/types";
import { Billboard } from "@prisma/client";

/**
 * Creates a billboard with the specified data.
 * @param data - The data for the billboard and the store ID.
 * @returns A promise that resolves to the created billboard.
 */
export async function createNewBillboard(
  data: BillboardsBody & { storeId: string },
): Promise<Billboard> {
  return await prismadb.billboard.create({
    data,
  });
}

/**
 * Retrieves billboards by store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of billboards.
 */
export async function getBillboardsByStoreId(storeId: string) {
  return await prismadb.billboard.findMany({
    where: { storeId },
  });
}

/**
 * Retrieves a billboard by ID.
 * @param billboardId - The ID of the billboard.
 * @returns A promise that resolves to a billboard.
 */
export async function getBillboardById(billboardId: string) {
  return await prismadb.billboard.findUnique({
    where: { id: billboardId },
  });
}

/**
 * Updates a billboard with the specified data.
 * @param billboardId - The ID of the billboard.
 * @param data - The data for the billboard.
 * @returns A promise that resolves to the updated billboard.
 */
export async function updateBillboardById(
  billboardId: string,
  data: BillboardsBody,
) {
  return await prismadb.billboard.update({
    where: { id: billboardId },
    data,
  });
}

/**
 * Deletes a billboard with the specified ID.
 * @param billboardId - The ID of the billboard to delete.
 * @returns A promise that resolves to void.
 */
export async function deleteBillboardById(billboardId: string): Promise<void> {
  await prismadb.billboard.delete({
    where: { id: billboardId },
  });
}
