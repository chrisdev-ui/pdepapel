import prismadb from "@/lib/prismadb";
import { BannersBody } from "@/lib/types";
import { Banner } from "@prisma/client";

/**
 * Creates a banner with the provided data and store ID.
 * @param data The banner data.
 * @param storeId The ID of the store.
 * @returns A promise that resolves to the created banner.
 */
export async function createNewBanner(
  data: BannersBody & { storeId: string },
): Promise<Banner> {
  return await prismadb.banner.create({
    data,
  });
}

/**
 * Retrieves banners by store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of banners.
 */
export async function getBannersByStoreId(storeId: string) {
  return await prismadb.banner.findMany({
    where: { storeId },
  });
}

/**
 * Retrieves a banner by ID.
 * @param bannerId - The ID of the banner.
 * @returns A promise that resolves to the banner.
 */
export async function getBannerById(bannerId: string) {
  return await prismadb.banner.findUnique({
    where: { id: bannerId },
  });
}

/**
 * Updates a banner with the specified ID.
 * @param bannerId - The ID of the banner to update.
 * @param data - The updated data for the banner.
 * @returns A promise that resolves to the updated banner.
 */
export async function updateBannerById(
  bannerId: string,
  data: BannersBody,
): Promise<Banner> {
  return await prismadb.banner.update({
    where: { id: bannerId },
    data,
  });
}

/**
 * Deletes a banner with the specified ID.
 * @param bannerId - The ID of the banner to delete.
 * @returns A promise that resolves to void.
 */
export async function deleteBannerById(bannerId: string): Promise<void> {
  await prismadb.banner.delete({
    where: { id: bannerId },
  });
}
