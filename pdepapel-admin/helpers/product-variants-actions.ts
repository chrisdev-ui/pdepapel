import prismadb from "@/lib/prismadb";
import { ProductVariantBody, ProductVariantIncludeOptions } from "@/lib/types";
import { ImageVariant, Prisma, ProductVariant } from "@prisma/client";
import { deleteResources, getPublicId } from "./cloudinary";
import { createInventory } from "./inventories-actions";

/**
 * Creates a new product variant.
 * @param data - The data for the new product variant, including SKU and store ID.
 * @returns A PrismaPromise that resolves to the created product variant.
 */
export function createProductVariant(
  data: ProductVariantBody & { sku: string; storeId: string },
) {
  return prismadb.productVariant.create({
    data: {
      ...data,
      images: {
        createMany: {
          data: [...data.images.map((image) => image)],
        },
      },
    },
  });
}

/**
 * Creates a new product variant.
 * @param data - The data for the product variant, including SKU and store ID.
 * @returns A promise that resolves to the created product variant.
 */
export async function createNewProductVariant(
  data: ProductVariantBody & { sku: string; storeId: string },
): Promise<ProductVariant> {
  return await createProductVariant(data);
}

/**
 * Retrieves all product variants of a store.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of product variants.
 */
export async function getProductVariantsByStoreId(storeId: string) {
  return await prismadb.productVariant.findMany({
    where: { storeId },
    include: {
      product: true,
      size: true,
      color: true,
      design: true,
      discount: true,
      images: true,
    },
  });
}

/**
 * Retrieves a product variant from a database based on its ID.
 * @param productVariantId - The ID of the product variant to retrieve.
 * @param includeOptions - An object specifying which related entities should be included in the result.
 * @param includeAll - If set to true, all related entities will be included in the result. If set to false (default), only the entities specified in includeOptions will be included.
 * @returns A Promise that resolves to the retrieved product variant object from the database, including the specified related entities if requested.
 */
export async function getProductVariantById(
  productVariantId: string,
  includeOptions: ProductVariantIncludeOptions = {},
  includeAll: boolean = false,
) {
  const include: Prisma.ProductVariantInclude = {};

  if (includeAll) {
    include.product = true;
    include.size = true;
    include.color = true;
    include.design = true;
    include.discount = true;
    include.images = true;
  } else {
    if (includeOptions.product) {
      include.product = true;
    }

    if (includeOptions.size) {
      include.size = true;
    }

    if (includeOptions.color) {
      include.color = true;
    }

    if (includeOptions.design) {
      include.design = true;
    }

    if (includeOptions.discount) {
      include.discount = true;
    }

    if (includeOptions.images) {
      include.images = true;
    }
  }

  return await prismadb.productVariant.findUnique({
    where: { id: productVariantId },
    include,
  });
}

/**
 * Deletes a product variant by its ID.
 * @param productVariantId - The ID of the product variant to delete.
 * @returns A promise that resolves when the product variant is deleted.
 */
export async function deleteProductVariantById(
  productVariantId: string,
): Promise<void> {
  await prismadb.productVariant.delete({ where: { id: productVariantId } });
}

/**
 * Registers a product variant and its stock.
 * @param data - The data for the product variant and stock.
 * @returns An object containing the registered product variant and inventory record.
 */
export async function registerProductVariantAndStock(
  data: ProductVariantBody & { sku: string; storeId: string },
) {
  const [productVariant, inventoryRecord] = await prismadb.$transaction([
    createProductVariant(data),
    createInventory({
      variantId: data.productId,
      quantity: data.stock,
      storeId: data.storeId,
    }),
  ]);

  return { productVariant, inventoryRecord };
}

/**
 * Updates a product variant and its stock in the database.
 * @param productVariantImages - An array of image variants associated with the product variant.
 * @param body - An object containing the updated details of the product variant.
 * @param productVariantId - The ID of the product variant to be updated.
 * @returns The updated product variant object.
 */
export async function updateProductVariantAndStock(
  productVariantImages: ImageVariant[],
  body: ProductVariantBody,
  productVariantId: string,
): Promise<ProductVariant> {
  return prismadb.$transaction(async (tx) => {
    const { images, ...bodyWithoutImages } = body;
    const { stock } = bodyWithoutImages;

    // 1. Find images to delete
    const currentImageUrls = productVariantImages.map((image) => image.url);
    const newImageUrls = images.map((image) => image.url);
    const imagesToDelete = currentImageUrls.filter(
      (url) => !newImageUrls.includes(url),
    );

    // 2. Find images to add
    const imagesToAdd = newImageUrls.filter(
      (url) => !currentImageUrls.includes(url),
    );

    // 3. Delete unnecessary images
    if (imagesToDelete.length > 0) {
      const publicIdsToDelete = imagesToDelete.map(
        (url) => getPublicId(url) ?? "",
      );
      await deleteResources(publicIdsToDelete);
      await tx.imageVariant.deleteMany({
        where: {
          variantId: productVariantId,
          url: { in: imagesToDelete },
        },
      });
    }

    // 4. Add new images
    if (imagesToAdd.length > 0) {
      const imageVariantsToAdd = imagesToAdd.map((url) => ({
        url,
        variantId: productVariantId,
      }));
      await tx.imageVariant.createMany({
        data: imageVariantsToAdd,
      });
    }

    // 5. Update product variant excluding images
    const updatedVariant = await tx.productVariant.update({
      where: { id: productVariantId },
      data: bodyWithoutImages,
    });

    // 6. Update inventory record
    await tx.inventory.update({
      where: { variantId: productVariantId },
      data: { quantity: stock },
    });

    return updatedVariant;
  });
}
