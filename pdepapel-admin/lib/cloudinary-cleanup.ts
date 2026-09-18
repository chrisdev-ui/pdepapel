import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";

type ReferenceDb = {
  image: { count: (args: { where: { url: string } }) => Promise<number> };
  orderItem: {
    count: (args: { where: { imageUrl: string } }) => Promise<number>;
  };
  category?: {
    count: (args: { where: { imageUrl: string } }) => Promise<number>;
  };
  homeContent?: {
    count: (args: {
      where: {
        OR: { imageUrl?: string; primaryUrl?: string; secondaryUrl?: string }[];
      };
    }) => Promise<number>;
  };
  store?: { count: (args: { where: { logoUrl: string } }) => Promise<number> };
};

/**
 * URLs que otra fila sigue usando: las variantes de un grupo comparten la
 * misma foto por URL, los pedidos guardan la foto como historial y las
 * portadas de categoría, del inicio y el logo viven en otras tablas. Borrar
 * el archivo por quitarlo de UNA fila rompía a las demás.
 */
export async function filterUnreferencedImageUrls(
  urls: string[],
  db: ReferenceDb = prismadb,
): Promise<string[]> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const checks = await Promise.all(
    unique.map(async (url) => {
      const counts = await Promise.all([
        db.image.count({ where: { url } }),
        db.orderItem.count({ where: { imageUrl: url } }),
        typeof db.category?.count === "function"
          ? db.category.count({ where: { imageUrl: url } })
          : 0,
        typeof db.homeContent?.count === "function"
          ? db.homeContent.count({
              where: {
                OR: [{ imageUrl: url }, { primaryUrl: url }, { secondaryUrl: url }],
              },
            })
          : 0,
        typeof db.store?.count === "function"
          ? db.store.count({ where: { logoUrl: url } })
          : 0,
      ]);
      return counts.every((count) => count === 0) ? url : null;
    }),
  );
  return checks.filter((url): url is string => url !== null);
}

/**
 * Borra archivos de Cloudinary DESPUÉS de que la base confirmó un guardado y
 * solo si ninguna otra fila los referencia. Nunca lanza: un fallo aquí deja
 * un archivo huérfano (lo recoge `cleanup-images`), no un producto con fotos
 * rotas.
 */
export async function deleteCloudinaryImages(
  urls: string[],
  context: string,
  db: ReferenceDb = prismadb,
) {
  let candidates: string[];
  try {
    candidates = await filterUnreferencedImageUrls(urls, db);
  } catch (error) {
    console.error(
      `[${context}] Could not verify image references; keeping files`,
      error,
    );
    return { deleted: 0, kept: urls.length };
  }
  const publicIds = candidates
    .map((url) => getPublicIdFromCloudinaryUrl(url))
    .filter((id): id is string => id !== null);
  const kept = new Set(urls).size - candidates.length;
  if (publicIds.length === 0) return { deleted: 0, kept };
  try {
    await cloudinaryInstance.v2.api.delete_resources(publicIds, {
      type: "upload",
      resource_type: "image",
    });
    return { deleted: publicIds.length, kept };
  } catch (error) {
    console.error(`[${context}] Cloudinary cleanup failed`, {
      publicIds,
      error,
    });
    return { deleted: 0, kept };
  }
}
