"use server";

import { auth } from "@clerk/nextjs";
import cloudinaryInstance from "@/lib/cloudinary";
import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";

export async function cleanupImages(urls: string[]) {
  try {
    const { userId } = auth();

    if (!userId) {
      throw new Error("Unauthorized");
    }

    if (!urls || urls.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    // Extract valid public IDs
    const publicIds = urls
      .map((url) => getPublicIdFromCloudinaryUrl(url))
      .filter((id): id is string => id !== null);

    if (publicIds.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    // Delete from Cloudinary
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
