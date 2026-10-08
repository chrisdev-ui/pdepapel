/**
 * Una pestaña del panel abierta desde antes de un despliegue sigue corriendo el
 * código viejo. Se compara el commit con el que se construyó la pestaña con el
 * que está desplegado (`/api/version`). Sin commit propio (desarrollo local) o
 * sin respuesta, no se avisa nada.
 */
export const VERSION_POLL_MS = 5 * 60 * 1000;

export function isNewVersionAvailable(buildSha: string | null | undefined, deployedSha: string | null | undefined) {
  if (!buildSha || !deployedSha) return false;
  return buildSha !== deployedSha;
}

/** El commit con el que se construyó este paquete (lo fija `next.config.mjs`). */
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";
