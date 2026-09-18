import type { Prisma } from "@prisma/client";

import { ErrorFactory } from "./api-errors";

type KitTx = Pick<
  Prisma.TransactionClient,
  "product" | "productKit" | "inventoryMovement"
>;

export const KIT_CONVERSION_REASON = "Conversión a kit";
export const KIT_DISSOLUTION_REASON = "Deja de ser kit";
export const KIT_COMPOSITION_REASON = "Cambio en la composición del kit";

/** Cuántos kits se arman con estos componentes (el más escaso manda). */
export function deriveKitStock(
  components: { quantity: number; componentStock: number }[],
): number {
  if (components.length === 0) return 0;
  let units = Number.MAX_SAFE_INTEGER;
  for (const item of components) {
    if (item.quantity <= 0) continue;
    units = Math.min(units, Math.floor(item.componentStock / item.quantity));
  }
  return units === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, units);
}

/**
 * Los componentes deben ser de la tienda, no kits, no archivados y nunca el
 * propio producto: sin esto un kit podía contenerse a sí mismo.
 */
export async function assertValidKitComponents(
  tx: Pick<Prisma.TransactionClient, "product">,
  {
    storeId,
    kitId,
    components,
  }: { storeId: string; kitId?: string | null; components: { componentId: string }[] },
) {
  const ids = Array.from(new Set(components.map((c) => c.componentId).filter(Boolean)));
  if (ids.length === 0) return;
  if (kitId && ids.includes(kitId)) {
    throw ErrorFactory.InvalidRequest("Un kit no puede contenerse a sí mismo.");
  }
  const rows = await tx.product.findMany({
    where: { id: { in: ids }, storeId },
    select: { id: true, name: true, isKit: true, isArchived: true },
  });
  if (rows.length !== ids.length) {
    throw ErrorFactory.InvalidRequest("Algún componente no existe en esta tienda.");
  }
  const kits = rows.filter((row) => row.isKit).map((row) => row.name);
  if (kits.length > 0) {
    throw ErrorFactory.InvalidRequest(`Un kit no puede llevar otro kit dentro: ${kits.join(", ")}.`);
  }
  const archived = rows.filter((row) => row.isArchived).map((row) => row.name);
  if (archived.length > 0) {
    throw ErrorFactory.InvalidRequest(`No se puede armar con productos archivados: ${archived.join(", ")}.`);
  }
}

/**
 * Cuadra la columna `stock` de un kit con lo que se puede armar y deja un
 * movimiento que lo explica. Antes `recalculateKitStock` sobreescribía la
 * columna en silencio: pasar 7 unidades físicas a kit las hacía desaparecer
 * del kardex sin rastro.
 */
export async function settleKitStock(
  tx: KitTx,
  {
    storeId,
    productId,
    reason,
    createdBy,
    skipWhenUnchanged = false,
  }: {
    storeId: string;
    productId: string;
    reason: string;
    createdBy?: string;
    /** Cambios de composición: sin diferencia no hay nada que explicar. */
    skipWhenUnchanged?: boolean;
  },
) {
  const product = await tx.product.findFirst({
    where: { id: productId, storeId },
    select: {
      id: true,
      stock: true,
      isKit: true,
      kitComponents: {
        select: { quantity: true, component: { select: { stock: true } } },
      },
    },
  });
  if (!product) throw ErrorFactory.NotFound("Producto no encontrado");

  const previousStock = product.stock;
  const newStock = product.isKit
    ? deriveKitStock(
        product.kitComponents.map((item) => ({
          quantity: item.quantity,
          componentStock: item.component.stock,
        })),
      )
    : product.stock;
  const quantity = newStock - previousStock;

  if (product.isKit && quantity !== 0) {
    await tx.product.update({ where: { id: productId }, data: { stock: newStock } });
  }
  if (skipWhenUnchanged && quantity === 0) {
    return { previousStock, newStock, quantity, movementId: null };
  }
  const movement = await tx.inventoryMovement.create({
    data: {
      storeId,
      productId,
      type: "MANUAL_ADJUSTMENT",
      quantity,
      previousStock,
      newStock,
      reason,
      description: product.isKit
        ? `Stock derivado de los componentes: ${newStock}. Las ${Math.abs(quantity)} unidades de diferencia ${quantity < 0 ? "quedan registradas aquí; regístralas como entrada de los componentes o ajústalas desde Inventario" : "salen de lo que hoy se puede armar"}.`
        : `El producto vuelve a tener stock propio, fijado en ${newStock}.`,
      createdBy,
    },
  });
  return { previousStock, newStock, quantity, movementId: movement.id };
}
