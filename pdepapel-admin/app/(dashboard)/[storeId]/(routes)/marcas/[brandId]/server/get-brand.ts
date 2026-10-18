import { readStoredAliases } from "@/lib/brand-rules";
import { countBrandProducts } from "@/lib/brands";
import prismadb from "@/lib/prismadb";
import { requireStoreRead } from "@/lib/store-access";

/**
 * Marca de la tienda para su formulario, con sus productos activos y totales.
 * `null` cuando el id no existe o es de otra tienda. Función de servidor
 * normal: solo la llama la página.
 */
export async function getBrand(storeId: string, brandId: string) {
  await requireStoreRead(storeId);
  const brand = await prismadb.brand.findFirst({ where: { id: brandId, storeId } });
  if (!brand) return null;
  const [counts, activeProducts] = await Promise.all([
    countBrandProducts(prismadb, brand.id),
    prismadb.product.count({ where: { storeId, brandId: brand.id, isArchived: false } }),
  ]);
  return {
    ...brand,
    aliases: readStoredAliases(brand.aliases),
    usage: { activeProducts, totalProducts: counts.products, groups: counts.groups },
  };
}

export type BrandDetail = NonNullable<Awaited<ReturnType<typeof getBrand>>>;
