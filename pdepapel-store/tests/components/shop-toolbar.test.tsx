// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-product-filters", () => ({
  useProductFilters: () => ({ filters: { sortOption: "" }, setFilter: vi.fn(), setFilters: vi.fn(), toggleFilter: vi.fn() }),
}));

import { ActiveFilterChips, ShopToolbar } from "@/components/shop/shop-toolbar";

const chips = [
  { key: "typeId" as const, value: "t1", label: "Cuadernos" },
  { key: "minPrice" as const, value: null, label: "$ 10.000 – $ 20.000" },
];

describe("shop toolbar", () => {
  afterEach(cleanup);

  it("removes one chip or clears everything", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const onClearAll = vi.fn();
    render(<ActiveFilterChips chips={chips} onRemove={onRemove} onClearAll={onClearAll} />);

    await user.click(screen.getByRole("button", { name: "Quitar filtro Cuadernos" }));
    expect(onRemove).toHaveBeenCalledWith(chips[0]);
    await user.click(screen.getByRole("button", { name: "Limpiar todo" }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("shows the visible range when nothing is filtered and the sort pill", () => {
    render(<ShopToolbar chips={[]} onRemoveChip={vi.fn()} onClearAll={vi.fn()} rangeText="Mostrando 1–24 de 1.980 productos" />);
    expect(screen.getByText("Mostrando 1–24 de 1.980 productos")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Ordenar productos" })).toHaveTextContent("Los más nuevos");
  });
});
