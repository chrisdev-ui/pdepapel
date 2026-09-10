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

/**
 * Umbral de "stock crítico" por tienda. `null`/vacío usa el valor por defecto
 * de la aplicación; en otro caso, un entero de al menos 1 (un umbral de 0
 * nunca marcaría nada, para eso está la vista "Agotados").
 */
export function parseLowStockThreshold(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const units =
    typeof value === "string" ? Number(value.trim()) : value;
  if (typeof units !== "number" || !Number.isInteger(units) || units < 1) {
    throw ErrorFactory.InvalidRequest(
      "El umbral de stock crítico debe ser un número entero de al menos 1, o vacío para usar el valor por defecto",
    );
  }
  return units;
}
