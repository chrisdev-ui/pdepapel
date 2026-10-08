// Sin dependencias de servidor: lo usa el asistente en el navegador.

/**
 * Retenciones (retefuente, reteIVA, reteICA) que Mercado Libre descuenta al
 * liquidar. La API de precios no las entrega: 1,5 % es lo que descontó en las
 * ventas reales de la cuenta (1,35 %–1,70 %, auditoría #18). Es un estimado.
 */
export const MERCADOLIBRE_WITHHOLDING_ESTIMATE_RATE = 0.015;

/** Comisión de Clásica en las categorías de papelería, mientras no se consulta la real. */
export const MERCADOLIBRE_FEE_RATE_ESTIMATE = 0.16;

/** Envío gratis obligatorio para un paquete de 400 g, mientras no se cotiza el real. */
export const MERCADOLIBRE_SHIPPING_ESTIMATE = 8_100;

const currency = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (value: number) => currency.format(Math.round(value)).replace(/ /g, " ");

/** Sube al siguiente precio terminado en 900 (25.412 → 25.900). */
export function roundToFriendlyPrice(price: number) {
  return Math.ceil((price + 100) / 1_000) * 1_000 - 100;
}

export type MercadoLibreMarginBreakdown = {
  price: number;
  fee: number;
  shipping: number;
  withholding: number;
  /** Lo que queda por unidad después del costo; null sin costo registrado. */
  net: number | null;
  marginRate: number | null;
};

export function getMercadoLibreMarginBreakdown({
  price,
  feeAmount,
  shippingCost,
  unitCost,
}: {
  price: number;
  feeAmount: number;
  shippingCost: number;
  unitCost: number | null;
}): MercadoLibreMarginBreakdown {
  const withholding = Math.round(price * MERCADOLIBRE_WITHHOLDING_ESTIMATE_RATE);
  const net = unitCost === null ? null : price - feeAmount - shippingCost - withholding - unitCost;
  return {
    price,
    fee: feeAmount,
    shipping: shippingCost,
    withholding,
    net,
    marginRate: net === null || price <= 0 ? null : net / price,
  };
}

/**
 * Menor precio «amigable» que deja `targetNet` por unidad. La comisión de
 * Mercado Libre es un porcentaje del precio (sin cargo fijo en los precios de
 * la tienda), así que basta despejar y comprobar el escalón de abajo.
 */
export function suggestMercadoLibrePrice({
  unitCost,
  shippingCost,
  feeRate,
  targetNet,
}: {
  unitCost: number;
  shippingCost: number;
  feeRate: number;
  targetNet: number;
}) {
  const keep = 1 - feeRate - MERCADOLIBRE_WITHHOLDING_ESTIMATE_RATE;
  if (keep <= 0) return null;
  const meets = (price: number) =>
    (getMercadoLibreMarginBreakdown({ price, feeAmount: price * feeRate, shippingCost, unitCost }).net ?? -1) >= targetNet;
  let price = roundToFriendlyPrice((unitCost + shippingCost + targetNet) / keep);
  while (!meets(price)) price += 1_000;
  while (price > 1_000 && meets(price - 1_000)) price -= 1_000;
  return price;
}

export function getMercadoLibreMarginWarning(
  breakdown: MercadoLibreMarginBreakdown,
  { breakevenPrice, targetMarginRate = null }: { breakevenPrice: number | null; targetMarginRate?: number | null },
) {
  if (breakdown.net === null) return null;
  if (breakdown.net < 0) {
    return `Con este precio pierdes ${money(-breakdown.net)} por unidad después de la comisión, el envío y las retenciones estimadas.${
      breakevenPrice ? ` El mínimo para no perder es ${money(breakevenPrice)}.` : ""
    }`;
  }
  if (targetMarginRate !== null && breakdown.marginRate !== null && breakdown.marginRate < targetMarginRate) {
    return `El margen queda en ${(breakdown.marginRate * 100).toFixed(1)} %, por debajo del margen objetivo (${Math.round(targetMarginRate * 100)} %).`;
  }
  return null;
}
