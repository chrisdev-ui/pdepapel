import type { BrandLogoPermission } from "@prisma/client";

import { countBrandLines } from "@/lib/brand-admin";
import { readStoredAliases } from "@/lib/brand-rules";
import { getBrandProductCounts } from "@/lib/brands";
import prismadb from "@/lib/prismadb";
import { requireStoreRead } from "@/lib/store-access";

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  logoUrl: string | null;
  logoHasBackground: boolean;
  logoPermission: BrandLogoPermission;
  isVisible: boolean;
  isFeatured: boolean;
  isArchived: boolean;
  sortOrder: number;
  activeProducts: number;
  totalProducts: number;
  groups: number;
  /** «Es una línea de»: la marca madre, o null. */
  parentBrandId: string | null;
  parentName: string | null;
  /** Sus líneas: todas (bloquean eliminar) y las sin archivar (bloquean archivar). */
  lines: number;
  activeLines: number;
}

/**
 * Marcas de la tienda para la lista del panel, en el orden de la tienda, con
 * sus productos activos y totales. Función de servidor normal: solo la llama
 * la página.
 */
export async function getBrands(storeId: string): Promise<BrandRow[]> {
  await requireStoreRead(storeId);
  const [brands, counts] = await Promise.all([
    prismadb.brand.findMany({
      where: { storeId },
      select: {
        id: true,
        name: true,
        slug: true,
        aliases: true,
        logoUrl: true,
        logoHasBackground: true,
        logoPermission: true,
        isVisible: true,
        isFeatured: true,
        isArchived: true,
        sortOrder: true,
        parentBrandId: true,
        parent: { select: { name: true } },
        _count: { select: { productGroups: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getBrandProductCounts(storeId),
  ]);
  const lineCounts = countBrandLines(brands);
  return brands.map(({ _count, parent, ...brand }) => ({
    ...brand,
    parentName: parent?.name ?? null,
    lines: lineCounts.get(brand.id)?.total ?? 0,
    activeLines: lineCounts.get(brand.id)?.active ?? 0,
    aliases: readStoredAliases(brand.aliases),
    activeProducts: counts.get(brand.id)?.active ?? 0,
    totalProducts: counts.get(brand.id)?.total ?? 0,
    groups: _count.productGroups,
  }));
}
