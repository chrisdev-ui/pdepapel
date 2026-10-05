/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnavailableProductNotice } from "@/components/unavailable-product-notice";
import { Toaster } from "@/providers/toaster";

/**
 * En producción el aviso no salía: el `Toaster` del layout raíz se suscribe en
 * un efecto que corre después del efecto del aviso (los hijos primero), y un
 * `toast()` sin nadie escuchando se pierde. Aquí van los dos de verdad, en el
 * mismo orden que el árbol real.
 */
describe("UnavailableProductNotice with the real Toaster", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("shows the notice even though the Toaster subscribes after it", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/categoria/termos#producto-no-disponible");
    render(
      <>
        <UnavailableProductNotice />
        <Toaster />
      </>,
    );
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByText(/Ese producto ya no está disponible/)).toBeTruthy();
  });
});
