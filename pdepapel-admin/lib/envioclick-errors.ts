/**
 * EnvioClick cobra cada guía del saldo prepagado de la cuenta. Sin saldo responde «No tiene suficiente
 * crédito disponible en su cuenta» (2026-11-03). El cliente marca el error con `reason` antes de
 * limpiar el mensaje para los registros, y el aviso a la dueña lee ese `reason`.
 */
export const INSUFFICIENT_CREDIT_REASON = "insufficient_credit";

const INSUFFICIENT_CREDIT_TEXT = /no tiene suficiente cr[eé]dito|saldo insuficiente|insufficient (?:credit|balance|funds)/i;

export function mentionsInsufficientCredit(text: string): boolean {
  return INSUFFICIENT_CREDIT_TEXT.test(text);
}

export function hasInsufficientCreditReason(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth++) {
    if ((current as { reason?: unknown }).reason === INSUFFICIENT_CREDIT_REASON) return true;
    current = (current as { originalError?: unknown }).originalError;
  }
  return false;
}
