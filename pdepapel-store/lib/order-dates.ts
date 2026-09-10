import { isValid } from "date-fns";
import { es } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";

type OrderDateStyle = "short" | "long" | "day";

const PATTERNS: Record<OrderDateStyle, string> = {
  /** "9 sep, 20:14" */
  short: "d MMM, HH:mm",
  /** "martes 9 de septiembre de 2026, 20:14" */
  long: "EEEE d 'de' MMMM 'de' yyyy, HH:mm",
  /** "9 de septiembre de 2026" */
  day: "d 'de' MMMM 'de' yyyy",
};

/**
 * The shop sells in Colombia only, and the server (Vercel, UTC) and the
 * customer's browser must print the same text or React reports a hydration
 * mismatch. Every order date is therefore rendered in Bogotá time.
 */
export const ORDER_TIME_ZONE = "America/Bogota";

/** Spanish order dates in Bogotá time; invalid input renders as an empty string instead of throwing. */
export function formatOrderDate(
  value: string | Date | null | undefined,
  style: OrderDateStyle = "day",
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!isValid(date)) return "";
  return formatInTimeZone(date, ORDER_TIME_ZONE, PATTERNS[style], {
    locale: es,
  });
}
