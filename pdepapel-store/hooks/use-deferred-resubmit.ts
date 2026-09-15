import { useEffect, useRef, useState } from "react";

/**
 * Reenviar un formulario SOLO cuando el valor del que dependen los totales ya
 * se actualizó.
 *
 * Existe por un fallo real: al confirmar la tarifa de envío nueva, el pedido
 * salía con el total VIEJO. El total se calcula con un `useMemo` sobre el
 * costo de envío, así que llamar a enviar en el mismo tick en que se cambia la
 * tarifa manda el importe anterior, y el servidor lo rechaza con «los montos
 * calculados no coinciden»: la clienta salía de un error sin salida para caer
 * en otro.
 *
 * `schedule(costoNuevo)` deja el reenvío en espera; el envío ocurre en el
 * primer render en que `currentValue` ya es ese costo, que es el mismo render
 * en que el total ya está rehecho.
 */
export function useDeferredResubmit(
  currentValue: number | null | undefined,
  submit: () => void,
) {
  const [awaitedValue, setAwaitedValue] = useState<number | null>(null);

  // El envío se rehace en cada render; se guarda en una ref para que el efecto
  // dispare el más reciente sin tener que depender de su identidad.
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (awaitedValue === null || currentValue !== awaitedValue) return;
    setAwaitedValue(null);
    submitRef.current();
  }, [awaitedValue, currentValue]);

  return {
    scheduleResubmit: (value: number) => setAwaitedValue(value),
    isAwaitingResubmit: awaitedValue !== null,
  };
}
