import { getUnitCostFloor } from "@/lib/product-costs";

/**
 * Piso de precio de una publicación de Mercado Libre. Un precio por debajo
 * del costo de adquisición vende con pérdida segura (la comisión solo la
 * agranda); no se guarda ni se publica salvo que una persona lo autorice con
 * un motivo, que queda registrado en la publicación.
 */
export const BELOW_COST_REASON_MIN_LENGTH = 5;
export const BELOW_COST_REASON_MAX_LENGTH = 300;
export const PRICE_BELOW_COST_CODE = "MERCADOLIBRE_PRICE_BELOW_COST";

export type BelowCostOverride = {
  reason: string;
  /** Piso que se autorizó superar (costo de adquisición). */
  floor: number;
  price: number;
  at: string;
};

/** Piso = costo de adquisición + envío y otros gastos por unidad. */
export function getListingCostFloor(product: {
  acqPrice?: number | null;
  transportationCost?: number | null;
}): number | null {
  return getUnitCostFloor(product);
}

export function isPriceBelowCost(
  price: number,
  product: { acqPrice?: number | null; transportationCost?: number | null },
): boolean {
  const floor = getListingCostFloor(product);
  return floor !== null && price < floor;
}

export type BelowCostReasonError =
  | "required"
  | "too_short"
  | "too_long"
  | null;

export function validateBelowCostReason(
  reason: string | null | undefined,
): BelowCostReasonError {
  const text = (reason ?? "").trim();
  if (!text) return "required";
  if (text.length < BELOW_COST_REASON_MIN_LENGTH) return "too_short";
  if (text.length > BELOW_COST_REASON_MAX_LENGTH) return "too_long";
  return null;
}

export function describeBelowCostReasonError(error: BelowCostReasonError) {
  switch (error) {
    case "required":
      return "Escribe el motivo para publicar por debajo del costo.";
    case "too_short":
      return `El motivo debe tener al menos ${BELOW_COST_REASON_MIN_LENGTH} caracteres.`;
    case "too_long":
      return `El motivo puede tener máximo ${BELOW_COST_REASON_MAX_LENGTH} caracteres.`;
    default:
      return null;
  }
}

/** Lee `priceOverride` del cuerpo de una petición: `{ reason }` o nada. */
export function parsePriceOverride(value: unknown): { reason: string } | null {
  if (value === undefined || value === null || value === false) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const reason = (value as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim() ? { reason: reason.trim() } : null;
}

export type PriceGuardResult =
  | { ok: true; belowCost: false; floor: number | null; override: null }
  | { ok: true; belowCost: true; floor: number; override: BelowCostOverride }
  | { ok: false; belowCost: true; floor: number; message: string; details: Record<string, unknown> };

/**
 * Decide si un precio se puede guardar. Devuelve el registro de autorización
 * a guardar cuando el precio está por debajo del costo y hay motivo válido.
 */
export function evaluateListingPrice({
  price,
  product,
  override,
  now = new Date(),
}: {
  price: number;
  product: { acqPrice?: number | null; transportationCost?: number | null };
  override: { reason: string } | null;
  now?: Date;
}): PriceGuardResult {
  const floor = getListingCostFloor(product);
  if (floor === null || price >= floor) {
    return { ok: true, belowCost: false, floor, override: null };
  }
  const reasonError = validateBelowCostReason(override?.reason);
  if (reasonError) {
    return {
      ok: false,
      belowCost: true,
      floor,
      message: `El precio de Mercado Libre (${formatCop(price)}) está por debajo del costo por unidad (adquisición más envío y otros gastos: ${formatCop(floor)}): se vendería con pérdida. ${
        override
          ? describeBelowCostReasonError(reasonError)
          : "Súbelo o autoriza la pérdida con un motivo."
      }`,
      details: { code: PRICE_BELOW_COST_CODE, floor, price },
    };
  }
  return {
    ok: true,
    belowCost: true,
    floor,
    override: {
      reason: override!.reason.trim(),
      floor,
      price,
      at: now.toISOString(),
    },
  };
}

function formatCop(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
