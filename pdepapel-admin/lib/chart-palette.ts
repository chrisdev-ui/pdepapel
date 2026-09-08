/**
 * Paleta de gráficas del panel (rediseño 2026-09).
 *
 * Recharts pinta en SVG con valores concretos, así que aquí viven los hex
 * equivalentes a los tokens de `app/globals.css` (kawaii-* y tint-*). Úsala
 * en vez de hex sueltos: las series se leen igual en todas las pantallas y
 * los ejes usan siempre el mismo gris.
 */
export const CHART_COLORS = {
  /** Azul Yankees: la serie principal (ventas, ingresos). */
  primary: "#221B41",
  /** Rosa concha: la segunda serie o la ganancia frente a la venta. */
  pink: "#FEA4C3",
  /** Azul bebé: comparativos, periodo anterior. */
  sky: "#A4C3FE",
  /** Lila: terceras series. */
  lavender: "#B2A4FE",
  /** Amarillo estrella: alertas suaves, pendientes. */
  yellow: "#FFC105",
  /** Menta: utilidad, positivo. */
  mint: "#5FC98D",
  /** Coral (froly): negativo, cancelado, riesgo. */
  coral: "#F9789A",
  /** Rejilla y ejes. */
  grid: "#E5E7EB",
  axis: "#6B7280",
} as const;

/** Orden por defecto para series categóricas (tortas, barras apiladas). */
export const CHART_SERIES: readonly string[] = [
  CHART_COLORS.primary,
  CHART_COLORS.pink,
  CHART_COLORS.sky,
  CHART_COLORS.lavender,
  CHART_COLORS.yellow,
  CHART_COLORS.mint,
  CHART_COLORS.coral,
];

export function seriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length];
}
