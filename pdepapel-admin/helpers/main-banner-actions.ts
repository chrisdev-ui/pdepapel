import prismadb from "@/lib/prismadb";
import { MainBannerBody } from "@/lib/types";
import { MainBanner } from "@prisma/client";

/**
 * Creates a new main banner.
 * @param data - The data for the main banner and the store ID.
 * @returns A promise that resolves to the created main banner.
 */
export async function createNewMainBanner(
  data: MainBannerBody & { storeId: string },
): Promise<MainBanner> {
  return await prismadb.mainBanner.create({ data });
}

/**
 * Retrieves main banners by store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of main banners.
 */
export async function getMainBannersByStoreId(storeId: string) {
  return await prismadb.mainBanner.findFirst({ where: { storeId } });
}

/**
 * Retrieves a main banner by ID.
 * @param mainBannerId - The ID of the main banner.
 * @returns A promise that resolves to a main banner.
 */
export async function getMainBannerById(mainBannerId: string) {
  return await prismadb.mainBanner.findUnique({ where: { id: mainBannerId } });
}

/**
 * Updates a main banner with the provided data.
 * @param mainBannerId - The ID of the main banner.
 * @param data - The data for the main banner.
 * @returns A promise that resolves to the updated main banner.
 */
export async function updateMainBannerById(
  mainBannerId: string,
  data: MainBannerBody,
): Promise<MainBanner> {
  return await prismadb.mainBanner.update({
    where: { id: mainBannerId },
    data,
  });
}

/**
 * Deletes a main banner with the specified ID.
 * @param mainBannerId - The ID of the main banner to delete.
 * @returns A promise that resolves to void.
 */
export async function deleteMainBannerById(
  mainBannerId: string,
): Promise<void> {
  await prismadb.mainBanner.delete({ where: { id: mainBannerId } });
}
