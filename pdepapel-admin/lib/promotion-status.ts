/**
 * Estado real de una promoción (oferta o cupón) según su vigencia.
 *
 * `isActive` es el interruptor manual; las fechas dicen si ya empezó o ya
 * terminó y mandan sobre el interruptor cuando la promoción venció. La combinación da un estado legible para la lista sin tocar la
 * lógica de aplicación de descuentos.
 */

export type PromotionStatus = "vigente" | "programada" | "vencida" | "desactivada";

export interface PromotionWindow {
  isActive: boolean;
  startDate: Date | string;
  endDate: Date | string;
}

export const PROMOTION_STATUS: Record<PromotionStatus, { label: string; tone: "mint" | "sky" | "slate" | "pink" }> = {
  vigente: { label: "Vigente", tone: "mint" },
  programada: { label: "Programada", tone: "sky" },
  vencida: { label: "Vencida", tone: "slate" },
  desactivada: { label: "Desactivada", tone: "pink" },
};

export function getPromotionStatus(promotion: PromotionWindow, now = new Date()): PromotionStatus {
  const start = new Date(promotion.startDate);
  const end = new Date(promotion.endDate);
  // El cron diario apaga las promociones al vencer: una vencida se lee como
  // «Vencida» aunque el interruptor esté en off. «Desactivada» es solo la
  // apagada a mano antes de tiempo.
  if (now > end) return "vencida";
  if (!promotion.isActive) return "desactivada";
  if (now < start) return "programada";
  return "vigente";
}

export interface PromotionSummary {
  total: number;
  vigentes: number;
  programadas: number;
  vencidas: number;
  desactivadas: number;
}

export function summarizePromotions(statuses: PromotionStatus[]): PromotionSummary {
  return {
    total: statuses.length,
    vigentes: statuses.filter((status) => status === "vigente").length,
    programadas: statuses.filter((status) => status === "programada").length,
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
