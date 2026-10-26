import type { BankTransferInfo } from "@/types";

/**
 * Los datos para pagar por transferencia vienen de Configuración en el panel
 * (`StoreSettings`), por la API pública de la tienda. Nunca escritos aquí.
 */
export const EMPTY_BANK_TRANSFER: BankTransferInfo = { account: null, breBKey: null, whatsappNumber: null };

/** Lo que ve la clienta cuando falta un dato, en vez de un bloque vacío. */
export const BANK_TRANSFER_FALLBACK_TEXT = "Escríbenos por WhatsApp para los datos de pago";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export function parseBankTransfer(value: unknown): BankTransferInfo {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const whatsapp = text(raw.whatsappNumber);
  return {
    account: text(raw.account),
    breBKey: text(raw.breBKey),
    whatsappNumber: whatsapp && /^57\d{10}$/.test(whatsapp) ? whatsapp : null,
  };
}

export function missingBankTransferFields(info: BankTransferInfo): (keyof BankTransferInfo)[] {
  return (Object.keys(info) as (keyof BankTransferInfo)[]).filter((field) => !info[field]);
}

/** Falta un dato de pago: se dice fuerte en los registros (solo los nombres de campo). */
export function reportIncompleteBankTransfer(where: string, info: BankTransferInfo): void {
  const missing = missingBankTransferFields(info);
  if (missing.length === 0) return;
  console.error(`[BANK_TRANSFER_INFO] ${where}: faltan ${missing.join(", ")} en Configuración › Información del negocio`);
}

/** «573001234567» → «300 123 4567». */
export function formatWhatsappNumber(normalized: string): string {
  const local = normalized.startsWith("57") ? normalized.slice(2) : normalized;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
