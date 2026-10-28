import type { Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { generateSemanticSKU } from "@/lib/variant-generator";

/**
 * SKU de las variantes nuevas de un grupo, dentro de la transacción del
 * guardado y antes de crear nada (así no quedan filas a medias).
 *
 * El SKU que trae el formulario es la huella del borrador: si todos ya son de
 * un mismo grupo, ese borrador ya se guardó (otra pestaña, un borrador
 * restaurado, un doble envío) → 409 `GROUP_ALREADY_SAVED` con el grupo. Si
 * solo algunos chocan → 409 `SKU_EXISTS` con el SKU y el producto. La
 * variante sin SKU recibe uno del servidor, que reintenta si choca.
 */
export const GROUP_ALREADY_SAVED = "GROUP_ALREADY_SAVED";
export const SKU_EXISTS = "SKU_EXISTS";

type SkuDb = Pick<Prisma.TransactionClient, "product">;

export async function assertNewVariantSkusFree(
  db: SkuDb,
  input: { storeId: string; skus: Array<string | null | undefined> },
): Promise<void> {
  const skus = Array.from(new Set(input.skus.map((sku) => sku?.trim()).filter((sku): sku is string => Boolean(sku))));
  if (skus.length === 0) return;
  const found = await db.product.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true, productGroupId: true, storeId: true },
  });
  if (found.length === 0) return;

  const groupIds = new Set(found.map((product) => product.productGroupId));
  const sameStore = found.every((product) => product.storeId === input.storeId);
  const [groupId] = Array.from(groupIds);
  if (found.length === skus.length && groupIds.size === 1 && groupId && sameStore) {
    throw ErrorFactory.Conflict("Este grupo ya se guardó.", { code: GROUP_ALREADY_SAVED, groupId });
  }
  const first = found[0];
  throw ErrorFactory.Conflict(`El SKU ${first.sku} ya existe en otro producto.`, {
    code: SKU_EXISTS,
    sku: first.sku,
    ...(first.storeId === input.storeId ? { productId: first.id } : {}),
  });
}

const MAX_SKU_ATTEMPTS = 8;

/** Un SKU nuevo, distinto de los de la base y de los ya repartidos en este guardado (`taken`). */
export async function generateUniqueVariantSku(
  db: SkuDb,
  input: { categoryName: string; designName: string; colorName: string; sizeName: string; taken: Set<string>; random?: () => number },
): Promise<string> {
  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt += 1) {
    const sku = generateSemanticSKU(input.categoryName, input.designName, input.colorName, input.sizeName, input.random);
    if (input.taken.has(sku)) continue;
    const exists = await db.product.findUnique({ where: { sku }, select: { id: true } });
    if (exists) continue;
    input.taken.add(sku);
    return sku;
  }
  throw ErrorFactory.Conflict("No se pudo generar un SKU único para una variante. Intenta guardar otra vez.");
}
