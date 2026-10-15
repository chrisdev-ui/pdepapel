/**
 * Recaudo contra entrega (decisión 2026-10-15: lo paga la clienta, aparte del
 * envío). EnvioClick cobra por recaudar según el valor a recaudar: con ENVIA
 * es un porcentaje más un fijo, con otras es plano o tiene mínimo. Como la
 * clienta paga el recaudo, el valor a recaudar lo incluye, y el recaudo sube
 * con él: es un punto fijo, F = g(base + F).
 *
 * Se resuelve con dos cotizaciones y una cuenta, sin bucles: con dos puntos
 * (v1, g1) y (v2, g2) de la misma tarifa sale la recta g(v) = p·v + c, y
 * F = (p·base + c) / (1 − p). Si la recta no tiene sentido (plano, mínimo,
 * datos raros) se cobra lo de la segunda cotización, que es la más cercana al
 * valor final. Siempre se redondea hacia arriba, al peso.
 */

/** Por encima de esto no es un porcentaje de recaudo, es un dato raro. */
export const COD_FEE_MAX_RATE = 0.2;

export interface CodFeePoint {
  codValue: number;
  fee: number;
}

/** El recaudo que hace cuadrar «valor a recaudar = base + recaudo». */
export function solveCodFee(base: number, first: CodFeePoint, second: CodFeePoint): number {
  const fallback = Math.ceil(Math.max(first.fee, second.fee));
  const span = second.codValue - first.codValue;
  if (!Number.isFinite(span) || span === 0) return fallback;
  const rate = (second.fee - first.fee) / span;
  if (!(rate >= 0 && rate < COD_FEE_MAX_RATE)) return fallback;
  const fixed = first.fee - rate * first.codValue;
  const solved = (rate * base + fixed) / (1 - rate);
  // Una tarifa con mínimo puede quedar por debajo de la recta: nunca menos que
  // lo cotizado a un valor que no supera el valor final a recaudar.
  const floor = [first, second].filter((point) => point.codValue <= base + solved).reduce((max, point) => Math.max(max, point.fee), 0);
  return Math.ceil(Math.max(solved, floor));
}

export interface CodQuoteRate {
  idRate: number;
  carrier: string;
  product: string;
  totalCost: number;
  isCOD: boolean;
  codCost: number | null;
}

const sameService = (a: CodQuoteRate, b: CodQuoteRate) =>
  a.isCOD === b.isCOD && a.carrier.toLowerCase() === b.carrier.toLowerCase() && a.product.toLowerCase() === b.product.toLowerCase();

/**
 * Cotiza dos veces con recaudo y le pone a cada tarifa que recauda su
 * `codFee` final. `quote(v)` cotiza con valor a recaudar `v`; `shippingOf`
 * es el envío que paga la clienta con esa tarifa (0 con envío gratis). La
 * segunda cotización usa el valor más alto de todas las tarifas, así una
 * sola llamada sirve a todas; con `focus` se ajusta a la elegida en el
 * checkout. Devuelve las tarifas de la segunda cotización (idRate vigente).
 */
export async function quoteWithCodFees<R extends CodQuoteRate>(input: {
  amountBeforeShipping: number;
  quote: (codValue: number) => Promise<R[]>;
  shippingOf: (rate: R) => number;
  focus?: (rate: R) => boolean;
}): Promise<Array<R & { codFee: number | null }>> {
  const v1 = Math.max(0, Math.round(input.amountBeforeShipping));
  const firstRates = await input.quote(v1);
  const collecting = firstRates.filter((rate) => rate.isCOD && rate.codCost !== null);
  if (collecting.length === 0) return firstRates.map((rate) => ({ ...rate, codFee: null }));

  const targets = input.focus ? collecting.filter(input.focus) : collecting;
  const pool = targets.length > 0 ? targets : collecting;
  const v2 = Math.round(Math.max(...pool.map((rate) => v1 + input.shippingOf(rate) + Number(rate.codCost))));
  const secondRates = v2 === v1 ? firstRates : await input.quote(v2);

  return secondRates.map((rate) => {
    if (!rate.isCOD || rate.codCost === null) return { ...rate, codFee: null };
    const before = firstRates.find((candidate) => sameService(candidate, rate));
    const base = v1 + input.shippingOf(rate);
    const codFee = before?.codCost != null
      ? solveCodFee(base, { codValue: v1, fee: before.codCost }, { codValue: v2, fee: Number(rate.codCost) })
      : Math.ceil(Number(rate.codCost));
    return { ...rate, codFee };
  });
}

/**
 * Lo que la clienta paga al recibir: el total menos lo que ya cubrió la
 * tarjeta de regalo (el único pago parcial que existe hoy), nunca menos de
 * 0. Es el valor a recaudar de la guía y la base del recaudo.
 */
export function amountToCollect(order: { total: number | null | undefined; giftCardAmount?: number | null }): number {
  return Math.max(0, Math.round((Number(order.total ?? 0) - Number(order.giftCardAmount ?? 0)) * 100) / 100);
}

export const NOTHING_TO_COLLECT_MESSAGE =
  "La tarjeta de regalo cubre todo el pedido: no hay nada que cobrar contra entrega. Quita «Pago contra entrega», cotiza de nuevo y crea la guía sin recaudo.";
