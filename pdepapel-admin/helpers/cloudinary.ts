import cloudinaryInstance from "@/lib/cloudinary";

/**
 * Deletes resources from Cloudinary.
 * @param publicIds - An array of public IDs of the resources to be deleted.
 * @returns A Promise that resolves to void.
 */
export async function deleteResources(publicIds: string[]): Promise<void> {
  try {
    return await cloudinaryInstance.v2.api.delete_resources(publicIds, {
      type: "upload",
      resource_type: "image",
    });
  } catch (error) {
    console.log("[CLOUDINARY_DELETE_RESOURCES]", error);
  }
}

/**
 * Extracts the public ID from a Cloudinary URL.
 *
 * @param url - The Cloudinary URL.
 * @returns The public ID extracted from the URL, or null if not found.
 */
export function getPublicId(url: string) {
  // Use a regex pattern to match the structure of the URL and extract the public ID
  const match = url.match(/\/v\d+\/([\w-]+)\.\w+$/);

  // Return the matched public ID or null if not found
  return match ? match[1] : null;
}
