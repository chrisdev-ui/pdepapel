/**
 * Older taxonomy rows keep a leading emoji inside `name` ("🎨 Creatividad &
 * Juego"); newer ones store it in `icon`. The storefront never renders emoji
 * in navigation, so every label goes through this before display.
 */
const LEADING_ICON_PATTERN =
  /^([^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9].*)$/u;

export function stripTaxonomyIcon(name: string | null | undefined): string {
  const value = (name ?? "").trim();
  const match = value.match(LEADING_ICON_PATTERN);
  return (match ? match[2] : value).trim();
}

const COP_FORMATTER = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** "$ 120.000" — the same spelling the price components use. */
export function formatCop(value: number): string {
  return COP_FORMATTER.format(value).replace(/ /g, " ");
}
