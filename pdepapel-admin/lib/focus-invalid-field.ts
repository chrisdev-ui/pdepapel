/**
 * Lleva la vista al primer campo inválido del formulario. En formularios
 * largos el error casi siempre queda fuera de pantalla y el botón de guardar
 * parece roto; el toast del hook `useFormValidationToast` nombra el problema
 * y esto lo pone delante.
 *
 * Los controles compuestos (subida de imágenes, selectores) no llevan
 * `aria-invalid`, así que también vale el primer mensaje de error visible.
 */
export function focusFirstInvalidField() {
  if (typeof document === "undefined") return;
  const firstInvalid =
    document.querySelector<HTMLElement>(
      '[aria-invalid="true"], [data-invalid="true"]',
    ) ?? document.querySelector<HTMLElement>('p[id$="-form-item-message"]');
  if (!firstInvalid) return;
  firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
  // El foco espera al scroll para no pelearse con el desplazamiento.
  window.setTimeout(() => firstInvalid.focus?.({ preventScroll: true }), 300);
}
