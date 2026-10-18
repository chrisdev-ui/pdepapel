import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

import { getBrandSuggestionOverview } from "../../server/get-brand-suggestion-overview";

export interface SuggestionBrandTab {
  id: string;
  name: string;
  logoUrl: string | null;
  clean: number;
  conflicts: number;
}

/**
 * Marcas sin archivar que tienen sugerencias, en el orden de la tienda, con
 * sus conteos. Solo la dueña: la pantalla solo sirve para asignar.
 */
export async function getSuggestionBrands(storeId: string): Promise<SuggestionBrandTab[]> {
  await requireStoreOwner(storeId);
  const [overview, brands] = await Promise.all([
    getBrandSuggestionOverview(storeId),
    prismadb.brand.findMany({
      where: { storeId, isArchived: false },
      select: { id: true, name: true, logoUrl: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  const counts = new Map(overview.perBrand.map((row) => [row.brandId, row]));
  return brands
    .filter((brand) => counts.has(brand.id))
    .map((brand) => ({
      ...brand,
      clean: counts.get(brand.id)?.clean ?? 0,
      conflicts: counts.get(brand.id)?.conflicts ?? 0,
    }));
}
