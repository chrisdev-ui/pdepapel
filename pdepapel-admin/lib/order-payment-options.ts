import { PaymentMethod } from "@prisma/client";

export interface AdminOrderPaymentOption {
  value: PaymentMethod;
  label: string;
  historical?: boolean;
}

const ACTIVE_ADMIN_PAYMENT_OPTIONS: AdminOrderPaymentOption[] = [
  {
    value: PaymentMethod.Bold,
    label: "Pago en línea",
  },
  {
    value: PaymentMethod.BankTransfer,
    label: "Transferencia bancaria directa (Bancolombia / Nequi)",
  },
  {
    value: PaymentMethod.COD,
    label: "Pago contra entrega (Efectivo / Datáfono)",
  },
  {
    value: PaymentMethod.CASH,
    label: "Pago en efectivo (Presencial)",
  },
];

const HISTORICAL_PAYMENT_LABELS: Partial<Record<PaymentMethod, string>> = {
  [PaymentMethod.Wompi]: "Pago en línea de esta orden (método histórico)",
  [PaymentMethod.PayU]: "Pago en línea de esta orden (método histórico)",
};

export function getAdminOrderPaymentOptions(
  currentMethod?: PaymentMethod,
): AdminOrderPaymentOption[] {
  const historicalLabel = currentMethod
    ? HISTORICAL_PAYMENT_LABELS[currentMethod]
    : undefined;

  if (!currentMethod || !historicalLabel) {
    return ACTIVE_ADMIN_PAYMENT_OPTIONS;
  }

  return [
    {
      value: currentMethod,
      label: historicalLabel,
      historical: true,
    },
    ...ACTIVE_ADMIN_PAYMENT_OPTIONS,
  ];
}
