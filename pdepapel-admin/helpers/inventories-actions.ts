import prismadb from "@/lib/prismadb";
import { InventoryBody } from "@/lib/types";
import { Inventory } from "@prisma/client";

/**
 * Creates a new inventory.
 * @param data - The inventory data along with the store ID.
 * @returns A PrismaPromise that resolves to the created inventory.
 */
export function createInventory(data: InventoryBody & { storeId: string }) {
  return prismadb.inventory.create({ data });
}

/**
 * Creates a new inventory.
 * @param data - The inventory data along with the store ID.
 * @returns A promise that resolves to the created inventory.
 */
export async function createNewInventory(
  data: InventoryBody & { storeId: string },
): Promise<Inventory> {
  return await createInventory(data);
}

/**
 * Retrieves inventories by store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of inventories.
 */
export async function getInventoriesByStoreId(storeId: string) {
  return await prismadb.inventory.findMany({ where: { storeId } });
}

/**
 * Retrieves an inventory by ID.
 * @param inventoryId - The ID of the inventory.
 * @returns A promise that resolves to an inventory.
 */
export async function getInventoryById(inventoryId: string) {
  return await prismadb.inventory.findUnique({ where: { id: inventoryId } });
}

/**
 * Updates the inventory with the specified inventoryId using the provided data.
 * @param inventoryId - The ID of the inventory to update.
 * @param data - The updated inventory data.
 * @returns A prisma promise that resolves to the updated inventory.
 */
export function updateInventoryByIid(inventoryId: string, data: InventoryBody) {
  return prismadb.inventory.update({ where: { id: inventoryId }, data });
}

/**
 * Updates the inventory by variant ID.
 *
 * @param variantId - The ID of the variant.
 * @param data - The inventory data to update.
 * @returns A promise that resolves to the updated inventory.
 */
export function updateInventoryByVariantId(
  variantId: string,
  data: Omit<InventoryBody, "variantId">,
) {
  return prismadb.inventory.update({ where: { variantId }, data });
}

/**
 * Updates an inventory with the provided data.
 * @param inventoryId - The ID of the inventory.
 * @param data - The data for the inventory.
 * @returns A promise that resolves to the updated inventory.
 */
export async function updateInventoryById(
  inventoryId: string,
  data: InventoryBody,
): Promise<Inventory> {
  return await updateInventoryByIid(inventoryId, data);
}

/**
 * Deletes an inventory with the specified ID.
 * @param inventoryId - The ID of the inventory to delete.
 * @returns A promise that resolves to void.
 */
export async function deleteInventoryById(inventoryId: string): Promise<void> {
  await prismadb.inventory.delete({ where: { id: inventoryId } });
}
