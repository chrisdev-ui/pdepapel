import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * A dónde manda la tienda a quien llega a un producto archivado (cambio de
 * política del 2026-10-05: antes era un 404 y se perdía el 22 % de las
 * impresiones de Google). El orden busca lo más parecido primero, porque
 * Google trata como soft 404 una redirección a algo no equivalente:
 *
 * 1. una variante hermana viva del mismo grupo (con stock antes que sin él);
 * 2. su categoría, si sigue activa;
 * 3. su tipo (la categoría padre), si sigue activo;
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
  category: { slug: string | null; isArchived: boolean } | null;
  type: { id: string; isArchived: boolean } | null;
}): ArchivedProductRedirect {
  if (input.sibling) return { kind: "product", slug: input.sibling.slug || input.sibling.id };
  if (input.category && !input.category.isArchived && input.category.slug) {
    return { kind: "category", slug: input.category.slug };
  }
  if (input.type && !input.type.isArchived) return { kind: "type", id: input.type.id };
  return { kind: "shop" };
}

/**
 * Si la referencia (id, slug o alias) es un producto archivado de la tienda,
 * su destino; si no existe, null (sigue siendo un 404 real).
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
  if (!archived) return null;

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

  return chooseArchivedProductRedirect({ sibling, category, type });
}
