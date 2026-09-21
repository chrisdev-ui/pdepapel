import { slugify } from "../../lib/slugify";

/**
 * Un slug que no choque con los que ya se usaron en esta tanda.
 *
 * `Category` lleva `@@unique([storeId, slug])` y `slug` tiene `@default("")`:
 * si el sembrado no lo escribe, las veinte filas entran con la misma cadena
 * vacía y la segunda revienta. Además dos nombres distintos pueden dar el
 * mismo slug —«Bebés» y «Bebes»—, así que la unicidad hay que mirarla sobre el
 * slug y no sobre el nombre.
 */
export function uniqueSlug(
  name: string,
  taken: Set<string>,
  fallback: string,
): string {
  const base = slugify(name) || fallback;
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}

/**
 * Hasta `wanted` valores distintos, sin quedarse dando vueltas.
 *
 * Dos problemas que tenían los sembrados, y que no son el mismo:
 *
 * 1. Cuando el `Set` era de objetos literales —cada uno una referencia nueva—
 *    no quitaba ni un repetido: el bucle terminaba, pero con duplicados que
 *    luego chocaban contra un `@@unique`. Ese era el fallo de los colores.
 * 2. `while (set.size < N)` sobre un catálogo finito de faker no termina nunca
 *    si la lista tiene menos de N valores. Hoy ninguno está en ese caso, pero
 *    los diseños piden 10 de los 11 que existen: un margen de uno, a merced de
 *    que faker recorte la lista en cualquier versión.
 *
 * Devuelve lo que haya podido reunir, que en un sembrado de desarrollo es
 * mejor que fallar por dos valores de menos.
 */
export function collectUnique(
  wanted: number,
  generate: () => string,
  maxAttempts = wanted * 50,
): string[] {
  const values = new Set<string>();
  for (let attempt = 0; attempt < maxAttempts && values.size < wanted; attempt++) {
    values.add(generate());
  }
  return Array.from(values);
}
