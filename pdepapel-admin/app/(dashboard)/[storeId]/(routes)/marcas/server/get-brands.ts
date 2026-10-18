import type { BrandLogoPermission } from "@prisma/client";

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
        _count: { select: { productGroups: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getBrandProductCounts(storeId),
  ]);
  return brands.map(({ _count, ...brand }) => ({
    ...brand,
    aliases: readStoredAliases(brand.aliases),
    activeProducts: counts.get(brand.id)?.active ?? 0,
    totalProducts: counts.get(brand.id)?.total ?? 0,
    groups: _count.productGroups,
  }));
}
