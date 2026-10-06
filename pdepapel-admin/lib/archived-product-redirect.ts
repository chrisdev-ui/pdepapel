import type { Prisma, PrismaClient } from "@prisma/client";

import { findDeletedProductUrl } from "@/lib/deleted-product-urls";
import { productAvailabilityWhere } from "@/lib/product-availability";

/**
 * A dónde manda la tienda a quien llega a un producto archivado (cambio de
 * política del 2026-10-05: antes era un 404 y se perdía el 22 % de las
 * impresiones de Google). El orden busca lo más parecido primero, porque
 * Google trata como soft 404 una redirección a algo no equivalente:
 *
 * 1. una variante hermana viva del mismo grupo (con stock antes que sin él);
 * 2. su categoría, si sigue activa **y tiene al menos un producto vivo**
 *    (no archivado y ya disponible, la misma regla del listado de la tienda;
 *    los agotados cuentan). Una categoría vacía detrás de una redirección es
 *    el patrón típico de soft 404 (2026-10-05: 46 URLs caían así);
 * 3. su tipo (la categoría padre), si sigue activo. Va a `/tienda?typeId=…`,
 *    que es noindex y robots.txt no deja rastrear: sirve a la persona, no a
 *    Google;
 * 4. la tienda.
 */
export type ArchivedProductRedirect =
  | { kind: "product"; slug: string }
  | { kind: "category"; slug: string }
  | { kind: "type"; id: string }
  | { kind: "shop" };

type Db = PrismaClient | Prisma.TransactionClient;

export function chooseArchivedProductRedirect(input: {
  sibling: { id: string; slug: string | null } | null;
  category: { slug: string | null; isArchived: boolean; hasLiveProducts: boolean } | null;
  type: { id: string; isArchived: boolean } | null;
}): ArchivedProductRedirect {
  if (input.sibling) return { kind: "product", slug: input.sibling.slug || input.sibling.id };
  if (input.category && !input.category.isArchived && input.category.slug && input.category.hasLiveProducts) {
    return { kind: "category", slug: input.category.slug };
  }
  if (input.type && !input.type.isArchived) return { kind: "type", id: input.type.id };
  return { kind: "shop" };
}

/**
 * Si la referencia (id, slug o alias) es un producto archivado de la tienda,
 * o uno borrado cuya URL quedó en `DeletedProductUrl`, su destino; si nunca
 * existió, null (sigue siendo un 404 real).
 */
export async function findArchivedProductRedirect(
  db: Db,
  storeId: string,
  reference: string,
): Promise<ArchivedProductRedirect | null> {
  const select = { id: true, productGroupId: true, categoryId: true } as const;
  let archived = await db.product.findFirst({
    where: { storeId, isArchived: true, OR: [{ id: reference }, { slug: reference }] },
    select,
  });
  if (!archived) {
    const alias = await db.productSlugAlias.findUnique({
      where: { storeId_slug: { storeId, slug: reference } },
      select: { productId: true },
    });
    if (alias) {
      archived = await db.product.findFirst({
        where: { id: alias.productId, storeId, isArchived: true },
        select,
      });
    }
  }
  if (!archived) {
    const deleted = await findDeletedProductUrl(db, storeId, reference);
    if (!deleted) return null;
    archived = { id: deleted.productId, productGroupId: deleted.productGroupId, categoryId: deleted.categoryId };
  }

  const [sibling, category] = await Promise.all([
    archived.productGroupId
      ? db.product.findFirst({
          where: { storeId, productGroupId: archived.productGroupId, isArchived: false, id: { not: archived.id } },
          orderBy: [{ stock: "desc" }, { createdAt: "asc" }],
          select: { id: true, slug: true },
        })
      : null,
    db.category.findFirst({
      where: { id: archived.categoryId, storeId },
      select: { slug: true, isArchived: true, typeId: true },
    }),
  ]);
  const type = category
    ? await db.type.findFirst({ where: { id: category.typeId, storeId }, select: { id: true, isArchived: true } })
    : null;
  // Solo se cuenta si la categoría podría ser el destino.
  const hasLiveProducts =
    !sibling && category && !category.isArchived && category.slug
      ? (await db.product.count({
          where: { storeId, categoryId: archived.categoryId, isArchived: false, ...productAvailabilityWhere("available") },
          take: 1,
        })) > 0
      : false;

  return chooseArchivedProductRedirect({
    sibling,
    category: category ? { ...category, hasLiveProducts } : null,
    type,
  });
}
