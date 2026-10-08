import { create } from "zustand";

export type ReloadChoice = "reload" | "continue";

interface VersionGuardState {
  /** El panel abierto es de un despliegue anterior. */
  stale: boolean;
  /** Ya eligió «Continuar sin recargar» en esta pestaña: no se vuelve a preguntar. */
  acknowledged: boolean;
  /** Pregunta abierta; la contesta el diálogo de `VersionGuard`. */
  prompt: ((choice: ReloadChoice) => void) | null;
  answer: (choice: ReloadChoice) => void;
  reload: () => void;
}

export const useVersionGuard = create<VersionGuardState>((set, get) => ({
  stale: false,
  acknowledged: false,
  prompt: null,
  answer: (choice) => {
    const resolve = get().prompt;
    set({ prompt: null, acknowledged: choice === "continue" ? true : get().acknowledged });
    resolve?.(choice);
  },
  reload: () => window.location.reload(),
}));

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

export function needsReloadPrompt(method: string | undefined, state: { stale: boolean; acknowledged: boolean }) {
  return Boolean(method && MUTATING_METHODS.has(method.toLowerCase()) && state.stale && !state.acknowledged);
}

/** Antes de guardar, crear o borrar con una versión vieja abierta: pregunta si recargar primero. */
export async function guardMutation(method: string | undefined): Promise<"proceed" | "reload"> {
  if (!needsReloadPrompt(method, useVersionGuard.getState())) return "proceed";
  const choice = await new Promise<ReloadChoice>((resolve) => {
    // Dos acciones a la vez comparten la misma pregunta.
    const previous = useVersionGuard.getState().prompt;
    useVersionGuard.setState({
      prompt: (answer) => {
        previous?.(answer);
        resolve(answer);
      },
    });
  });
  return choice === "continue" ? "proceed" : "reload";
}

/** Si la recarga no llega (por ejemplo, la persona la cancela), la acción se suelta con error. */
export const RELOAD_HOLD_MS = 10_000;

export function holdForReload(): Promise<never> {
  useVersionGuard.getState().reload();
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("La página no se recargó. Vuelve a intentarlo.")), RELOAD_HOLD_MS);
  });
}
