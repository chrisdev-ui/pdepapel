import type { Prisma, PrismaClient } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";

type Client = PrismaClient | Prisma.TransactionClient;

export const STANDALONE_PRODUCT_EXISTS = "STANDALONE_PRODUCT_EXISTS";

export interface StandaloneConflict {
  id: string;
  name: string;
  sku: string | null;
}

/**
 * Una variante sin `id` se crea desde cero. Si ya hay un producto suelto con
 * ese mismo nombre en la tienda, crearla duplica el producto y deja el
 * inventario en el viejo: hay que adoptarlo desde «Importar productos
 * existentes». Devuelve los choques, ignorando los productos que el mismo
 * payload ya adopta por id.
 */
export async function findStandaloneNameConflicts(
  client: Client,
  storeId: string,
  variants: { id?: string | null; name?: string | null }[],
  fallbackName: string,
): Promise<StandaloneConflict[]> {
  const adopted = new Set(variants.map((v) => v.id).filter(Boolean));
  const wanted = new Map<string, string>();
  for (const variant of variants) {
    if (variant.id) continue;
    const name = (variant.name || fallbackName || "").trim();
    if (name) wanted.set(name.toLowerCase(), name);
  }
  if (wanted.size === 0) return [];

  const candidates = await client.product.findMany({
    where: {
      storeId,
      productGroupId: null,
      name: { in: Array.from(wanted.values()) },
    },
    select: { id: true, name: true, sku: true },
  });

  return candidates.filter(
    (product) =>
      !adopted.has(product.id) && wanted.has(product.name.trim().toLowerCase()),
  );
}

export async function assertNoStandaloneNameConflicts(
  client: Client,
  storeId: string,
  variants: { id?: string | null; name?: string | null }[],
  fallbackName: string,
): Promise<void> {
  const conflicts = await findStandaloneNameConflicts(
    client,
    storeId,
    variants,
    fallbackName,
  );
  if (conflicts.length === 0) return;
  const names = conflicts.map((c) => `«${c.name}»`).join(", ");
  throw ErrorFactory.Conflict(
    conflicts.length === 1
      ? `Ya existe un producto suelto llamado ${names}. Impórtalo con «Importar productos existentes» en vez de crear uno nuevo.`
      : `Ya existen productos sueltos llamados ${names}. Impórtalos con «Importar productos existentes» en vez de crear otros nuevos.`,
    { code: STANDALONE_PRODUCT_EXISTS, conflicts },
  );
}
