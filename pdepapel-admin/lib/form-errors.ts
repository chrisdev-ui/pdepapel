/**
 * Primer mensaje de error de un formulario, buscando en profundidad (líneas
 * de productos incluidas). Lo usan el toast de validación y las acciones de
 * estado del pedido; antes cada uno tenía su copia.
 */
export function getFirstFormErrorMessage(errors: unknown): string | undefined {
  if (!errors || typeof errors !== "object") return undefined;
  const values = Array.isArray(errors)
    ? errors
    : Object.values(errors as Record<string, unknown>);
  for (const value of values) {
    if (!value) continue;
    if (
      typeof value === "object" &&
      "message" in (value as object) &&
      typeof (value as { message?: unknown }).message === "string"
    ) {
      return (value as { message: string }).message;
    }
    const nested = getFirstFormErrorMessage(value);
    if (nested) return nested;
  }
  return undefined;
}
