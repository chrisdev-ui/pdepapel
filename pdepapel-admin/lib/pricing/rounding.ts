/** El precio terminado en 900 más alto que no pasa de `value` (117.656 → 116.900). */
export function roundDown900(value: number): number {
  if (value < 900) return 0;
  return Math.floor((value - 900) / 1000) * 1000 + 900;
}

/** El precio terminado en 900 más bajo que no baja de `value`. */
export function roundUp900(value: number): number {
  return Math.max(900, Math.ceil((value - 900) / 1000) * 1000 + 900);
}

/** Al peso hacia arriba; el margen de error evita que 10.000,0000001 suba a 10.001. */
export const ceilPeso = (value: number) => Math.ceil(value - 1e-6);
