import prismadb from "@/lib/prismadb";
import { ProductTagBody } from "@/lib/types";
import { ProductTag } from "@prisma/client";

/**
 * Creates a new product tag.
 * @param data - The data for the product tag, including the store ID.
 * @returns A promise that resolves to the created product tag.
 */
export async function createNewProductTag(
  data: ProductTagBody & { storeId: string },
): Promise<ProductTag> {
  return prismadb.productTag.create({ data });
}

/**
 * Retrieves all product tags of a store.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of product tags.
 */
export async function getProductTagsByStoreId(storeId: string) {
  return prismadb.productTag.findMany({
    where: { storeId },
    include: { product: true, tag: true },
  });
}

/**
 * Retrieves a product tag by its ID.
 * @param {string} ProductTagId - The ID of the product tag to retrieve.
 * @returns A promise that resolves to the retrieved product tag including product and tag models.
 */
export async function getProductTagById(ProductTagId: string) {
  return prismadb.productTag.findUnique({
    where: { id: ProductTagId },
    include: { product: true, tag: true },
  });
}

/**
 * Updates a product tag by its ID.
 * @param {string} ProductTagId - The ID of the product tag to update.
 * @param data - The data to update.
 * @returns A promise that resolves to the updated product tag.
 */
export async function updateProductTagById(
  ProductTagId: string,
  data: ProductTagBody,
) {
  return prismadb.productTag.update({ where: { id: ProductTagId }, data });
}

/**
 * Deletes a product tag by its ID.
 * @param {string} ProductTagId - The ID of the product tag to delete.
 * @returns {Promise<void>} A promise that resolves when the product tag is deleted.
 */
export async function deleteProductTagById(
  ProductTagId: string,
): Promise<void> {
  await prismadb.productTag.delete({ where: { id: ProductTagId } });
}
