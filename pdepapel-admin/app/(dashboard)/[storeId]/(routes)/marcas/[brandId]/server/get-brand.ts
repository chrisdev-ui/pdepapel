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
  const [counts, activeProducts, activeLines] = await Promise.all([
    countBrandProducts(prismadb, brand.id),
    prismadb.product.count({ where: { storeId, brandId: brand.id, isArchived: false } }),
    prismadb.brand.count({ where: { storeId, parentBrandId: brand.id, isArchived: false } }),
  ]);
  return {
    ...brand,
    aliases: readStoredAliases(brand.aliases),
    usage: { activeProducts, totalProducts: counts.products, groups: counts.groups },
    activeLines,
  };
}

export type BrandDetail = NonNullable<Awaited<ReturnType<typeof getBrand>>>;

export interface BrandParentOption {
  id: string;
  name: string;
  logoUrl: string | null;
  aliases: string[];
  isArchived: boolean;
}

/**
 * Marcas que pueden ser la madre en «Es una línea de»: las principales sin
 * archivar, menos ella misma. Incluye la madre actual aunque esté archivada,
 * para que se vea qué tiene guardado.
 */
export async function getBrandParentOptions(
  storeId: string,
  brandId: string | null,
  currentParentId: string | null = null,
): Promise<BrandParentOption[]> {
  await requireStoreRead(storeId);
  const rows = await prismadb.brand.findMany({
    where: {
      storeId,
      ...(brandId ? { id: { not: brandId } } : {}),
      OR: [{ isArchived: false, parentBrandId: null }, ...(currentParentId ? [{ id: currentParentId }] : [])],
    },
    select: { id: true, name: true, logoUrl: true, aliases: true, isArchived: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ ...row, aliases: readStoredAliases(row.aliases) }));
}
