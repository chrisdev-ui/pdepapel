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

  it("celebrates once the subtotal reaches the threshold", () => {
    render(<FreeShippingProgress subtotal={130000} threshold={120000} />);
    expect(screen.getByRole("status")).toHaveTextContent("¡Tu pedido tiene envío gratis!");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});
