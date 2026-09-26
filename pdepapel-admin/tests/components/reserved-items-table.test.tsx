// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ReservedItemsTable,
  RESERVED_ITEMS_FILTER_THRESHOLD,
  type ReservedItemRow,
} from "@/app/(dashboard)/[storeId]/(routes)/ferias/[fairEventId]/components/reserved-items-table";

afterEach(cleanup);

const row = (overrides: Partial<ReservedItemRow> & { id: string; name: string; sku: string }): ReservedItemRow => ({
  allocatedQuantity: 5,
  soldQuantity: 1,
  packedQuantity: 0,
  returnedQuantity: 0,
  damagedQuantity: 0,
  lostQuantity: 0,
  ...overrides,
  product: { name: overrides.name, sku: overrides.sku },
});

/** La tabla de escritorio es la que lleva encabezados; la lista de teléfono repite las cifras rotuladas. */
const desktopTable = () => screen.getByRole("table");

describe("Inventario reservado", () => {
  it("lists every reserved row sorted by name with what is still available", () => {
    render(
      <ReservedItemsTable
        items={[
          row({ id: "b", name: "Libreta", sku: "LIB-1", allocatedQuantity: 4, soldQuantity: 1, packedQuantity: 1 }),
          row({ id: "a", name: "Agenda", sku: "AGE-1", allocatedQuantity: 2, soldQuantity: 2 }),
        ]}
      />,
    );
    expect(screen.getByText("2 productos · 6 unidades reservadas")).toBeInTheDocument();
    const table = desktopTable();
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Producto", "Reservadas", "Vendidas", "En cápsulas", "Disponibles",
    ]);
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual([
      expect.stringContaining("Agenda"),
      expect.stringContaining("Libreta"),
    ]);
    // Libreta: 4 reservadas − 1 vendida − 1 en cápsula = 2 disponibles.
    expect(within(bodyRows[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      expect.stringContaining("SKU LIB-1"), "4", "1", "1", "2",
    ]);
    // Sin búsqueda con pocas filas.
    expect(screen.queryByLabelText("Buscar en el inventario reservado")).toBeNull();
    // La vista de teléfono existe con las mismas cifras rotuladas.
    expect(screen.getByRole("list", { name: "Inventario reservado" })).toBeInTheDocument();
  });

  it("shows the kit chip and its pieces on a kit row", () => {
    render(
      <ReservedItemsTable
        items={[row({ id: "k", name: "Kit de arte", sku: "KIT-1", kitComponents: [{ name: "Pinceles", quantityPerKit: 2 }, { name: "Bitácora", quantityPerKit: 1 }] })]}
      />,
    );
    expect(screen.getAllByText("Kit · 3 piezas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 × Pinceles · 1 × Bitácora").length).toBeGreaterThan(0);
  });

  it("offers a search box past the threshold and filters by name or SKU without accents", () => {
    const items = Array.from({ length: RESERVED_ITEMS_FILTER_THRESHOLD + 1 }, (_, index) =>
      row({ id: `p${index}`, name: index === 0 ? "Bitácora grande" : `Sticker ${index}`, sku: index === 0 ? "BIT-9" : `STK-${index}` }),
    );
    render(<ReservedItemsTable items={items} />);
    const search = screen.getByLabelText("Buscar en el inventario reservado");
    fireEvent.change(search, { target: { value: "bitacora" } });
    expect(within(desktopTable()).getAllByRole("row")).toHaveLength(2);
    fireEvent.change(search, { target: { value: "stk-7" } });
    expect(within(desktopTable()).getAllByRole("row")).toHaveLength(2);
    expect(within(desktopTable()).getByText("Sticker 7")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText(/Ningún producto reservado coincide con «zzz»/)).toBeInTheDocument();
  });

  it("switches to the counted columns for a closed fair", () => {
    render(
      <ReservedItemsTable
        closed
        items={[row({ id: "a", name: "Agenda", sku: "AGE-1", allocatedQuantity: 5, soldQuantity: 2, returnedQuantity: 2, damagedQuantity: 1, lostQuantity: 0 })]}
      />,
    );
    expect(within(desktopTable()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Producto", "Reservado", "Vendido", "Devuelto", "Dañado", "Perdido",
    ]);
    expect(within(desktopTable()).getAllByRole("row")[1].textContent).toContain("52210");
  });
});
