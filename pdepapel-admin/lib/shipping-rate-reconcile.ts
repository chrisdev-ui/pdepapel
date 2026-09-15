import type { RequotedRate } from "@/lib/shipping-helpers";

/**
 * Volver a encontrar la tarifa que eligió la clienta después de re-cotizar.
 *
 * Por qué hace falta: la caché de cotizaciones dura 2 horas. Cuando vence, el
 * checkout vuelve a cotizar contra EnvioClick —bien hecho, el costo del envío
 * no lo pone quien compra— y luego buscaba la tarifa por `idRate`. Medido
 * contra la API de verdad: el `idRate` es estable si se cotiza LO MISMO, pero
 * cambia en cuanto cambia el peso (1,0 kg → 26341730; 1,5 kg → 26341752).
 * Y la re-cotización recalcula las medidas desde el carrito, así que basta una
 * diferencia mínima para que ningún `idRate` coincida y la compra se caiga con
 * «La tarifa de envío ya no está disponible», sin salida.
 *
 * Lo que importa no es el número: es que llegue la misma transportadora, con
 * el mismo servicio y por un precio que no sorprenda a nadie.
 */

/** Hasta aquí el precio se considera el mismo y se sigue sin molestar. */
export const RATE_TOLERANCE_RATIO = 0.05;
export const RATE_TOLERANCE_ABSOLUTE_COP = 2000;

export type RateReconciliation =
  /** Es la misma tarifa (mismo id, o misma transportadora y precio parecido). */
  | { outcome: "same"; rate: RequotedRate }
  /** Sigue estando, pero cuesta otra cosa: lo tiene que ver la clienta. */
  | { outcome: "price_changed"; rate: RequotedRate; previousCost: number }
  /** Ya no la ofrecen para este destino. */
  | { outcome: "unavailable"; alternatives: RequotedRate[] };

const norm = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function isMateriallySameCost(before: number, after: number): boolean {
  const diff = Math.abs(after - before);
  // Dos varas: un porcentaje para lo caro y un tope fijo para lo barato, donde
  // un 5 % son monedas y no merece interrumpir una compra.
  return diff <= RATE_TOLERANCE_ABSOLUTE_COP || diff <= before * RATE_TOLERANCE_RATIO;
}

export function reconcileShippingRate(input: {
  rateId: number;
  /** Lo que la clienta tenía a la vista al elegir; null si no se sabe. */
  previousCost: number | null;
  previousCarrier?: string | null;
  previousProduct?: string | null;
  freshRates: RequotedRate[];
}): RateReconciliation {
  const { rateId, previousCost, freshRates } = input;

  // 1. El mismo número: se cotizó lo mismo y no hay nada que reconciliar.
  const exacto = freshRates.find((rate) => rate.idRate === rateId);
  if (exacto) return { outcome: "same", rate: exacto };

  // 2. Sin número que valga, manda el servicio: misma transportadora y mismo
  //    producto. Es lo que la clienta reconoce, no el id.
  const carrier = norm(input.previousCarrier);
  const product = norm(input.previousProduct);
  const mismoServicio = carrier
    ? freshRates.filter(
        (rate) =>
          norm(rate.carrier) === carrier &&
          (!product || norm(rate.product) === product),
      )
    : [];

  // Si hay varias del mismo servicio, la más barata: nunca se le sube el
  // precio a alguien por una ambigüedad nuestra.
  const candidato = mismoServicio.sort((a, b) => a.totalCost - b.totalCost)[0];
  if (!candidato) {
    return {
      outcome: "unavailable",
      alternatives: [...freshRates].sort((a, b) => a.totalCost - b.totalCost),
    };
  }

  // 3. Sin precio anterior no se puede comparar, así que se trata como cambio
  //    y lo confirma la clienta. Callar una subida no es una opción.
  if (previousCost === null) {
    return { outcome: "price_changed", rate: candidato, previousCost: 0 };
  }

  return isMateriallySameCost(previousCost, candidato.totalCost)
    ? { outcome: "same", rate: candidato }
    : { outcome: "price_changed", rate: candidato, previousCost };
}

/** Las tarifas guardadas en la caché, venga como venga el JSON. */
export function readCachedRates(quotesData: unknown): RequotedRate[] {
  // `/shipment/quote` guarda un ARRAY y el checkout leía `.rates`, que en un
  // array es undefined: la caché nunca se podía usar y TODA compra acababa
  // re-cotizando. Se aceptan las dos formas para no depender de eso.
  if (Array.isArray(quotesData)) return quotesData as RequotedRate[];
  const rates = (quotesData as { rates?: unknown } | null)?.rates;
  return Array.isArray(rates) ? (rates as RequotedRate[]) : [];
}
