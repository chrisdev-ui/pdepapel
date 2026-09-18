import cloudinaryInstance from "@/lib/cloudinary";
import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";

/**
 * Borra archivos de Cloudinary DESPUÉS de que la base confirmó un guardado.
 * Nunca lanza: un fallo aquí deja un archivo huérfano (lo recoge
 * `cleanup-images`), no un producto con fotos rotas.
 */
export async function deleteCloudinaryImages(urls: string[], context: string) {
  const publicIds = Array.from(new Set(urls))
    .map((url) => getPublicIdFromCloudinaryUrl(url))
    .filter((id): id is string => id !== null);
  if (publicIds.length === 0) return { deleted: 0 };
  try {
    await cloudinaryInstance.v2.api.delete_resources(publicIds, {
      type: "upload",
      resource_type: "image",
    });
    return { deleted: publicIds.length };
  } catch (error) {
    console.error(`[${context}] Cloudinary cleanup failed`, { publicIds, error });
    return { deleted: 0 };
  }
}
