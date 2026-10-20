import { OrderSource, OrderType, PaymentMethod } from "@prisma/client";

/**
 * La comisión de pasarela de un cobro: una sola tabla para finanzas, el
 * cálculo de cápsulas y cualquier precio que la necesite.
 *
 * `null` = no se conoce. Nunca se reemplaza por 0: un 0 infla el margen sin
 * que nadie lo note. Las retenciones (ReteRenta, ReteIVA) no son costo y no
 * van aquí.
 */

type PercentPlusFixed = { percent: number; fixed: number; vat: number };

/**
 * Bold: tarifa pública de Bold consultada el 2026-10-20 (no es una
 * liquidación de la tienda), tramo de ventas de $0 a $10 millones al mes.
 * - https://bold.co/tarifas
 * - https://bold.co/pagos-en-linea/link-de-pago
 *
 * La página publica tres planes según a dónde llega el dinero. Las tarifas
 * van antes de IVA y retenciones: el IVA se suma sobre la comisión. No se
 * cuentan el 1 % adicional de las tarjetas internacionales ni el tramo de
 * $10 a $20 millones.
 */
export const BOLD_PUBLIC_RATES = {
  /** Al día siguiente en la Cuenta digital Bold (Visa o Mastercard; otras tarjetas, 3,29 % / 2,99 %). */
  nextDayBoldAccount: { online: { percent: 0.0299, fixed: 900, vat: 0.19 }, terminal: { percent: 0.0269, fixed: 300, vat: 0.19 } },
  /** De inmediato en la Cuenta digital Bold, cualquier tarjeta. */
  instantBoldAccount: { online: { percent: 0.0359, fixed: 900, vat: 0.19 }, terminal: { percent: 0.0329, fixed: 300, vat: 0.19 } },
  /** En otros bancos, cualquier tarjeta. */
  otherBanks: { online: { percent: 0.0359, fixed: 900, vat: 0.19 }, terminal: { percent: 0.0329, fixed: 300, vat: 0.19 } },
} as const satisfies Record<string, { online: PercentPlusFixed; terminal: PercentPlusFixed }>;

/**
 * Paula recibe los pagos en su Cuenta digital Bold, al día siguiente
 * (confirmado el 2026-10-20). Se cuenta la tarifa de Visa o Mastercard; las
 * otras tarjetas cuestan 0,3 puntos más.
 */
export const BOLD_PAYOUT_PLAN: keyof typeof BOLD_PUBLIC_RATES = "nextDayBoldAccount";

export const BOLD_FEE_BASIS = "tarifa pública de Bold consultada el 2026-10-20";

/** Bold, pago en línea con tarjeta (link de pago / checkout). */
export const BOLD_ONLINE_FEE: PercentPlusFixed = BOLD_PUBLIC_RATES[BOLD_PAYOUT_PLAN].online;

/** Bold, cobro en el datáfono. */
export const BOLD_TERMINAL_FEE: PercentPlusFixed = BOLD_PUBLIC_RATES[BOLD_PAYOUT_PLAN].terminal;

/** Wompi: 2,65 % + $700, más IVA sobre la comisión. */
export const WOMPI_FEE = { percent: 0.0265, fixed: 700, vat: 0.19 } as const;

/**
 * Marca fija en `PaymentDetails.details` de un pedido cobrado en el datáfono.
 * La pone quien envía el cobro (punto de venta o «Cobrar en el datáfono» de
 * Pedidos) y el webhook de Bold la conserva al reescribir el detalle.
 */
export const BOLD_TERMINAL_MARKER = "cobro en datáfono Bold";

export type GatewayChannel = "online" | "terminal";

const round2 = (value: number) => Math.round(value * 100) / 100;

const percentPlusFixed = (amount: number, fee: PercentPlusFixed) =>
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
      return percentPlusFixed(validAmount, options.channel === "terminal" ? BOLD_TERMINAL_FEE : BOLD_ONLINE_FEE);
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
