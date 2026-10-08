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
    await user.click(screen.getByRole("button", { name: "Ver menos" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
  });

  it("keeps a selected value visible even past the first ten (B4)", () => {
    mocks.selected = ["t11"];
    render(<Filter valueKey="typeId" name="Categorías" data={types} />);
    expect(screen.getByLabelText("Tipo L")).toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(11);
    expect(screen.getByRole("button", { name: "Ver 1 más" })).toBeInTheDocument();
  });

  it("checks a value selected by slug and removes that slug when clicked (B5)", async () => {
    const user = userEvent.setup();
    mocks.selected = ["tipo-b"];
    render(<Filter valueKey="typeId" name="Categorías" data={types.slice(0, 3).map((type) => ({ ...type, slug: type.id === "t1" ? "tipo-b" : undefined }))} />);

    expect(screen.getByLabelText("Tipo B")).toBeChecked();
    expect(screen.getByRole("button", { name: /^Categorías\s?1$/ })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Tipo B"));
    expect(mocks.toggleFilter).toHaveBeenCalledWith("typeId", "tipo-b");
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

  it("paints colour rows with the shared swatch, so Multicolor and Blanco no longer look alike (#3)", () => {
    const { container } = render(
      <Filter
        valueKey="colorId"
        name="Colores"
        data={[
          { id: "k-bl", name: "Blanco", value: "#ffffff", swatchType: "SOLID", count: 4 },
          { id: "k-mu", name: "Multicolor", value: "#ffffff", swatchType: "MULTICOLOR", count: 9 },
          { id: "k-az", name: "Azul", value: "#0004FF", count: 2 },
        ]}
      />,
    );
    const swatchFor = (name: string) => screen.getByText(name).parentElement!.querySelector<HTMLElement>("[data-swatch-type]")!;
    expect(swatchFor("Blanco").dataset.swatchType).toBe("SOLID");
    expect(swatchFor("Multicolor").dataset.swatchType).toBe("MULTICOLOR");
    expect(container.querySelectorAll("[data-swatch-type]")).toHaveLength(3);
    for (const swatch of Array.from(container.querySelectorAll("[data-swatch-type]"))) expect(swatch).toHaveAttribute("aria-hidden", "true");
    // Sin `swatchType` (respuesta vieja de la API): sólido con su hex.
    expect(swatchFor("Azul").dataset.swatchType).toBe("SOLID");
    expect(swatchFor("Azul").style.backgroundColor).toBe("rgb(0, 4, 255)");
    expect(screen.getByLabelText("Multicolor")).toBeInTheDocument();
  });
});
