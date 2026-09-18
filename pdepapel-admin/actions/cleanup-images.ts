"use server";

import { auth } from "@clerk/nextjs/server";
import cloudinaryInstance from "@/lib/cloudinary";
import { filterUnreferencedImageUrls } from "@/lib/cloudinary-cleanup";
import prismadb from "@/lib/prismadb";
import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";

/**
 * Borra fotos subidas en una sesión y descartadas antes de guardar. Solo
 * borra lo que ninguna fila de la base referencia y solo para dueñas de
 * alguna tienda: antes cualquier sesión podía borrar cualquier archivo
 * pasando su URL.
 */
export async function cleanupImages(urls: string[]) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");
    const ownsAStore = await prismadb.store.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!ownsAStore) throw new Error("Unauthorized");

    if (!urls || urls.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const unreferenced = await filterUnreferencedImageUrls(urls);
    const publicIds = unreferenced
      .map((url) => getPublicIdFromCloudinaryUrl(url))
      .filter((id): id is string => id !== null);

    if (publicIds.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    await cloudinaryInstance.v2.api.delete_resources(publicIds, {
      type: "upload",
      resource_type: "image",
    });

    return { success: true, deletedCount: publicIds.length };
  } catch (error) {
    console.error("[CLEANUP_IMAGES_ACTION]", error);
    return { success: false, error: "Failed to cleanup images" };
  }
}
