import prismadb from "@/lib/prismadb";
import { SizeBody } from "@/lib/types";

/**
 * Creates a new size with the provided data.
 * @param data The size data to be created.
 * @param storeId The ID of the store.
 * @returns A promise that resolves to the created size.
 */
export async function createNewSize(data: SizeBody & { storeId: string }) {
  return await prismadb.size.create({
    data,
  });
}

/**
 * Gets all sizes of the store.
 * @param storeId The ID of the store.
 * @returns A promise that resolves to the sizes.
 */
export async function getSizesByStoreId(storeId: string) {
  return await prismadb.size.findMany({
    where: { storeId },
  });
}

/**
 * Gets a size by its ID.
 * @param sizeId The ID of the size.
 * @returns A promise that resolves to the size.
 */
export async function getSizeById(sizeId: string) {
  return await prismadb.size.findUnique({
    where: { id: sizeId },
  });
}

/**
 * Updates a size by its ID.
 * @param sizeId The ID of the size.
 * @param data The data to be updated.
 * @returns A promise that resolves to the updated size.
 */
export async function updateSizeById(sizeId: string, data: SizeBody) {
  return await prismadb.size.update({
    where: { id: sizeId },
    data,
  });
}

/**
 * Deletes a size by its ID.
 * @param sizeId - The ID of the size to delete.
 * @returns A promise that resolves when the size is deleted.
 */
export async function deleteSizeById(sizeId: string): Promise<void> {
  await prismadb.size.delete({
    where: { id: sizeId },
  });
}
