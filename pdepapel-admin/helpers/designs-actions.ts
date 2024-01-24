import prismadb from "@/lib/prismadb";
import { DesignBody } from "@/lib/types";
import { Design } from "@prisma/client";

/**
 * Creates a new design.
 * @param data - The design data along with the store ID.
 * @returns A promise that resolves to the created design.
 */
export async function createNewDesign(
  data: DesignBody & { storeId: string },
): Promise<Design> {
  return await prismadb.design.create({ data });
}

/**
 * Retrieves designs by store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of designs.
 */
export async function getDesignsByStoreId(storeId: string) {
  return await prismadb.design.findMany({ where: { storeId } });
}

/**
 * Retrieves a design by ID.
 * @param designId - The ID of the design.
 * @returns A promise that resolves to a design.
 */
export async function getDesignById(designId: string) {
  return await prismadb.design.findUnique({ where: { id: designId } });
}

/**
 * Updates a design with the provided data.
 * @param designId - The ID of the design.
 * @param data - The data for the design.
 * @returns A promise that resolves to the updated design.
 */
export async function updateDesignById(
  designId: string,
  data: DesignBody,
): Promise<Design> {
  return await prismadb.design.update({ where: { id: designId }, data });
}

/**
 * Deletes a design with the specified ID.
 * @param designId - The ID of the design to delete.
 * @returns A promise that resolves to void.
 */
export async function deleteDesignById(designId: string): Promise<void> {
  await prismadb.design.delete({ where: { id: designId } });
}
