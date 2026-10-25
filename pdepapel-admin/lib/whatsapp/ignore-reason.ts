/** Motivo para ignorar un contacto. Sin nada de servidor: el diálogo del navegador lo valida igual. */
export const IGNORE_REASON_MIN_LENGTH = 10;
export const IGNORE_REASON_MAX_LENGTH = 500;

/** `null` cuando el motivo no sirve; si no, el motivo ya recortado. */
export function validateIgnoreReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const reason = raw.trim().replace(/\s+/g, " ");
  if (reason.length < IGNORE_REASON_MIN_LENGTH) return null;
  return reason.slice(0, IGNORE_REASON_MAX_LENGTH);
}
