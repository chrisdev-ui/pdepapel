import type { BrandLogoPermissionValue } from "@/lib/brand-rules";
import { readStoredAliases } from "@/lib/brand-rules";
import prismadb from "@/lib/prismadb";

/** Una marca en los selectores del panel (ficha, grupo, asignar en lote). */
export interface BrandOption {
  id: string;
  name: string;
  logoUrl: string | null;
  logoPermission: BrandLogoPermissionValue;
  aliases: string[];
  isArchived: boolean;
}

/**
 * Marcas para elegir: las que no están archivadas, más las archivadas que el
 * registro ya tiene (`keepIds`), para que se vean y se puedan conservar.
 */
export async function loadBrandOptions(storeId: string, keepIds: (string | null | undefined)[] = []): Promise<BrandOption[]> {
  const keep = keepIds.filter((id): id is string => Boolean(id));
  const rows = await prismadb.brand.findMany({
    where: { storeId, OR: [{ isArchived: false }, ...(keep.length ? [{ id: { in: keep } }] : [])] },
    select: { id: true, name: true, logoUrl: true, logoPermission: true, aliases: true, isArchived: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ ...row, aliases: readStoredAliases(row.aliases) }));
}
