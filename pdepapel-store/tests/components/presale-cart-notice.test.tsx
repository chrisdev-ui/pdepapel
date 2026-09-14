/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PresaleCartNotice } from "@/components/presale-cart-notice";
import type { Product } from "@/types";

afterEach(cleanup);

const presale = (arrival: string) => [
  { id: "ps", expectedArrivalAt: arrival, unitLimit: 40, committedUnits: 10 },
];

const item = (id: string, name: string, presales?: unknown) =>
  ({ id, name, presales }) as unknown as Pick<Product, "id" | "name" | "presales">;

describe("aviso de preventa en el carrito", () => {
  it("no dice nada si no hay preventa", () => {
    const { container } = render(
      <PresaleCartNotice items={[item("p1", "Lapicero")]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("avisa que el pedido COMPLETO espera, nombrando lo que ya está disponible", () => {
    render(
      <PresaleCartNotice
        items={[
          item("p1", "Lapicero"),
          item("p2", "Agenda", presale("2026-10-15T05:00:00.000Z")),
        ]}
      />,
    );

    expect(screen.getByText(/Todo tu pedido sale el/i)).toBeTruthy();
    // La parte que más importa: lo disponible también espera.
    expect(screen.getByText(/Todo el pedido espera/i)).toBeTruthy();
    // Y la única salida real.
    expect(screen.getByText(/Haz dos pedidos/i)).toBeTruthy();
  });

  it("sin nada más en el carrito, no ofrece partir el pedido", () => {
    render(
      <PresaleCartNotice items={[item("p2", "Agenda", presale("2026-10-15T05:00:00.000Z"))]} />,
    );

    expect(screen.getByText(/un solo envío/i)).toBeTruthy();
    expect(screen.queryByText(/Haz dos pedidos/i)).toBeNull();
  });

  it("con dos preventas manda la fecha más lejana: el pedido sale cuando llegue todo", () => {
    const { container } = render(
      <PresaleCartNotice
        items={[
          item("p2", "Agenda", presale("2026-10-15T05:00:00.000Z")),
          item("p3", "Stickers", presale("2026-11-03T05:00:00.000Z")),
        ]}
      />,
    );

    // 3 nov es más lejana que 15 oct. Se mira el texto completo porque la
    // fecha es un nodo aparte dentro del párrafo.
    expect(container.textContent).toContain("3 de nov");
    expect(container.textContent).not.toContain("15 de oct");
  });
});
