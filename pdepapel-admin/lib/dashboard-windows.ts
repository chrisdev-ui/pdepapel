import { addDays, startOfDay } from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";

/**
 * Ventanas y límites de día que comparten el panel y sus pantallas.
 *
 * Viven aquí, y no en `lib/dashboard-today.ts`, porque los usa también código
 * de cliente (`envios/components/client.tsx` los alcanza vía
 * `lib/shipment-views.ts`) y `dashboard-today` importa la guardia de acceso,
 * que arrastra el Clerk de servidor. Un módulo `server-only` colado en el
 * paquete del navegador no lo ven ni `tsc` ni las pruebas: rompe en
 * `next build`, con el despliegue ya lanzado. Aquí no hay nada de servidor a
 * propósito; que siga así.
 */

const TZ = "America/Bogota";

/** Días que una guía puede llevar sin despacharse antes de dejar de contar. */
export const DISPATCH_WINDOW_DAYS = 30;
/** Días que se espera una transferencia antes de dejar de pedirla. */
export const TRANSFER_WINDOW_DAYS = 14;

/** Inicio y fin del día en Colombia, en UTC, más la fecha local. */
export function getColombiaDayBounds(now = new Date()) {
  const local = utcToZonedTime(now, TZ);
  const start = zonedTimeToUtc(startOfDay(local), TZ);
  const end = new Date(
    zonedTimeToUtc(startOfDay(addDays(local, 1)), TZ).getTime() - 1,
  );
  return { start, end, local };
}
