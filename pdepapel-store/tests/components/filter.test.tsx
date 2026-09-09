// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toggleFilter: vi.fn(),
  setFilter: vi.fn(),
  track: vi.fn(),
  selected: [] as string[],
}));

vi.mock("@/hooks/use-product-filters", () => ({
  useProductFilters: () => ({
    filters: { typeId: mocks.selected, categoryId: [], colorId: [], sizeId: [], designId: [], optionValueId: [] },
    toggleFilter: mocks.toggleFilter,
    setFilter: mocks.setFilter,
    setFilters: vi.fn(),
  }),
}));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: mocks.track }));

import Filter from "@/components/filter";

const types = Array.from({ length: 12 }, (_, index) => ({ id: `t${index}`, name: `✏️ Tipo ${String.fromCharCode(65 + index)}`, count: index }));

describe("Filter group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selected = [];
    window.sessionStorage.clear();
  });
  afterEach(cleanup);

  it("strips emoji, shows counts, limits rows and reveals the rest", async () => {
    const user = userEvent.setup();
    render(<Filter valueKey="typeId" name="Categorías" data={types} />);

    expect(screen.getByRole("button", { name: /Categorías/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Tipo A")).toBeInTheDocument();
    expect(screen.queryByText("✏️ Tipo A")).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);

    await user.click(screen.getByRole("button", { name: "Ver 2 más" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(12);
  });

  it("toggles a value through the shared filter state and tracks it", async () => {
    const user = userEvent.setup();
    render(<Filter valueKey="typeId" name="Categorías" data={types.slice(0, 3)} />);

    await user.click(screen.getByLabelText("Tipo B"));
    expect(mocks.toggleFilter).toHaveBeenCalledWith("typeId", "t1");
    expect(mocks.track).toHaveBeenCalledWith("catalog_filter", { filter: "typeId", action: "add" });
  });

  it("shows the active badge, clears the group and collapses on demand", async () => {
    const user = userEvent.setup();
    mocks.selected = ["t0", "t2"];
    render(<Filter valueKey="typeId" name="Categorías" data={types.slice(0, 3)} />);

    const header = screen.getByRole("button", { name: /^Categorías\s?2$/ });
    expect(header).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(mocks.setFilter).toHaveBeenCalledWith("typeId", null);

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(window.sessionStorage.getItem("pdp:filtro:Categorías")).toBe("0");
  });

  it("filters rows with the inner search when the list is long", async () => {
    const user = userEvent.setup();
    render(<Filter valueKey="typeId" name="Categorías" data={types} />);

    await user.type(screen.getByLabelText("Buscar en Categorías"), "Tipo L");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByLabelText("Tipo L")).toBeInTheDocument();
  });
});
