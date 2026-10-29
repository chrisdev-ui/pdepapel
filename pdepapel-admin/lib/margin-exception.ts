/**
 * «Excepción de margen»: la dueña deja un producto bajo el margen mínimo a
 * propósito (precio competitivo, volumen) y escribe por qué. Lo usan la ficha
 * (validación) y las rutas de producto (qué se guarda). Puro: sin Prisma ni
 * errores de API, para que el formulario lo pueda importar.
 */

export const MARGIN_EXCEPTION_MIN_LENGTH = 3;
export const MARGIN_EXCEPTION_MAX_LENGTH = 255;

export const MARGIN_EXCEPTION_LENGTH_MESSAGE = `Escribe el motivo del precio bajo (entre ${MARGIN_EXCEPTION_MIN_LENGTH} y ${MARGIN_EXCEPTION_MAX_LENGTH} caracteres).`;

export type MarginExceptionInput = { ok: true; value: string | null | undefined } | { ok: false; message: string };

/**
 * Lo que llega en el cuerpo. `undefined` = no se toca (otras rutas y scripts
 * guardan productos sin este campo); null o vacío = se quita; texto = se
 * recorta y debe tener entre 3 y 255 caracteres.
 */
export function parseMarginExceptionReason(raw: unknown): MarginExceptionInput {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, message: MARGIN_EXCEPTION_LENGTH_MESSAGE };
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  if (value.length < MARGIN_EXCEPTION_MIN_LENGTH || value.length > MARGIN_EXCEPTION_MAX_LENGTH) {
    return { ok: false, message: MARGIN_EXCEPTION_LENGTH_MESSAGE };
  }
  return { ok: true, value };
}

export interface MarginExceptionFields {
  marginExceptionReason: string | null;
  marginExceptionAt: Date | null;
  marginExceptionBy: string | null;
}

/**
 * Las columnas a escribir. Quién y cuándo los pone el servidor, solo cuando
 * el motivo cambia; con el mismo motivo no se vuelve a sellar.
 */
export function marginExceptionWrite(
  reason: string | null | undefined,
  current: string | null | undefined,
  userId: string,
  now: Date = new Date(),
): Partial<MarginExceptionFields> {
  if (reason === undefined) return {};
  if (reason === null) {
    return current ? { marginExceptionReason: null, marginExceptionAt: null, marginExceptionBy: null } : {};
  }
  if (reason === current) return {};
  return { marginExceptionReason: reason, marginExceptionAt: now, marginExceptionBy: userId };
}

/** El error del formulario cuando «Precio bajo a propósito» está marcado; null si está bien. */
export function marginExceptionFormIssue(enabled: boolean | undefined, reason: string | null | undefined): string | null {
  if (!enabled) return null;
  const length = (reason ?? "").trim().length;
  return length < MARGIN_EXCEPTION_MIN_LENGTH || length > MARGIN_EXCEPTION_MAX_LENGTH ? MARGIN_EXCEPTION_LENGTH_MESSAGE : null;
}

/**
 * Cuándo la ficha ofrece la excepción: el mismo aviso de «por debajo del
 * margen mínimo» (con margen positivo). Bajo el costo tiene su propia casilla.
 */
export function marginExceptionApplies(
  margin: { profit: number; minimum: { below: boolean } | null } | null,
  priceBelowCost: boolean,
): boolean {
  return Boolean(margin?.minimum?.below && margin.profit >= 0 && !priceBelowCost);
}

/**
 * Lo que la ficha manda al guardar. Fuera del mínimo (o mientras se escribe
 * un precio) no se toca lo guardado; bajo el mínimo, desmarcada la quita y
 * marcada exige el motivo.
 */
export function marginExceptionSubmission({
  applies,
  enabled,
  reason,
}: {
  applies: boolean;
  enabled: boolean | undefined;
  reason: string | null | undefined;
}): { ok: true; value: string | null | undefined } | { ok: false; message: string } {
  if (!applies) return { ok: true, value: undefined };
  if (!enabled) return { ok: true, value: null };
  const issue = marginExceptionFormIssue(true, reason);
  return issue ? { ok: false, message: issue } : { ok: true, value: (reason ?? "").trim() };
}
