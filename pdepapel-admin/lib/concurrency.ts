/**
 * Ejecuta `worker` sobre cada elemento con como máximo `limit` llamadas en
 * vuelo. Conserva el orden de los resultados. Sirve para no disparar una
 * ráfaga de peticiones a un servicio externo (Mercado Libre limita por app).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}
