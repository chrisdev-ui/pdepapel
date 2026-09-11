import { format, isValid, parseISO } from "date-fns";

const ISO_DAY = "yyyy-MM-dd";
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Convierte cualquier valor de fecha que pueda llegar a un formulario
 * (Date, ISO string, borrador restaurado de localStorage, null) a un Date
 * válido, o `undefined` si no se puede interpretar.
 */
export function coerceDate(value: unknown): Date | undefined {
  if (value instanceof Date) return isValid(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return isValid(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Valor `yyyy-MM-dd` para `DateField` a partir de un campo de formulario.
 * Nunca lanza: un valor inválido o vacío produce "" (campo vacío).
 */
export function toDateInputValue(value: unknown): string {
  const date = coerceDate(value);
  return date ? format(date, ISO_DAY) : "";
}

/** `true` cuando la cadena es un instante ISO tal como lo serializa JSON.stringify(Date). */
export function isIsoInstantString(value: unknown): value is string {
  return typeof value === "string" && ISO_INSTANT.test(value);
}

/**
 * Recorre un objeto plano (por ejemplo, un borrador leído de localStorage) y
 * devuelve una copia donde los instantes ISO vuelven a ser `Date`. Los
 * formularios guardan `Date`; JSON los convierte en texto y date-fns no acepta
 * texto en `format`.
 */
export function reviveDates<T>(value: T): T {
  if (isIsoInstantString(value)) {
    return (coerceDate(value) ?? value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => reviveDates(item)) as T;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = reviveDates(item);
    }
    return out as T;
  }
  return value;
}
