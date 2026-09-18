/**
 * Reglas de precio de la ficha. Puro y testeable.
 *
 * Un precio de venta por debajo del costo casi siempre es un dedo mal puesto
 * (13.00 en vez de 13.000). Se bloquea salvo que la dueña diga que es a
 * propósito (liquidación).
 */
export function isPriceBelowCost(price: number, cost: number | null | undefined): boolean {
  const unitCost = Number(cost);
  return Number.isFinite(unitCost) && unitCost > 0 && Number(price) < unitCost;
}

export function priceBelowCostMessage(price: number, cost: number, currency: (value: number) => string): string {
  return `El precio de venta (${currency(price)}) está por debajo del costo (${currency(cost)}): perderías ${currency(cost - price)} por unidad. Súbelo, corrige el costo o marca «Vender con pérdida a propósito».`;
}
