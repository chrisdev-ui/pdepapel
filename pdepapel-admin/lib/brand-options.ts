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
  /** Si es una línea: su marca madre (para «línea de …» y para preferir la línea al sugerir). */
  parentBrandId: string | null;
  parentName: string | null;
}

/**
 * Marcas para elegir: las que no están archivadas, más las archivadas que el
 * registro ya tiene (`keepIds`), para que se vean y se puedan conservar.
 */
export async function loadBrandOptions(storeId: string, keepIds: (string | null | undefined)[] = []): Promise<BrandOption[]> {
  const keep = keepIds.filter((id): id is string => Boolean(id));
  const rows = await prismadb.brand.findMany({
    where: { storeId, OR: [{ isArchived: false }, ...(keep.length ? [{ id: { in: keep } }] : [])] },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      logoPermission: true,
      aliases: true,
      isArchived: true,
      parentBrandId: true,
      parent: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map(({ parent, ...row }) => ({ ...row, aliases: readStoredAliases(row.aliases), parentName: parent?.name ?? null }));
}
