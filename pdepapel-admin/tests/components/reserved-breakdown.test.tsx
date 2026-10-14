// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReservedBreakdown } from "@/components/reservations/reserved-breakdown";

/** Ficha del producto: con reservas, el bloque Inventario separa bodega, reservados y lo vendible. */
afterEach(cleanup);

describe("Inventario con reservas", () => {
  it("separa en bodega, reservados (con enlace a Reservas) y lo que se puede vender", () => {
    render(<ReservedBreakdown storeId="store-1" stock={12} reserved={2} />);
    const box = screen.getByTestId("reserved-breakdown");
    expect(within(box).getByText("En bodega").nextSibling).toHaveTextContent("12");
    expect(within(box).getByRole("link", { name: "2" })).toHaveAttribute("href", "/store-1/reservas");
    expect(within(box).getByText("Se pueden vender").nextSibling).toHaveTextContent("10");
  });

  it("sin reservas no ocupa espacio", () => {
    render(<ReservedBreakdown storeId="store-1" stock={12} reserved={0} />);
    expect(screen.queryByTestId("reserved-breakdown")).not.toBeInTheDocument();
  });
});
