/**
 * La revisión de stock previa al envío, a prueba de fallos.
 *
 * `checkLiveStock` es una server action. Cuando la invocación falla —la más
 * típica: la clienta tenía el checkout abierto y entró un despliegue nuevo, así
 * que su acción ya no existe («Failed to find Server Action»)— la llamada
 * LANZA en el cliente. Y `onSubmit` no tenía `catch`, así que ese error se
 * escapaba, react-hook-form se lo tragaba y la clienta se quedaba mirando el
 * botón: ni pedido, ni aviso, ni nada.
 *
 * Esta revisión es una cortesía —sirve para que ajuste cantidades aquí en vez
 * de que se lo rechace el servidor—, no una validación. Si no se puede hacer,
 * se sigue: el servidor vuelve a comprobar el stock y responde 422 si algo se
 * agotó. Perder la cortesía es mucho mejor que perder la venta.
 */
export async function safeStockPrecheck<T extends object>(
  check: () => Promise<T>,
): Promise<{ stock: T | null; failed: boolean }> {
  try {
    return { stock: await check(), failed: false };
  } catch (error) {
    console.error(
      "[CHECKOUT] No se pudo revisar el stock antes de enviar; se continúa",
      error,
    );
    return { stock: null, failed: true };
  }
}
