/**
 * Ejecuta `worker` sobre cada elemento con como mucho `limit` promesas en
 * vuelo, conservando el orden de los resultados. Sustituye a los bucles
 * `for … await` que hacían 120 peticiones en fila al generar variantes.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}
