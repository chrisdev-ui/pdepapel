/* @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDeferredResubmit } from "@/hooks/use-deferred-resubmit";

afterEach(cleanup);

const SUBTOTAL = 25_000;
const ENVIO_VIEJO = 13_997;
const ENVIO_NUEVO = 19_500;

/**
 * Reproduce la forma exacta del checkout: el costo de envío vive en el estado
 * y el total sale de un `useMemo` sobre él, así que el total de un render es
 * siempre el del costo de ESE render.
 */
function Checkout({
  modo,
  onSubmit,
}: {
  modo: "sincrono" | "diferido";
  onSubmit: (total: number) => void;
}) {
  const [shippingCost, setShippingCost] = useState(ENVIO_VIEJO);
  const total = useMemo(() => SUBTOTAL + shippingCost, [shippingCost]);

  const { scheduleResubmit } = useDeferredResubmit(shippingCost, () => {
    onSubmit(total);
  });

  const confirmar = () => {
    setShippingCost(ENVIO_NUEVO);
    if (modo === "sincrono") {
      // Como estaba ANTES: enviar en el mismo tick en que se cambia la tarifa.
      onSubmit(total);
    } else {
      scheduleResubmit(ENVIO_NUEVO);
    }
  };

  return (
    <>
      <button type="button" onClick={confirmar}>
        Confirmar y continuar
      </button>
      <span data-testid="total">{total}</span>
    </>
  );
}

describe("reenviar el pedido tras confirmar la tarifa nueva", () => {
  it("ANTES del arreglo: manda el total VIEJO y el servidor lo rechazaría", async () => {
    // Esta prueba documenta el fallo: sirve para saber que la de abajo
    // distingue de verdad, y no pasa por casualidad.
    const onSubmit = vi.fn();
    render(<Checkout modo="sincrono" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(SUBTOTAL + ENVIO_VIEJO); // 38.997
    // El total en pantalla ya es el nuevo, pero lo enviado no: ahí está el fallo.
    expect(screen.getByTestId("total").textContent).toBe(String(SUBTOTAL + ENVIO_NUEVO));
  });

  it("DESPUÉS: espera al recálculo y manda el total NUEVO", async () => {
    const onSubmit = vi.fn();
    render(<Checkout modo="diferido" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(SUBTOTAL + ENVIO_NUEVO); // 44.500
    expect(onSubmit).not.toHaveBeenCalledWith(SUBTOTAL + ENVIO_VIEJO);
  });

  it("no reenvía mientras el costo no sea el esperado", async () => {
    const onSubmit = vi.fn();
    function SinCambio() {
      const [cost] = useState(ENVIO_VIEJO);
      const { scheduleResubmit, isAwaitingResubmit } = useDeferredResubmit(
        cost,
        () => onSubmit(cost),
      );
      return (
        <>
          <button type="button" onClick={() => scheduleResubmit(ENVIO_NUEVO)}>
            pedir
          </button>
          <span data-testid="esperando">{String(isAwaitingResubmit)}</span>
        </>
      );
    }
    render(<SinCambio />);
    await userEvent.click(screen.getByRole("button", { name: "pedir" }));

    // El costo nunca llega a ser el pedido: no se envía nada y queda en espera.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("esperando").textContent).toBe("true");
  });

  it("envía una sola vez, no en cada render posterior", async () => {
    const onSubmit = vi.fn();
    render(<Checkout modo="diferido" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());

    // Forzar más renders: el envío no se repite.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
