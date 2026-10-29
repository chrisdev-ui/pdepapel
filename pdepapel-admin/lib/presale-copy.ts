import { formatAvailableAt } from "@/lib/product-availability";

/**
 * Textos de una preventa que se repiten en el panel, los correos y el bot.
 * Puro y sin dependencias de servidor: lo usan componentes de cliente.
 */

export interface PresaleCopyInput {
  expectedArrivalAt: Date | string | null;
  expectedArrivalText?: string | null;
  paymentMode?: "FULL" | "DEPOSIT" | string | null;
  depositType?: "FIXED" | "PERCENT" | string | null;
  depositValue?: number | null;
}

/** «Fecha estimada: 5 de diciembre» / «… primera semana de diciembre» / «… por confirmar». */
export function describePresaleArrival(presale: PresaleCopyInput): string {
  if (presale.expectedArrivalAt) return `Fecha estimada: ${formatAvailableAt(presale.expectedArrivalAt)}`;
  const text = presale.expectedArrivalText?.trim();
  return `Fecha estimada: ${text || "por confirmar"}`;
}

export function describePresaleDeposit(presale: PresaleCopyInput, money: (value: number) => string): string {
  if (presale.paymentMode !== "DEPOSIT") return "Se paga completo al reservar.";
  const value = Number(presale.depositValue ?? 0);
  if (presale.depositType === "PERCENT") return `Anticipo del ${value} % al reservar; el saldo y el envío, cuando llegue.`;
  return `Anticipo de ${money(value)} por unidad al reservar; el saldo y el envío, cuando llegue.`;
}
