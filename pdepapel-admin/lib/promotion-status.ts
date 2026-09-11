/**
 * Estado real de una promoción (oferta o cupón) según su vigencia y su uso.
 *
 * `isActive` es el interruptor manual; las fechas dicen si ya empezó o ya
 * terminó y mandan sobre el interruptor cuando la promoción venció; un cupón
 * con todos sus usos consumidos está agotado aunque siga dentro de fechas.
 * La combinación da un estado legible para la lista sin tocar la lógica de
 * aplicación de descuentos.
 */

export type PromotionStatus = "vigente" | "programada" | "agotada" | "vencida" | "desactivada";

export interface PromotionWindow {
  isActive: boolean;
  startDate: Date | string;
  endDate: Date | string;
  /** Solo cupones: límite de usos (`null` = sin límite). */
  maxUses?: number | null;
  /** Solo cupones: usos ya registrados. */
  usedCount?: number | null;
}

export const PROMOTION_STATUS: Record<PromotionStatus, { label: string; tone: "mint" | "sky" | "cream" | "slate" | "pink" }> = {
  vigente: { label: "Vigente", tone: "mint" },
  programada: { label: "Programada", tone: "sky" },
  agotada: { label: "Agotada", tone: "cream" },
  vencida: { label: "Vencida", tone: "slate" },
  desactivada: { label: "Desactivada", tone: "pink" },
};

export const PROMOTION_STATUS_ORDER: PromotionStatus[] = ["vigente", "programada", "agotada", "vencida", "desactivada"];

/** `true` cuando el cupón tiene límite y ya lo alcanzó. */
export function isPromotionExhausted(promotion: Pick<PromotionWindow, "maxUses" | "usedCount">): boolean {
  const limit = promotion.maxUses ?? null;
  if (limit === null || limit <= 0) return false;
  return (promotion.usedCount ?? 0) >= limit;
}

export function getPromotionStatus(promotion: PromotionWindow, now = new Date()): PromotionStatus {
  const start = new Date(promotion.startDate);
  const end = new Date(promotion.endDate);
  // Vencida manda sobre todo lo demás: el interruptor ya no importa.
  if (now > end) return "vencida";
  if (isPromotionExhausted(promotion)) return "agotada";
  // «Desactivada» es solo la apagada a mano antes de tiempo; el recálculo
  // diario nunca vuelve a encender una promoción.
  if (!promotion.isActive) return "desactivada";
  if (now < start) return "programada";
  return "vigente";
}

export interface PromotionSummary {
  total: number;
  vigentes: number;
  programadas: number;
  agotadas: number;
  vencidas: number;
  desactivadas: number;
}

export function summarizePromotions(statuses: PromotionStatus[]): PromotionSummary {
  return {
    total: statuses.length,
    vigentes: statuses.filter((status) => status === "vigente").length,
    programadas: statuses.filter((status) => status === "programada").length,
    agotadas: statuses.filter((status) => status === "agotada").length,
    vencidas: statuses.filter((status) => status === "vencida").length,
    desactivadas: statuses.filter((status) => status === "desactivada").length,
  };
}

/** Texto corto del descuento: «20 %» o «$ 5.000». */
export function formatDiscount(type: "PERCENTAGE" | "FIXED", amount: number, currency: (value: number) => string): string {
  return type === "PERCENTAGE" ? `${amount} %` : currency(amount);
}

/** Días que faltan para que termine (negativo si ya venció). */
export function daysUntilEnd(endDate: Date | string, now = new Date()): number {
  return Math.ceil((new Date(endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Orden de la columna «Descuento»: primero los porcentajes (de menor a mayor)
 * y luego los montos fijos (de menor a mayor). Mezclar 20 (%) con 5 000 ($)
 * en una sola escala no ordena nada.
 */
export function compareDiscounts(
  a: { type: "PERCENTAGE" | "FIXED"; amount: number },
  b: { type: "PERCENTAGE" | "FIXED"; amount: number },
): number {
  if (a.type !== b.type) return a.type === "PERCENTAGE" ? -1 : 1;
  return a.amount - b.amount;
}
