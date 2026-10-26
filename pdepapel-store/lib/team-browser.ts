/**
 * Navegador del equipo: la dueña lo marca desde el panel (Configuración ›
 * Avanzado). Con la marca, GA4 recibe `traffic_type=internal` (el filtro
 * «Internal Traffic» lo excluye) y Clarity no se carga.
 */
export const TEAM_BROWSER_COOKIE = "pdepapel_equipo";
/** El tope de los navegadores para una cookie: 400 días. */
export const TEAM_BROWSER_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export function isTeamBrowser(): boolean {
  try {
    if (typeof document === "undefined") return false;
    return String(document.cookie ?? "")
      .split(";")
      .some((cookie) => cookie.trim() === `${TEAM_BROWSER_COOKIE}=1`);
  } catch {
    // Una cookie ilegible no puede apagar la analítica de nadie.
    return false;
  }
}
