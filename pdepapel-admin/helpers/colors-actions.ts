import prismadb from "@/lib/prismadb";
import { ColorBody } from "@/lib/types";
import { Color } from "@prisma/client";

/**
 * Creates a new color.
 * @param data - The color data to be created.
 * @returns A promise that resolves to the created color.
 */
export async function createNewColor(
  data: ColorBody & { storeId: string },
): Promise<Color> {
  return await prismadb.color.create({ data });
}

/**
 * Retrieves colors by store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of colors.
 */
export async function getColorsByStoreId(storeId: string) {
  return await prismadb.color.findMany({ where: { storeId } });
}

/**
 * Retrieves a color by ID.
 * @param colorId - The ID of the color.
 * @returns A promise that resolves to a color.
 */
export async function getColorById(colorId: string) {
  return await prismadb.color.findUnique({ where: { id: colorId } });
}

/**
 * Updates a color with the provided data.
 * @param colorId - The ID of the color.
 * @param data - The data for the color.
 * @returns A promise that resolves to the updated color.
 */
export async function updateColorById(
  colorId: string,
  data: ColorBody,
): Promise<Color> {
  return await prismadb.color.update({ where: { id: colorId }, data });
}

/**
 * Deletes a color with the specified ID.
 * @param colorId - The ID of the color to delete.
 * @returns A promise that resolves to void.
 */
export async function deleteColorById(colorId: string): Promise<void> {
  await prismadb.color.delete({ where: { id: colorId } });
}
