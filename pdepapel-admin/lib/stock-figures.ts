/**
 * Físico, apartado y disponible (físico − apartados) de un producto, venga de
 * donde venga: el buscador manda `onHand` explícito (en caja, `stock` ya es lo
 * disponible); la ficha del producto manda `stock` físico.
 */
export interface StockFigureSource {
  stock: number;
  reservedUnits?: number | null;
  onHand?: number | null;
}

export function stockFigures(product: StockFigureSource) {
  const onHand = product.onHand ?? product.stock;
  const reserved = Math.max(0, product.reservedUnits ?? 0);
  return { onHand, reserved, available: Math.max(0, onHand - reserved) };
}

/** «Disponible 5» y, si hay apartados, «Disponible 5 · Stock 14 · Apartados 9». */
export function availabilityLabel(product: StockFigureSource) {
  const { onHand, reserved, available } = stockFigures(product);
  return reserved > 0 ? `Disponible ${available} · Stock ${onHand} · Apartados ${reserved}` : `Disponible ${available}`;
}
