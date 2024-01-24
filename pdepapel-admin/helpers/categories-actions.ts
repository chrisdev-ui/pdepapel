import prismadb from "@/lib/prismadb";
import { CategoryBody } from "@/lib/types";
import { Category } from "@prisma/client";

/**
 * Creates a new category with the provided data.
 * @param data - The category data and store ID.
 * @returns A promise that resolves to the created category.
 */
export async function createNewCategory(
  data: CategoryBody & { storeId: string },
): Promise<Category> {
  return await prismadb.category.create({ data });
}

/**
 * Retrieves categories by store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of categories.
 */
export async function getCategoriesByStoreId(storeId: string) {
  return await prismadb.category.findMany({ where: { storeId } });
}

/**
 * Retrieves a category by ID.
 * @param categoryId - The ID of the category.
 * @returns A promise that resolves to a category.
 */
export async function getCategoryById(categoryId: string) {
  return await prismadb.category.findUnique({ where: { id: categoryId } });
}

/**
 * Updates a category with the provided data.
 * @param categoryId - The ID of the category.
 * @param data - The data for the category.
 * @returns A promise that resolves to the updated category.
 */
export async function updateCategoryById(
  categoryId: string,
  data: CategoryBody,
) {
  return await prismadb.category.update({ where: { id: categoryId }, data });
}

/**
 * Deletes a category with the specified ID.
 * @param categoryId - The ID of the category to delete.
 * @returns A promise that resolves to void.
 */
export async function deleteCategoryById(categoryId: string): Promise<void> {
  await prismadb.category.delete({ where: { id: categoryId } });
}
