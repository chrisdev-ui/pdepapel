import type { Prisma, PrismaClient } from "@prisma/client";

import { brandDataName } from "@/lib/brand-rules";

type BrandReader = Pick<PrismaClient | Prisma.TransactionClient, "product">;

const BRAND_NAME_SELECT = { select: { name: true, isArchived: true } } as const;

/**
 * Nombre de marca que se guarda en `OrderItem.brandName` al crear cada línea.
 * Único camino para las ocho rutas que crean líneas (tienda, panel, punto de
 * venta, feria, apartados, WhatsApp, tarjeta de regalo): la marca enlazada
 * del producto (o la de su grupo) mientras no esté archivada. Sin marca, o una
 * línea manual sin producto, queda en null.
 */
export async function getOrderItemBrandNames(
  db: BrandReader,
  productIds: (string | null | undefined)[],
): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(productIds.filter((id): id is string => Boolean(id))));
  const names = new Map<string, string | null>();
  if (ids.length === 0) return names;
  const rows = await db.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      brandRef: BRAND_NAME_SELECT,
      productGroup: { select: { brandRef: BRAND_NAME_SELECT } },
    },
  });
  for (const row of rows) {
    names.set(row.id, brandDataName(row.brandRef ?? row.productGroup?.brandRef ?? null));
  }
  return names;
}

/** `brandName` de una línea a partir del mapa anterior. */
export function orderItemBrandName(
  names: Map<string, string | null>,
  productId: string | null | undefined,
) {
  return productId ? (names.get(productId) ?? null) : null;
}
