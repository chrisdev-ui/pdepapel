// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransportCostField } from "@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/components/transport-cost-field";

afterEach(cleanup);

describe("envío y otros gastos en la ficha", () => {
  it("«Toda la orden» reparte el envío entre las unidades y guarda la parte de cada una", () => {
    const onChange = vi.fn();
    render(<TransportCostField value={null} onChange={onChange} acqPrice={160} price={480} />);
    fireEvent.click(screen.getByRole("button", { name: "Toda la orden" }));
    expect(screen.getByRole("button", { name: "Toda la orden" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Envío de toda la orden"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Unidades de la orden"), { target: { value: "100" } });
    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(screen.getByTestId("transport-per-unit").textContent).toMatch(/10 por unidad/);
  });

  it("sin unidades todavía no guarda nada y lo pide", () => {
    const onChange = vi.fn();
    render(<TransportCostField value={null} onChange={onChange} acqPrice={160} price={480} />);
    fireEvent.click(screen.getByRole("button", { name: "Toda la orden" }));
    fireEvent.change(screen.getByLabelText("Envío de toda la orden"), { target: { value: "1000" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId("transport-per-unit").textContent).toContain("cuántas unidades");
  });

  it("avisa sin bloquear cuando el envío por unidad parece el de toda la orden", () => {
    const { rerender } = render(<TransportCostField value={1000} onChange={vi.fn()} acqPrice={160} price={480} />);
    expect(screen.getByTestId("transport-warning").textContent).toContain("igual o mayor que el costo de compra");
    rerender(<TransportCostField value={10} onChange={vi.fn()} acqPrice={160} price={480} />);
    expect(screen.queryByTestId("transport-warning")).toBeNull();
  });
});
