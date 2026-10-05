import type { MouseEvent } from "react";

/**
 * Un clic que el navegador debe resolver solo: botón central o derecho, o con
 * Cmd/Ctrl/Shift/Alt (abrir en otra pestaña o ventana, descargar). Los enlaces
 * que cambian de estado en la misma página solo interceptan el clic normal.
 */
export function isModifiedClick(event: MouseEvent<HTMLElement>): boolean {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
