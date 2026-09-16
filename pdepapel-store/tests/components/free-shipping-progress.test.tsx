/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FreeShippingProgress } from "@/components/free-shipping-progress";

describe("FreeShippingProgress", () => {
  afterEach(cleanup);

  it("renders nothing when the store has no threshold", () => {
    const { container } = render(<FreeShippingProgress subtotal={50000} threshold={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says how much is missing and fills the bar proportionally", () => {
    render(<FreeShippingProgress subtotal={90000} threshold={120000} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Te faltan \$\s?30\.000 para el envío gratis/);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
  });

  it("waits instead of quoting a figure that assumes an empty cart", () => {
    // En la ficha del producto el subtotal depende del carrito, que solo existe
    // en el navegador. Antes de montar se enseña esto, nunca una cifra inflada.
    render(<FreeShippingProgress subtotal={0} threshold={120000} pending />);
    expect(screen.getByRole("status")).toHaveTextContent("Calculando tu envío gratis…");
    expect(screen.getByRole("status")).not.toHaveTextContent("Te faltan");
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-busy", "true");
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });

  it("does not celebrate while pending, even if the subtotal would qualify", () => {
    render(<FreeShippingProgress subtotal={130000} threshold={120000} pending />);
    expect(screen.getByRole("status")).not.toHaveTextContent("envío gratis!");
  });

  it("celebrates once the subtotal reaches the threshold", () => {
    render(<FreeShippingProgress subtotal={130000} threshold={120000} />);
    expect(screen.getByRole("status")).toHaveTextContent("¡Tu pedido tiene envío gratis!");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});
