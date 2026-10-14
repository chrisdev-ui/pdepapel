/**
 * Lo que se puede vender: el stock físico menos lo apartado para clientas.
 * Es la única regla de disponibilidad del catálogo, el checkout, el punto de
 * venta, el bot, los feeds y Mercado Libre. Lo físico (`stock`) sigue siendo
 * lo que cuadra con el kardex y con el conteo de bodega.
 */
export interface StockCounts {
  stock: number;
  reservedUnits?: number | null;
}

export function availableStock(product: StockCounts): number {
  return Math.max(0, product.stock - Math.max(0, product.reservedUnits ?? 0));
}

/** Lo que se publica en Mercado Libre: lo disponible menos el colchón de la publicación. */
export function marketplaceAvailableStock(product: StockCounts, safetyBuffer: number | null | undefined): number {
  return Math.max(0, availableStock(product) - Math.max(0, safetyBuffer ?? 0));
}

/**
 * Kits por armar con las piezas que se pueden vender. Un kit no guarda stock
 * propio: su disponibilidad es la de la pieza que primero se acaba.
 */
export function kitAvailableFromComponents(
  components: { quantity: number; component: StockCounts | null }[],
): number {
  let max = Number.POSITIVE_INFINITY;
  for (const item of components) {
    if (item.quantity <= 0) continue;
    const units = item.component ? availableStock(item.component) : 0;
    max = Math.min(max, Math.floor(units / item.quantity));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}

/** Lo mismo con el stock físico: es lo que guarda la columna `stock` de un kit. */
export function kitPhysicalFromComponents(
  components: { quantity: number; component: { stock: number } | null }[],
): number {
  return kitAvailableFromComponents(
    components.map((item) => ({ quantity: item.quantity, component: item.component ? { stock: item.component.stock } : null })),
  );
}

/**
 * Vista pública de un producto: `stock` sale ya neto de apartados (también el
 * de las piezas de un kit y el de las variantes de un grupo) y el contador no
 * se publica. La tienda no necesita saber que existen los apartados, solo
 * cuánto se puede comprar.
 */
export function netPublicProduct<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const source = row as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  if (typeof source.stock === "number") {
    out.stock = availableStock(source as unknown as StockCounts);
  }
  delete out.reservedUnits;
  if (Array.isArray(source.kitComponents)) {
    out.kitComponents = source.kitComponents.map((item: Record<string, unknown>) =>
      item && item.component ? { ...item, component: netPublicProduct(item.component) } : item,
    );
  }
  if (Array.isArray(source.products)) {
    out.products = source.products.map((product) => netPublicProduct(product));
  }
  return out as T;
}
