import { STOREFRONT_ROUTES } from "@/lib/routes";
import { currencyFormatter } from "@/lib/utils";

/** Textos de la preventa con anticipo (tienda). Redacción para revisión de Paula y legal. */

const money = (value: number) => currencyFormatter.format(value);

export const PRESALE_TERMS_HREF = `${STOREFRONT_ROUTES.termsPolicy}#preventas`;

export const DEPOSIT_NO_COUPON_NOTE = "Una preventa con anticipo no lleva cupón ni tarjeta de regalo";
export const DEPOSIT_SHIPPING_NOTE = "El envío se cotiza y se paga con el saldo";
/** Igual que `DEPOSIT_PRESALE_SHIPPING_LABEL` del panel (lib/presale.ts). */
export const DEPOSIT_SHIPPING_LABEL = "Se cotiza cuando llegue (se paga con el saldo)";
export const PRESALE_HOW_IT_WORKS_TITLE = "Cómo funciona la preventa";
export const PRESALE_WAITLIST_HEADING = "¿Prefieres esperar? Te avisamos cuando llegue";

/** Bajo el precio de la ficha: «Resérvalo hoy con $30.000 de anticipo · Saldo de $130.000 + envío cuando llegue». */
export function depositTeaser(depositNow: number, balance: number): string {
  return `Resérvalo hoy con ${money(depositNow)} de anticipo · Saldo de ${money(balance)} + envío cuando llegue`;
}

/**
 * Qué no se devuelve si la clienta desiste. Un solo lugar (ficha, caja y
 * términos). Redacción por defecto del 2026-10-29, pendiente de revisión de
 * Paula y la abogada: solo el anticipo se retiene; los abonos por encima, no.
 * Cambiar la frase es un cambio de términos: sube la versión en
 * lib/legal-versions.ts de las dos apps.
 */
export const PRESALE_NON_REFUNDABLE = "Solo el anticipo no es reembolsable";
export const PRESALE_EXCESS_REFUND = "lo abonado por encima se devuelve o queda como saldo a favor";

/** «Solo los primeros $30.000 por unidad no son reembolsables, salvo…; lo abonado por encima…». Sin valor, la frase general. */
export function presaleRefundRule(unitDeposit?: number): string {
  const retained = unitDeposit ? `Solo los primeros ${money(unitDeposit)} por unidad no son reembolsables` : PRESALE_NON_REFUNDABLE;
  return `${retained}, salvo el derecho de retracto de ley o si el producto no llega; ${PRESALE_EXCESS_REFUND}`;
}

/** Los cinco puntos fijos de «Cómo funciona la preventa»; el anticipo es por unidad. */
export function presaleHowItWorks(unitDeposit: number): string[] {
  return [
    `Hoy pagas un anticipo de ${money(unitDeposit)} por unidad y tu producto queda apartado.`,
    "Cuando llegue te escribimos para coordinar el pago del saldo y el envío; ahí lo despachamos.",
    "El precio queda fijo desde que reservas.",
    `${presaleRefundRule(unitDeposit)}. Si el producto no llega, te devolvemos todo.`,
    "La preventa se compra sola: no se mezcla con otros productos en el mismo pedido.",
  ];
}

/** La casilla obligatoria del checkout, con el anticipo de este pedido. */
export function depositTermsCheckboxText(depositNow: number): string {
  return `Acepto las condiciones de la preventa: hoy pago un anticipo de ${money(depositNow)}; el saldo y el envío los pago cuando llegue el producto. ${presaleRefundRule()}.`;
}

export function depositSubmitLabel(depositNow: number): string {
  return `Pagar anticipo ${money(depositNow)}`;
}

/** Pedido pendiente: «Paga el anticipo de $X para apartar tu preventa». */
export function depositPendingText(depositAmount: number): string {
  return `Paga el anticipo de ${money(depositAmount)} para apartar tu preventa`;
}

/** Pedido con el anticipo recibido. */
/** La línea de avance de una preventa con abonos en /pedido. */
export function depositProgressText(paid: number, balance: number): string {
  return balance > 0 ? `Llevas ${money(paid)} pagado · faltan ${money(balance)} + envío` : `Llevas ${money(paid)} pagado · solo falta el envío`;
}

export function depositPaidText(depositAmount: number, balance: number): string {
  return `Recibimos tu anticipo de ${money(depositAmount)}. Saldo pendiente: ${money(balance)} + envío, que pagas cuando llegue el producto. Te escribimos cuando llegue para coordinar el pago.`;
}
