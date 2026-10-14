import { create } from "zustand";

interface VersionGuardState {
  /** El panel abierto es de un despliegue anterior. */
  stale: boolean;
  /** La pantalla en la que se notó: al pasar a otra, la página se carga entera con la versión nueva. */
  staleAtPath: string | null;
  reload: () => void;
}

/**
 * Pestaña con una versión vieja del panel: solo se avisa. Nunca se frena ni
 * se retiene una petición (antes un guardado esperaba a que se contestara un
 * diálogo y la pantalla parecía colgada); la recarga llega sola en la
 * siguiente navegación o al tocar «Recargar».
 */
export const useVersionGuard = create<VersionGuardState>(() => ({
  stale: false,
  staleAtPath: null,
  reload: () => window.location.reload(),
}));

/** ¿Hay que recargar? Solo cuando la pestaña es vieja y cambió la pantalla (no los filtros de la misma). */
export function shouldReloadOnNavigation(state: { stale: boolean; staleAtPath: string | null }, pathname: string | null): boolean {
  return Boolean(state.stale && state.staleAtPath !== null && pathname !== null && pathname !== state.staleAtPath);
}
