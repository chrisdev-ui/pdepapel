import { OrderSource, OrderType, PaymentMethod } from "@prisma/client";

/**
 * La comisión de pasarela de un cobro: una sola tabla para finanzas, el
 * cálculo de cápsulas y cualquier precio que la necesite.
 *
 * `null` = no se conoce. Nunca se reemplaza por 0: un 0 infla el margen sin
 * que nadie lo note. Las retenciones (ReteRenta, ReteIVA) no son costo y no
 * van aquí.
 */

/**
 * Bold, pago en línea con tarjeta (link de pago / checkout): 2,99 % + $900,
 * más IVA sobre la comisión.
 *
 * TARIFA PÚBLICA SIN VERIFICAR (2026-10-20): sale de las páginas públicas de
 * Bold, no de una liquidación de la tienda. Se reemplaza cuando Paula
 * descargue una liquidación real.
 * - https://bold.co/pagos-en-linea/link-de-pago
 * - https://bold.co/tarifas.html
 * - https://datafonos.bold.co/bienvenida-a-bold/tarifas/
 */
export const BOLD_ONLINE_FEE = { percent: 0.0299, fixed: 900, vat: 0.19, verified: false } as const;

/** Wompi: 2,65 % + $700, más IVA sobre la comisión. */
export const WOMPI_FEE = { percent: 0.0265, fixed: 700, vat: 0.19 } as const;

/**
 * El cobro en el datáfono Bold no tiene tarifa conocida (solo una referencia
 * no confirmada de 2,59 %): su comisión es `null` hasta tener la liquidación.
 */
export const BOLD_TERMINAL_FEE = null;

/**
 * Marca fija en `PaymentDetails.details` de un pedido cobrado en el datáfono.
 * La pone quien envía el cobro (punto de venta o «Cobrar en el datáfono» de
 * Pedidos) y el webhook de Bold la conserva al reescribir el detalle.
 */
export const BOLD_TERMINAL_MARKER = "cobro en datáfono Bold";

export type GatewayChannel = "online" | "terminal";

const round2 = (value: number) => Math.round(value * 100) / 100;

const percentPlusFixed = (amount: number, fee: { percent: number; fixed: number; vat: number }) =>
  round2((amount * fee.percent + fee.fixed) * (1 + fee.vat));

/**
 * Comisión de un cobro de `amount` por `method`. Efectivo, transferencia y
 * contra entrega no pasan por pasarela: 0. Lo desconocido: `null`.
 */
export function gatewayFee(
  amount: number,
  method: PaymentMethod | string | null | undefined,
  options: { channel?: GatewayChannel } = {},
): number | null {
  if (!method) return 0;
  const validAmount = Number(amount) || 0;
  switch (method) {
    case PaymentMethod.Wompi:
      return percentPlusFixed(validAmount, WOMPI_FEE);
    case PaymentMethod.Bold:
      return options.channel === "terminal" ? BOLD_TERMINAL_FEE : percentPlusFixed(validAmount, BOLD_ONLINE_FEE);
    default:
      return 0;
  }
}

/** Un cobro de Bold fue en el datáfono si la venta es presencial o el pago trae la marca. */
export function gatewayChannelOf(order: {
  type?: OrderType | string | null;
  source?: OrderSource | string | null;
  payment?: { details?: string | null } | null;
}): GatewayChannel {
  if (order.type === OrderType.POINT_OF_SALE) return "terminal";
  if (order.source === OrderSource.POS || order.source === OrderSource.FAIR) return "terminal";
  if (order.payment?.details?.includes(BOLD_TERMINAL_MARKER)) return "terminal";
  return "online";
}

/** El detalle nuevo del pago, sin perder la marca del datáfono si el anterior la tenía. */
export function keepTerminalMarker(previous: string | null | undefined, next: string): string {
  return previous?.includes(BOLD_TERMINAL_MARKER) && !next.includes(BOLD_TERMINAL_MARKER) ? `${next} | ${BOLD_TERMINAL_MARKER}` : next;
}
