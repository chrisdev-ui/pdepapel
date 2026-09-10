import { format, isValid } from "date-fns";
import { es } from "date-fns/locale";

type OrderDateStyle = "short" | "long" | "day";

const PATTERNS: Record<OrderDateStyle, string> = {
  /** "9 sep, 20:14" */
  short: "d MMM, HH:mm",
  /** "martes 9 de septiembre de 2026, 20:14" */
  long: "EEEE d 'de' MMMM 'de' yyyy, HH:mm",
  /** "9 de septiembre de 2026" */
  day: "d 'de' MMMM 'de' yyyy",
};

/** Spanish order dates; invalid input renders as an empty string instead of throwing. */
export function formatOrderDate(
  value: string | Date | null | undefined,
  style: OrderDateStyle = "day",
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!isValid(date)) return "";
  return format(date, PATTERNS[style], { locale: es });
}
