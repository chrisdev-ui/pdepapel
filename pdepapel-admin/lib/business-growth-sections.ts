/**
 * Las tres vistas de adentro de «Resumen y caja», y cómo se leen de la URL.
 *
 * Viven aquí y no en `negocio/components/client.tsx` porque ese archivo lleva
 * `"use client"`: al otro lado de esa frontera Next solo deja cruzar
 * componentes, y cualquier otra exportación llega al servidor convertida en
 * una referencia de cliente. `isBusinessGrowthSection` importada así existe
 * —`tsc`, el lint, las 2.796 pruebas y `next build` pasan sin decir nada— pero
 * al renderizar la página estalla con «is not a function». Módulo aparte, sin
 * directiva, y lo usan los dos lados.
 */

export const BUSINESS_GROWTH_SECTIONS = [
  { id: "resumen", label: "Resumen" },
  { id: "caja", label: "Caja y distribución" },
  { id: "campanas", label: "Campañas actuales" },
] as const;

export type BusinessGrowthSection =
  (typeof BUSINESS_GROWTH_SECTIONS)[number]["id"];

export function isBusinessGrowthSection(
  value: string | undefined,
): value is BusinessGrowthSection {
  return BUSINESS_GROWTH_SECTIONS.some((section) => section.id === value);
}
