/**
 * Costos por unidad de un producto que entran al precio sugerido y al piso
 * de precio de Mercado Libre. `transportationCost` es «Envío y otros gastos».
 */
export function parseTransportationCost(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return Math.round(cost * 100) / 100;
}

/** Costo total por unidad: adquisición más envío y otros gastos, si se conocen. */
export function getUnitCostFloor(product: {
  acqPrice?: number | null;
  transportationCost?: number | null;
}): number | null {
  const acq = product.acqPrice;
  if (typeof acq !== "number" || !Number.isFinite(acq) || acq <= 0) return null;
  const extra = product.transportationCost;
  return acq + (typeof extra === "number" && Number.isFinite(extra) && extra > 0 ? extra : 0);
}
