import { OrderStatus, ProductPresaleStatus, type Prisma } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import prismadb from "@/lib/prismadb";

/**
 * Regla del proyecto (2026-10-30): las preventas quedan FUERA de Mercado
 * Libre. Un producto con una preventa activa, o con alguna línea de preventa
 * sin liberar en un pedido vivo, no se publica y ofrece 0 unidades; un kit
 * tampoco, si le pasa a alguna de sus piezas. Vuelve solo cuando la preventa
 * se libera o se cancela y no queda ninguna línea pendiente.
 *
 * La misma cuenta se usa al publicar, al encolar la sincronización, al
 * enviarla y al conciliar (si una contara distinto, la conciliación volvería a
 * subir lo que otra bajó): stock − apartados − colchón, o 0 si está bloqueado.
 */
type BlockDb = Pick<Prisma.TransactionClient, "product" | "productPresale" | "orderItem">;

const DEAD_ORDER_STATUSES = [OrderStatus.CANCELLED, OrderStatus.REJECTED];

export async function loadMercadoLibrePresaleBlocked(db: BlockDb, productIds: readonly string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  const blocked = new Set<string>();
  if (ids.length === 0) return blocked;

  const kits = await db.product.findMany({
    where: { id: { in: ids }, isKit: true },
    select: { id: true, kitComponents: { select: { componentId: true } } },
  });
  const componentIds = kits.flatMap((kit) => kit.kitComponents.map((row) => row.componentId));
  const watched = Array.from(new Set([...ids, ...componentIds]));

  const [presales, openLines] = await Promise.all([
    db.productPresale.findMany({
      where: { productId: { in: watched }, status: ProductPresaleStatus.ACTIVE },
      select: { productId: true },
    }),
    db.orderItem.findMany({
      where: {
        productId: { in: watched },
        isPreorder: true,
        preorderReleasedAt: null,
        preorderUnfulfilledAt: null,
        order: { status: { notIn: DEAD_ORDER_STATUSES } },
      },
      select: { productId: true },
      distinct: ["productId"],
    }),
  ]);
  const touched = new Set<string>([...presales.map((row) => row.productId), ...openLines.flatMap((row) => (row.productId ? [row.productId] : []))]);

  for (const id of ids) if (touched.has(id)) blocked.add(id);
  for (const kit of kits) if (kit.kitComponents.some((row) => touched.has(row.componentId))) blocked.add(kit.id);
  return blocked;
}

export async function loadMercadoLibreSellable(
  db: BlockDb,
  productIds: readonly string[],
  knownBlocked?: Set<string>,
): Promise<Map<string, number>> {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  const sellable = new Map<string, number>();
  if (ids.length === 0) return sellable;

  const [products, blocked] = await Promise.all([
    db.product.findMany({ where: { id: { in: ids } }, select: { id: true, stock: true, reservedUnits: true } }),
    knownBlocked ?? loadMercadoLibrePresaleBlocked(db, ids),
  ]);
  for (const product of products) sellable.set(product.id, blocked.has(product.id) ? 0 : availableStock(product));
  return sellable;
}

/** Lo vendible menos el colchón de la publicación. */
export function mercadoLibreQuantity(sellable: number | undefined, safetyBuffer: number | null | undefined): number {
  return Math.max(0, (sellable ?? 0) - Math.max(0, safetyBuffer ?? 0));
}

export async function isBlockedByPresaleForMercadoLibre(productId: string, db: BlockDb = prismadb): Promise<boolean> {
  return (await loadMercadoLibrePresaleBlocked(db, [productId])).has(productId);
}
