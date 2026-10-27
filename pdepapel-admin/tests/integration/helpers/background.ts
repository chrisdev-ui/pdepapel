/**
 * Lo que las rutas dejan corriendo con `runInBackground` (correos, avisos de
 * envío), para que la limpieza de una prueba lo espere antes de borrar la
 * tienda.
 *
 * Sin esto un aviso de envío que salió al crear una guía escribía su fila de
 * `OrderNotification` después de que la limpieza ya había borrado los pedidos,
 * y `store.delete` fallaba por la relación (CI del 2026-10-26,
 * cod-gift-card-guide). En local casi nunca pasa: es una carrera.
 */
const pending = new Set<Promise<unknown>>();

export function trackBackground(promise: Promise<unknown>): void {
  pending.add(promise);
  void promise.finally(() => pending.delete(promise));
}

/** Espera lo pendiente, con tope: algunas tareas (caché, revalidación) nunca terminan en pruebas y no pueden colgar la limpieza. */
export async function drainBackground(maxMs = 5_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (pending.size > 0 && Date.now() < deadline) {
    const left = deadline - Date.now();
    await Promise.race([Promise.allSettled(Array.from(pending)), new Promise((resolve) => setTimeout(resolve, left))]);
  }
}
