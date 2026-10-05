import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface DeletedProductSnapshot {
  id: string;
  slug: string | null;
  categoryId: string;
  productGroupId: string | null;
}

/**
 * Borrar un producto se llevaba su URL: la fila desaparece, la cascada borra
 * sus alias y el enlace de Google daba 404. Antes de borrar se guarda, por
 * cada slug que tenía (el actual y sus alias), a dónde pertenecía: su grupo,
 * su categoría. `findArchivedProductRedirect` lo usa como último recurso.
 *
 * Hay que llamarlo ANTES del borrado (los alias se van con la cascada). Si el
 * slug ya estaba guardado por un borrado anterior, gana el más reciente.
 */
export async function recordDeletedProductUrls(
  db: Db,
  storeId: string,
  products: DeletedProductSnapshot[],
) {
  if (products.length === 0) return;
  const aliases = await db.productSlugAlias.findMany({
    where: { storeId, productId: { in: products.map((product) => product.id) } },
    select: { productId: true, slug: true },
  });

  const rows = new Map<string, Prisma.DeletedProductUrlCreateManyInput>();
  for (const product of products) {
    const slugs = [
      product.slug,
      ...aliases.filter((alias) => alias.productId === product.id).map((alias) => alias.slug),
    ];
    for (const slug of slugs) {
      if (!slug) continue;
      rows.set(slug, {
        storeId,
        slug,
        productId: product.id,
        categoryId: product.categoryId,
        productGroupId: product.productGroupId,
      });
    }
  }
  if (rows.size === 0) return;

  await db.deletedProductUrl.deleteMany({ where: { storeId, slug: { in: Array.from(rows.keys()) } } });
  await db.deletedProductUrl.createMany({ data: Array.from(rows.values()) });
}

/** El registro de un producto borrado por su slug, alias o id viejo. */
export function findDeletedProductUrl(db: Db, storeId: string, reference: string) {
  return db.deletedProductUrl.findFirst({
    where: { storeId, OR: [{ slug: reference }, { productId: reference }] },
    orderBy: { deletedAt: "desc" },
    select: { productId: true, categoryId: true, productGroupId: true },
  });
}
