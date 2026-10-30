import { OrderPaymentKind, OrderPaymentStatus, OrderStatus, PaymentMethod, type Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { PREPAYMENT_KINDS, sumPrepaid } from "@/lib/order-payment-amounts";

/**
 * Cancelar un pedido con anticipo deja escrito qué pasó con la plata, en tres
 * partes que suman lo que la clienta pagó (anticipo + abonos):
 *
 *  - Devuelto: valor, fecha y medio de la devolución que Paula hizo a mano.
 *  - Retenido: lo que se queda la tienda. Nunca más que el anticipo pactado
 *    («Solo el anticipo no es reembolsable», términos 2026-10-29) y nunca
 *    nada si la preventa no le alcanzó («si el producto no llega, te
 *    devolvemos todo»).
 *  - Saldo a favor: lo que queda para una compra futura.
 *
 * Cada parte es una fila del historial de pagos (`OrderPayment`) con su tipo;
 * ninguna cuenta como dinero recibido (`PREPAYMENT_KINDS` no las incluye).
 */

export const SETTLEMENT_KINDS: OrderPaymentKind[] = [OrderPaymentKind.REFUND, OrderPaymentKind.RETAINED, OrderPaymentKind.STORE_CREDIT];

export const REFUND_METHODS: PaymentMethod[] = [PaymentMethod.BankTransfer, PaymentMethod.CASH, PaymentMethod.Bold, PaymentMethod.Wompi];

export const SETTLEMENT_REQUIRED_MESSAGE =
  "Este pedido tiene anticipo o abonos: cancélalo desde el pedido para anotar qué pasa con el dinero (devuelto, retenido o saldo a favor).";

export interface CancelSettlementInput {
  refunded: number;
  refundMethod?: PaymentMethod | null;
  refundedAt?: Date | null;
  refundReference?: string | null;
  retained: number;
  storeCredit: number;
  note?: string | null;
}

export interface CancelSettlementContext {
  /** Pagó algo antes del saldo y el pedido sigue con anticipo: cancelar exige anotar la plata. */
  required: boolean;
  prepaid: number;
  /** Lo máximo que se puede retener: el anticipo pactado, o 0 si la preventa no le alcanzó. */
  maxRetained: number;
  unfulfilled: boolean;
  /** El medio del anticipo: lo retenido y el saldo a favor no salen de ningún lado, se anotan con él. */
  depositMethod: PaymentMethod;
}

type SettlementOrder = {
  status: OrderStatus;
  depositAmount: number | null;
  payments: { kind: OrderPaymentKind; status: OrderPaymentStatus; amount: number; method: PaymentMethod; paidAt?: Date | null }[];
  orderItems: { isPreorder: boolean; preorderReleasedAt: Date | null; preorderUnfulfilledAt: Date | null }[];
};

export function settlementContext(order: SettlementOrder): CancelSettlementContext {
  // Un anticipo anotado antes de que existieran las filas de pago no deja la
  // fila: el pedido sigue con anticipo, así que cuenta lo pactado (como el correo).
  const recorded = sumPrepaid(order.payments);
  const prepaid =
    recorded > 0 || order.status !== OrderStatus.DEPOSIT_PAID ? recorded : Math.max(0, Math.round(Number(order.depositAmount ?? 0)));
  const unfulfilled = order.orderItems.some((item) => item.isPreorder && !item.preorderReleasedAt && Boolean(item.preorderUnfulfilledAt));
  const deposit = order.payments.find(
    (payment) => payment.kind === OrderPaymentKind.DEPOSIT && payment.status === OrderPaymentStatus.APPROVED,
  );
  const firstPrepaid = deposit ?? order.payments.find((payment) => PREPAYMENT_KINDS.includes(payment.kind) && payment.status === OrderPaymentStatus.APPROVED);
  return {
    required: order.status === OrderStatus.DEPOSIT_PAID && prepaid > 0,
    prepaid,
    maxRetained: unfulfilled ? 0 : Math.min(prepaid, Math.max(0, Math.round(Number(order.depositAmount ?? 0)))),
    unfulfilled,
    depositMethod: firstPrepaid?.method ?? PaymentMethod.BankTransfer,
  };
}

const asAmount = (value: unknown, label: string): number => {
  if (value === undefined || value === null || value === "") return 0;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
    throw ErrorFactory.InvalidRequest(`${label} debe ser un valor entero en pesos, cero o más.`);
  }
  return amount;
};

