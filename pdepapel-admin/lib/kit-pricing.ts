/**
 * Aritmética de un kit. Puro y testeable, igual que `lib/order-totals.ts`.
 *
 * Un kit no tiene costo propio: lo que cuesta es armarlo. La misma regla vive
 * en `lib/financial.ts › getProductUnitCost` y en
 * `lib/point-of-sale.ts › getOrderItemCost`.
 */
export interface KitComponentLine {
  quantity?: number | null;
  /** Precio de catálogo del componente. */
  price?: number | null;
  /** Costo de compra del componente. */
  acqPrice?: number | null;
}

/** Lo que cuesta armar el kit. */
export function sumKitComponentCost(components: KitComponentLine[]): number {
  return components.reduce(
    (total, item) => total + Number(item.acqPrice || 0) * (item.quantity || 1),
    0,
  );
}

/** Lo que costarían los componentes comprados por separado en la tienda. */
export function sumKitComponentRetail(components: KitComponentLine[]): number {
  return components.reduce(
    (total, item) => total + Number(item.price || 0) * (item.quantity || 1),
    0,
  );
}

/** Precio sugerido del kit: el retail de los componentes menos el descuento. */
export function suggestKitPrice(
  components: KitComponentLine[],
  discountPercent: number,
): number {
  const retail = sumKitComponentRetail(components);
  const discount = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  return Math.round(retail * (1 - discount / 100));
}

/**
 * Cuántos kits se pueden armar y qué componente lo limita. El stock de un kit
 * nunca se escribe: `lib/inventory.ts › recalculateKitStock` lo deriva así.
 */
export function computeKitStockLimit<
  T extends { quantity?: number | null; stock?: number | null },
>(components: T[]): { units: number; binding: T | null } | null {
  if (components.length === 0) return null;
  let units = Infinity;
  let binding: T | null = null;
  for (const component of components) {
    const required = component.quantity || 1;
    const possible = Math.floor((component.stock ?? 0) / required);
    if (possible < units) {
      units = possible;
      binding = component;
    }
  }
  return { units: Number.isFinite(units) ? Math.max(0, units) : 0, binding };
}
