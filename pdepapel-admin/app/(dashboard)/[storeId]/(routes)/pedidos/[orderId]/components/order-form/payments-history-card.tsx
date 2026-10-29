import { OrderPaymentKind, OrderStatus, PaymentMethod } from "@prisma/client";

import { getAmountDueNow, sumPrepaid } from "@/lib/order-payment-amounts";
import { currencyFormatter } from "@/lib/utils";

import type { GetOrderResult } from "../../server/get-order";
import { SectionCard } from "./section-card";

type Order = NonNullable<GetOrderResult["order"]>;

const KIND_LABELS: Record<OrderPaymentKind, string> = {
  DEPOSIT: "Anticipo",
  INSTALLMENT: "Abono",
  BALANCE: "Saldo",
};

const METHOD_LABELS: Partial<Record<PaymentMethod, string>> = {
  BankTransfer: "Transferencia o Bre-B",
  CASH: "Efectivo",
  Bold: "Bold",
  Wompi: "Wompi",
};

const dateFormatter = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });

/**
 * Lo que la clienta ha pagado de una preventa con anticipo: cada cobro con su
 * fecha, medio y valor, y lo acumulado. Mientras espera, «falta» es el total
 * menos lo pagado (el envío se suma al llegar); con todo pagado, «Saldo pagado».
 */
export function PaymentsHistoryCard({ order }: { order: Order }) {
  if (order.paymentPlan !== "DEPOSIT" || order.payments.length === 0) return null;

  let running = 0;
  const rows = order.payments.map((payment) => {
    running += Math.round(payment.amount);
    return { ...payment, running };
  });
  const paid = order.status === OrderStatus.PAID || order.status === OrderStatus.SENT ? running : sumPrepaid(order.payments);
  const remaining = order.status === OrderStatus.DEPOSIT_PAID ? getAmountDueNow(order, paid) : 0;

  return (
    <SectionCard id="pagos-clienta" title="Pagos de la clienta" description="Anticipo, abonos y saldo que ya entraron.">
      <ol className="divide-y rounded-lg border" aria-label="Historial de pagos">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{KIND_LABELS[row.kind]}</span>
              <span className="text-muted-foreground">
                {" · "}
                {row.paidAt ? dateFormatter.format(new Date(row.paidAt)) : "sin fecha"}
                {" · "}
                {METHOD_LABELS[row.method] ?? row.method}
              </span>
            </span>
            <span className="text-right tabular-nums">
              <strong>{currencyFormatter(row.amount)}</strong>
              <span className="block text-xs text-muted-foreground">Llevas {currencyFormatter(row.running)}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm" data-testid="payments-summary">
        Pagado <strong>{currencyFormatter(paid)}</strong> de {currencyFormatter(order.total)}
        {order.status === OrderStatus.DEPOSIT_PAID
          ? remaining > 0
            ? ` · falta ${currencyFormatter(remaining)} + envío`
            : " · Saldo pagado: al llegar solo falta el envío"
          : ""}
      </p>
    </SectionCard>
  );
}
