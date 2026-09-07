import { ErrorFactory } from "@/lib/api-errors";

/**
 * `null`/empty disables free shipping; otherwise a non-negative integer in COP.
 * Anything else is rejected so the storefront never shows a broken promise.
 */
export function parseFreeShippingThreshold(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount =
    typeof value === "string" ? Number(value.replace(/[.\s]/g, "")) : value;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
    throw ErrorFactory.InvalidRequest(
      "El umbral de envío gratis debe ser un número entero en pesos, o vacío para desactivarlo",
    );
  }
  return amount === 0 ? null : amount;
}
