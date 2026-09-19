// @vitest-environment jsdom

import { AsyncProductSelect } from "@/components/ui/async-product-select";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { selectedProduct, listState } = vi.hoisted(() => ({
  listState: { rows: [] as unknown[] },
  selectedProduct: {
    id: "product-1",
    name: "Set de marcadores kawaii edición especial con estuche coleccionable",
    sku: "SKU-MARCADOR-KAWAII-EDICION-ESPECIAL-COLECCIONABLE-2026",
    gtin: "77012345678901234567890",
    stock: 12,
    price: 38500,
    category: { name: "Marcadores y resaltadores" },
    images: [],
  },
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
}));

vi.mock("swr", () => ({
  default: (key: string | null) => ({
    data: key ? selectedProduct : undefined,
  }),
}));

vi.mock("swr/infinite", () => ({
  default: () => ({
    data: [{ data: listState.rows.length > 0 ? listState.rows : [selectedProduct], metadata: { hasMore: false } }],
    size: 1,
    setSize: vi.fn(),
    isLoading: false,
    isValidating: false,
  }),
}));

vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: (value: string) => value,
}));

beforeAll(() => {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver;
});

describe("AsyncProductSelect", () => {
  it("keeps a selected product with long identifiers within its trigger", () => {
    render(
      <div className="w-80">
        <AsyncProductSelect
          value={selectedProduct.id}
          onChange={() => undefined}
          modal
        />
      </div>,
    );

    const trigger = screen.getByRole("combobox");
    const productName = screen.getByText(selectedProduct.name);
    const details = screen.getByText(/GTIN: 77012345678901234567890/);

    expect(trigger).toHaveClass("min-w-0");
    expect(productName).toHaveClass("truncate");
    expect(productName.parentElement).toHaveClass("min-w-0", "flex-1");
    expect(productName.parentElement?.parentElement).toHaveClass(
      "min-w-0",
      "flex-1",
    );
    expect(details).toHaveClass("truncate");
    expect(details).toHaveAttribute(
      "title",
      expect.stringContaining(selectedProduct.sku),
    );
  });

  it("shows the selected product when the parent controls its value", async () => {
    function ControlledProductSelect() {
      const [value, setValue] = useState("");

      return (
        <AsyncProductSelect
          value={value}
          onChange={(productId) => setValue(productId)}
          modal
          ariaLabel="Seleccionar producto para etiquetar"
        />
      );
    }

    const user = userEvent.setup();
    render(<ControlledProductSelect />);

    const trigger = screen.getByRole("combobox", {
      name: "Seleccionar producto para etiquetar",
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("option", { name: new RegExp(selectedProduct.name) }),
    );

    expect(trigger).toHaveTextContent(selectedProduct.name);
  });

  it("forwards a selection while a parent intentionally keeps the trigger clear", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <AsyncProductSelect
        value=""
        onChange={onChange}
        modal
        ariaLabel="Agregar producto del catálogo"
      />,
    );

    const trigger = screen.getByRole("combobox", {
      name: "Agregar producto del catálogo",
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("option", { name: new RegExp(selectedProduct.name) }),
    );

    expect(onChange).toHaveBeenCalledWith("product-1", selectedProduct);
    expect(trigger).toHaveTextContent("Seleccionar producto...");
  });

  /**
   * Filas como en el lienzo de Etiquetas: «Nombre · Variante», línea mono
   * «SKU · stock · precio», chip de variante, y al final de las variantes de
   * un grupo la fila «todas las variantes» con su cuenta.
   */
  it("renders rich rows and a «todas las variantes» row after the group's last variant", async () => {
    const group = { id: "g1", name: "Cartuchera Wisdom", _count: { products: 2 } };
    listState.rows = [
      { id: "v1", name: "Cartuchera Wisdom", sku: "CAR-ROS", stock: 0, price: 13000, color: { name: "Rosa pastel" }, size: { name: "S" }, productGroupId: "g1", productGroup: group, images: [] },
      { id: "s1", name: "Agenda Hogwarts", sku: "OF-2", stock: 3, price: 19000, images: [] },
      { id: "v2", name: "Cartuchera Wisdom", sku: "CAR-AZU", stock: 1, price: 13000, color: { name: "Azul pastel" }, size: { name: "S" }, productGroupId: "g1", productGroup: group, images: [] },
    ];
    cleanup();
    const onSelectGroup = vi.fn();
    const user = userEvent.setup();
    render(<AsyncProductSelect value="" onChange={() => undefined} onSelectGroup={onSelectGroup} modal />);
    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Cartuchera Wisdom · Rosa pastel · S")).toBeInTheDocument();
    expect(screen.getByText("CAR-ROS · 0 und · $ 13.000")).toHaveClass("font-mono");
    expect(screen.getAllByText("Variante")).toHaveLength(2);
    const groupRow = document.querySelector('[data-group-row="g1"]') as HTMLElement;
    expect(groupRow).not.toBeNull();
    expect(groupRow.textContent).toContain("Cartuchera Wisdom · todas las variantes");
    expect(groupRow.textContent).toContain("(2)");
    expect(groupRow.textContent).toContain("Grupo");
    // Después de la última variante del grupo (v2), no después de la primera.
    const rows = Array.from(document.querySelectorAll("[cmdk-item]")).map((el) => el.getAttribute("data-value"));
    expect(rows).toEqual(["v1", "s1", "v2", "group:g1"]);

    await user.click(groupRow);
    expect(onSelectGroup).toHaveBeenCalledWith({ id: "g1", name: "Cartuchera Wisdom", count: 2 });
    listState.rows = [];
  });
});
