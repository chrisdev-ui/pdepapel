import { waitUntil } from "@vercel/functions";

/**
 * Trabajo que no debe retrasar la respuesta (correos, guías de EnvioClick)
 * pero que tiene que terminar.
 *
 * Antes se hacía con `setImmediate` y Vercel no lo esperaba: al responder,
 * una instancia sin más tráfico se congelaba con el envío a medias y lo
 * retomaba con la siguiente petición, ya con la conexión muerta. El
 * 2026-10-07 a las 08:38 (Bogotá) así se perdió el correo del pedido
 * ORD-1791380325794-318, al admin y a la clienta: el error salió casi dos
 * minutos después, dentro de otra petición (docs/ops/2026-10-07-incidente-correo-pedido.md).
 *
 * `waitUntil` le pide a Vercel que mantenga viva la función hasta que la
 * promesa termine (dentro de su `maxDuration`). El trabajo arranca ya, no
 * después de responder. Fuera de Vercel (pruebas, `next dev`) no hace nada:
 * la promesa corre igual. Nunca lanza: un fallo aquí no puede tumbar la
 * respuesta que ya se dio; cada tarea registra sus propios fallos.
 */
export function runInBackground(label: string, task: () => Promise<unknown>): void {
  const promise = Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(`[BACKGROUND] ${label} falló:`, error);
    });
  try {
    waitUntil(promise);
  } catch (error) {
    console.error(`[BACKGROUND] ${label}: waitUntil no disponible`, error);
  }
}
