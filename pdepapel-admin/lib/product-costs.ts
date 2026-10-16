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

/**
 * El 1.000 que el relleno del 2026-09-11 puso en todo producto con envío en 0
 * o vacío, y que el formulario sembró hasta el 2026-09-18
 * (prisma/manual-migrations/20260911_backfill_product_transportation_cost.sql).
 * No es un dato: no se copia ni se promedia.
 */
export const LEGACY_TRANSPORT_FILL = 1000;

/**
 * ¿El envío por unidad es un dato de verdad? Ni vacío, ni el 1.000 del
 * relleno, ni el 0 con que nacían las variantes por el valor por defecto de la
 * columna: esos no se copian ni se promedian.
 */
export function isKnownTransport(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value !== LEGACY_TRANSPORT_FILL;
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

/** Un envío por unidad mayor que esto (sobre el precio de venta) merece una segunda mirada. */
export const TRANSPORT_SHARE_OF_PRICE_WARNING = 0.25;

/** «Envío de la compra (solo este producto)»: el envío de la compra repartido entre las unidades que trajo. */
export function perUnitFromOrder(orderTotal: number | null | undefined, units: number | null | undefined): number | null {
  if (typeof orderTotal !== "number" || !Number.isFinite(orderTotal) || orderTotal < 0) return null;
  if (typeof units !== "number" || !Number.isInteger(units) || units <= 0) return null;
  return Math.round((orderTotal / units) * 100) / 100;
}

/** Aviso (no bloquea) cuando el envío por unidad parece el de toda una orden. */
export function transportWarning({ transport, acqPrice, price }: { transport: number | null | undefined; acqPrice: number | null | undefined; price: number | null | undefined }): string | null {
  if (typeof transport !== "number" || !Number.isFinite(transport) || transport <= 0) return null;
  if (typeof acqPrice === "number" && acqPrice > 0 && transport >= acqPrice) {
    return "El envío por unidad es igual o mayor que el costo de compra. ¿Es el envío de toda la compra? Elige «Envío de la compra (solo este producto)» para repartirlo entre las unidades.";
  }
  if (typeof price === "number" && price > 0 && transport > TRANSPORT_SHARE_OF_PRICE_WARNING * price) {
    return "El envío por unidad pasa del 25 % del precio de venta. ¿Es el envío de toda la compra? Elige «Envío de la compra (solo este producto)» para repartirlo entre las unidades.";
  }
  return null;
}

