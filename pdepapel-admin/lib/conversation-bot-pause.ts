/**
 * Cuánto lleva el bot callado en una conversación, y cuánto le queda.
 *
 * Módulo **neutro a propósito**: sin Prisma, sin `server-only`, sin nada del
 * servidor. Lo leen a la vez los cargadores del servidor y las tablas del
 * panel, que son componentes de cliente. `lib/conversations.ts` no sirve para
 * esto porque arrastra `prismadb`, y `lib/whatsapp/bot.ts` arrastra medio bot.
 *
 * Es la misma lección de `lib/business-growth-sections.ts`: un ayudante puro
 * exportado desde un módulo de servidor se convierte en una referencia de
 * cliente y revienta al pintar, no al compilar.
 */

/**
 * Cuánto se aparta el bot después de que Paula escriba.
 *
 * Un día: cubre que ella conteste de noche y siga por la mañana. Pasado eso el
 * hilo se da por frío y el bot vuelve a atender.
 */
export const OWNER_TAKEOVER_WINDOW_HOURS = 24;

const WINDOW_MS = OWNER_TAKEOVER_WINDOW_HOURS * 60 * 60 * 1000;

export interface BotPause {
  /** El bot está callado ahora mismo en esta conversación. */
  paused: boolean;
  /** Milisegundos que le quedan de silencio. `0` si ya volvió. */
  remainingMs: number;
}

/**
 * La única cuenta que decide si el bot habla. La usan el bot para callarse y
 * el panel para decírselo a Paula, y tiene que ser la misma en los dos sitios:
 * si el panel dijera «vuelve en 2 h» y el bot volviera antes, el aviso sería
 * peor que no tenerlo.
 */
export function describeBotPause(
  lastOwnerAt: Date | string | null | undefined,
  now: Date = new Date(),
): BotPause {
  if (!lastOwnerAt) return { paused: false, remainingMs: 0 };
  const since = lastOwnerAt instanceof Date ? lastOwnerAt : new Date(lastOwnerAt);
  if (Number.isNaN(since.getTime())) return { paused: false, remainingMs: 0 };
  const remainingMs = since.getTime() + WINDOW_MS - now.getTime();
  return remainingMs > 0
    ? { paused: true, remainingMs }
    : { paused: false, remainingMs: 0 };
}

/**
 * Lo que se le enseña a Paula. En horas mientras quede más de una, y en
 * minutos en el último tramo: «vuelve en 0 h» se lee como si estuviera roto.
 */
export function formatBotPause(pause: BotPause): string | null {
  if (!pause.paused) return null;
  const minutes = Math.ceil(pause.remainingMs / 60000);
  if (minutes < 60) {
    return `Bot en pausa · vuelve en ${minutes} min`;
  }
  const hours = Math.round(pause.remainingMs / 3600000);
  return `Bot en pausa · vuelve en ${hours} h`;
}

/**
 * ¿Tiene sentido ofrecer «Reanudar»? Solo si hay algo que reanudar: sin freno
 * puesto, el botón no haría nada y de todas formas se mostraba encendido.
 */
export function canHandBackToBot(
  lastOwnerAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  return describeBotPause(lastOwnerAt, now).paused;
}