/** Lee el cuerpo `settlement` del PATCH; null si no vino. */
export function parseCancelSettlement(raw: unknown, now = new Date()): CancelSettlementInput | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") throw ErrorFactory.InvalidRequest("«settlement» no es válido.");
  const body = raw as Record<string, unknown>;
  const refunded = asAmount(body.refunded, "Lo devuelto");
  const method = body.refundMethod;
  if (refunded > 0 && !REFUND_METHODS.includes(method as PaymentMethod)) {
    throw ErrorFactory.InvalidRequest("Elige por dónde devolviste el dinero.");
  }
  let refundedAt: Date | null = null;
  if (refunded > 0) {
    refundedAt = typeof body.refundedAt === "string" || body.refundedAt instanceof Date ? new Date(body.refundedAt) : null;
    if (!refundedAt || Number.isNaN(refundedAt.getTime())) throw ErrorFactory.InvalidRequest("Anota la fecha de la devolución.");
    // El mismo día en Bogotá puede ir unas horas adelante del servidor.
    if (refundedAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
      throw ErrorFactory.InvalidRequest("La fecha de la devolución no puede estar en el futuro.");
    }
  }
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  return {
    refunded,
    refundMethod: refunded > 0 ? (method as PaymentMethod) : null,
    refundedAt,
    refundReference: text(body.refundReference, 191),
    retained: asAmount(body.retained, "Lo retenido"),
    storeCredit: asAmount(body.storeCredit, "El saldo a favor"),
    note: text(body.note, 500),
  };
}

export function assertSettlementBalances(context: CancelSettlementContext, input: CancelSettlementInput) {
  if (input.retained > context.maxRetained) {
    throw ErrorFactory.InvalidRequest(
      context.unfulfilled
        ? "La preventa no le alcanzó a este pedido: no se puede retener nada, se devuelve todo (o queda como saldo a favor)."
        : `Solo el anticipo no es reembolsable: puedes retener hasta ${context.maxRetained.toLocaleString("es-CO")}.`,
    );
  }
  const total = input.refunded + input.retained + input.storeCredit;
  if (total !== context.prepaid) {
    throw ErrorFactory.InvalidRequest(
      `Devuelto + retenido + saldo a favor deben sumar lo que pagó la clienta (${context.prepaid.toLocaleString("es-CO")}); suman ${total.toLocaleString("es-CO")}.`,
    );
  }
}

/** Escribe las filas del historial. Va dentro de la transacción de la cancelación. */
export async function writeCancelSettlement(
  tx: Pick<Prisma.TransactionClient, "orderPayment">,
  input: { storeId: string; orderId: string; context: CancelSettlementContext; settlement: CancelSettlementInput; createdBy: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const { settlement, context } = input;
  const rows: Prisma.OrderPaymentCreateManyInput[] = [];
  const base = { storeId: input.storeId, orderId: input.orderId, status: OrderPaymentStatus.APPROVED, createdBy: input.createdBy, note: settlement.note };
  if (settlement.refunded > 0) {
    rows.push({
      ...base,
      kind: OrderPaymentKind.REFUND,
      amount: settlement.refunded,
      method: settlement.refundMethod ?? context.depositMethod,
      paidAt: settlement.refundedAt ?? now,
      transactionId: settlement.refundReference,
    });
  }
  if (settlement.retained > 0) {
    rows.push({ ...base, kind: OrderPaymentKind.RETAINED, amount: settlement.retained, method: context.depositMethod, paidAt: now });
  }
  if (settlement.storeCredit > 0) {
    rows.push({ ...base, kind: OrderPaymentKind.STORE_CREDIT, amount: settlement.storeCredit, method: context.depositMethod, paidAt: now });
  }
  if (rows.length > 0) await tx.orderPayment.createMany({ data: rows });
}

/** Lo que el panel carga para decidir: pagos y líneas de preventa del pedido. */
export const SETTLEMENT_ORDER_SELECT = {
  status: true,
  depositAmount: true,
  payments: { select: { kind: true, status: true, amount: true, method: true, paidAt: true } },
  orderItems: { select: { isPreorder: true, preorderReleasedAt: true, preorderUnfulfilledAt: true } },
} satisfies Prisma.OrderSelect;
