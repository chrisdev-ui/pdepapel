/**
 * Los datos para pagar por transferencia, de un solo sitio: la configuración
 * de la tienda (`StoreSettings`). La página del pedido, el checkout y el correo
 * de «Pendiente de pago» leen esto; nunca una cuenta escrita en el código.
 */
export interface BankTransferInfo {
  account: string | null;
  breBKey: string | null;
  whatsappNumber: string | null;
}

export type BankTransferField = keyof BankTransferInfo;

/** Lo que la clienta ve cuando falta algún dato, en vez de un bloque vacío. */
export const BANK_TRANSFER_FALLBACK_TEXT = "Escríbenos por WhatsApp para los datos de pago";

export function bankTransferInfoFrom(settings: {
  paymentBancolombiaAccount: string | null;
  paymentBreBKey: string | null;
  whatsappNumber: string | null;
} | null): BankTransferInfo {
  return {
    account: settings?.paymentBancolombiaAccount?.trim() || null,
    breBKey: settings?.paymentBreBKey?.trim() || null,
    whatsappNumber: settings?.whatsappNumber?.trim() || null,
  };
}

export function missingBankTransferFields(info: BankTransferInfo): BankTransferField[] {
  return (Object.keys(info) as BankTransferField[]).filter((field) => !info[field]);
}

/** Falta un dato de pago: se dice fuerte en los registros (solo nombres de campo, nunca valores). */
export function logIncompleteBankTransfer(context: string, missing: BankTransferField[]): void {
  if (missing.length === 0) return;
  console.error(`[BANK_TRANSFER_INFO] ${context}: faltan ${missing.join(", ")} en Configuración › Información del negocio`);
}
