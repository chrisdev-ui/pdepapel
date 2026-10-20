/**
 * Cuántas cápsulas se vendieron de cada lote. El stock del producto cápsula
 * es uno solo para todos sus lotes, así que lo vendido (lo empacado en lotes
 * vigentes menos lo que queda) se reparte del lote más viejo al más nuevo.
 * Antes cada lote restaba el stock entero de su cantidad y, con dos lotes,
 * los dos decían haber vendido lo del otro.
 */
export interface BatchForSales {
  id: string;
  capsuleProductId: string;
  quantity: number;
  createdAt: Date;
  unpackedAt: Date | null;
}

export function fifoSoldByBatch(batches: readonly BatchForSales[], stockByProduct: ReadonlyMap<string, number>): Map<string, number> {
  const sold = new Map<string, number>();
  const live = batches.filter((batch) => !batch.unpackedAt).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const byProduct = new Map<string, BatchForSales[]>();
  for (const batch of live) byProduct.set(batch.capsuleProductId, [...(byProduct.get(batch.capsuleProductId) ?? []), batch]);
  for (const [productId, rows] of Array.from(byProduct)) {
    const packed = rows.reduce((total, batch) => total + batch.quantity, 0);
    let remaining = Math.max(0, packed - Math.max(0, stockByProduct.get(productId) ?? 0));
    for (const batch of rows) {
      const fromThis = Math.min(batch.quantity, remaining);
      sold.set(batch.id, fromThis);
      remaining -= fromThis;
    }
  }
  for (const batch of batches) if (!sold.has(batch.id)) sold.set(batch.id, 0);
  return sold;
}
