import prismadb from "@/lib/prismadb";
import { StoreBody } from "@/lib/types";
import { Store } from "@prisma/client";

/**
 * Creates a new store.
 * @param data - The store data to be created.
 * @returns A promise that resolves to the created store.
 */
export async function createNewStore(
  data: StoreBody & { userId: string },
): Promise<Store> {
  return await prismadb.store.create({
    data,
  });
}

/**
 * Updates a store by its ID.
 * @param storeId - The ID of the store to update.
 * @param data - The updated store data.
 * @returns A promise that resolves to the updated store.
 */
export async function updateStoreById(
  storeId: string,
  data: StoreBody,
): Promise<Store> {
  return await prismadb.store.update({
    where: { id: storeId },
    data,
  });
}

/**
 * Deletes a store by its ID.
 * @param storeId The ID of the store to delete.
 * @returns A Promise that resolves when the store is successfully deleted.
 */
export async function deleteStoreById(storeId: string): Promise<void> {
  await prismadb.store.delete({
    where: { id: storeId },
  });
}
