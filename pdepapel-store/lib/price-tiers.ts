/**
 * Escalera de precio por cantidad. Puro y sin dependencias a propósito: este
 * archivo es BYTE A BYTE el mismo en `pdepapel-admin` y en `pdepapel-store`,
 * y una prueba en la tienda lo compara con el del panel.
 *
 * La razón es el cobro: la tienda calcula el total en el navegador mientras el
 * comprador sube la cantidad, y el panel lo vuelve a calcular en el servidor al
 * cerrar la compra. Si las dos cuentas no dan exactamente lo mismo, el cliente
 * ve un precio y se le cobra otro. Compartir el archivo es lo que impide que
 * una de las dos se quede atrás.
 *
 * NO EDITAR una copia sola: la prueba `price-tiers-parity` falla.
 */

export interface PriceTier {
  /** Desde cuántas unidades aplica este peldaño. */
  minQuantity: number;
  /** Precio por unidad en este peldaño. */
  unitPrice: number;
}

export type PriceSource = "base" | "offer" | "tier";

export interface ResolvedUnitPrice {
  /** Lo que se cobra por unidad. */
  unitPrice: number;
  /** Precio de lista, para tachar. */
  originalPrice: number;
  /** De dónde salió el precio: lista, oferta o escalera. */
  source: PriceSource;
  /** Etiqueta de la oferta, solo cuando la oferta es la que gana. */
  offerLabel: string | null;
  /** Peldaño aplicado, solo cuando la escalera es la que gana. */
  tierMinQuantity: number | null;
}

/** Ordena y limpia: peldaños válidos, de menor a mayor cantidad. */
export function sortTiers(tiers: PriceTier[]): PriceTier[] {
  return tiers
    .filter(
      (tier) =>
        Number.isFinite(tier.minQuantity) &&
        Number.isFinite(tier.unitPrice) &&
        tier.minQuantity >= 1 &&
        tier.unitPrice >= 0,
    )
    .slice()
    .sort((a, b) => a.minQuantity - b.minQuantity);
}

/**
 * El peldaño que aplica a una cantidad: el `minQuantity` más alto que no la
 * pasa. Devuelve `null` cuando no hay escalera o la cantidad no llega al
 * primer peldaño.
 */
export function findTier(tiers: PriceTier[], quantity: number): PriceTier | null {
  if (!Number.isFinite(quantity) || quantity < 1) return null;
  let winner: PriceTier | null = null;
  for (const tier of sortTiers(tiers)) {
    if (tier.minQuantity <= quantity) winner = tier;
    else break;
  }
  return winner;
}

/**
 * Precio unitario final: el más bajo entre lista, oferta y escalera.
 *
 * **Nunca se suman.** Una cápsula con oferta del 10% y peldaño de 10 unidades
 * cobra el menor de los dos, no el peldaño rebajado otra vez: encadenarlos es
 * como se vende por debajo del costo sin darse cuenta.
 */
export function resolveUnitPrice(input: {
  basePrice: number;
  /** Precio ya rebajado por la mejor oferta vigente; `null` si no hay. */
  offerPrice?: number | null;
  offerLabel?: string | null;
  tiers?: PriceTier[] | null;
  quantity: number;
}): ResolvedUnitPrice {
  const basePrice = Number(input.basePrice) || 0;
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));

  const offerPrice =
    typeof input.offerPrice === "number" &&
    Number.isFinite(input.offerPrice) &&
    input.offerPrice < basePrice
      ? input.offerPrice
      : null;

  const tier = findTier(input.tiers ?? [], quantity);
  const tierPrice =
    tier && tier.unitPrice < basePrice ? tier.unitPrice : null;

  // Empate entre oferta y peldaño: gana la oferta, que es la que el comprador
  // ya está viendo anunciada en la ficha.
  let unitPrice = basePrice;
  let source: PriceSource = "base";
  if (offerPrice !== null) {
    unitPrice = offerPrice;
    source = "offer";
  }
  if (tierPrice !== null && tierPrice < unitPrice) {
    unitPrice = tierPrice;
    source = "tier";
  }

  return {
    unitPrice,
    originalPrice: basePrice,
    source,
    offerLabel: source === "offer" ? input.offerLabel ?? null : null,
    tierMinQuantity: source === "tier" && tier ? tier.minQuantity : null,
  };
}

export interface LadderRung {
  minQuantity: number;
  unitPrice: number;
  /** Cuánto se ahorra por unidad contra el precio de lista. */
  savedPerUnit: number;
  /** Porcentaje de ahorro, redondeado, para la etiqueta. */
  savedPct: number;
}

/**
 * La escalera lista para mostrar en la ficha. Incluye el peldaño 1 con el
 * precio de lista cuando la escalera no lo trae, para que el comprador vea
 * desde dónde arranca el descuento.
 */
export function buildLadder(basePrice: number, tiers: PriceTier[]): LadderRung[] {
  const sorted = sortTiers(tiers).filter((tier) => tier.unitPrice < basePrice);
  if (sorted.length === 0) return [];
  const rungs = sorted[0].minQuantity > 1
    ? [{ minQuantity: 1, unitPrice: basePrice }, ...sorted]
    : sorted;
  return rungs.map((rung) => {
    const savedPerUnit = Math.max(0, basePrice - rung.unitPrice);
    return {
      minQuantity: rung.minQuantity,
      unitPrice: rung.unitPrice,
      savedPerUnit,
      savedPct: basePrice > 0 ? Math.round((savedPerUnit / basePrice) * 100) : 0,
    };
  });
}

/**
 * Valida una escalera antes de guardarla: cantidades enteras y distintas, y
 * precio estrictamente decreciente. Una escalera que sube de precio al comprar
 * más no es un error de dedo que se pueda adivinar, así que se rechaza.
 */
export function validateTiers(tiers: PriceTier[]): string | null {
  if (tiers.length === 0) return null;
  const sorted = tiers.slice().sort((a, b) => a.minQuantity - b.minQuantity);
  const seen = new Set<number>();
  let previousPrice = Number.POSITIVE_INFINITY;
  for (const tier of sorted) {
    if (!Number.isInteger(tier.minQuantity) || tier.minQuantity < 1) {
      return "Cada peldaño debe empezar en una cantidad entera de al menos 1";
    }
    if (seen.has(tier.minQuantity)) {
      return `Hay dos peldaños que empiezan en ${tier.minQuantity} unidades`;
    }
    seen.add(tier.minQuantity);
    if (!Number.isFinite(tier.unitPrice) || tier.unitPrice < 0) {
      return "El precio de cada peldaño debe ser un número positivo";
    }
    if (tier.unitPrice >= previousPrice) {
      return `El peldaño de ${tier.minQuantity} unidades no puede costar más por unidad que el anterior`;
    }
    previousPrice = tier.unitPrice;
  }
  return null;
}
