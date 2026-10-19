// @vitest-environment jsdom

import type { ColumnDef } from "@tanstack/react-table";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ storeId: "store-1" }),
  usePathname: () => "/store-1/productos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Models } from "@/constants";
import { useTableStore } from "@/hooks/use-table-store";

type Row = { id: string; name: string; brand: string; price: number };

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Nombre" },
  { accessorKey: "brand", header: "Marca" },
  { accessorKey: "price", header: ({ column }) => <DataTableColumnHeader column={column} title="Precio" /> },
];

// La página tal como llega del servidor: ya ordenada por él, aunque no lo parezca.
const page: Row[] = [
  { id: "a", name: "Agenda", brand: "kiut", price: 9000 },
  { id: "b", name: "Borrador", brand: "norma", price: 1000 },
  { id: "c", name: "Cuaderno", brand: "kiut", price: 5000 },
];

function renderServer(overrides: Partial<NonNullable<Parameters<typeof DataTable<Row, unknown>>[0]["server"]>> = {}) {
  const server = {
    page: 1,
    pageCount: 4,
    total: 80,
    pageSize: 25,
    search: "",
    onSearchChange: vi.fn(),
    onPageChange: vi.fn(),
    sorting: [],
    onSortingChange: vi.fn(),
    columnFilters: [],
    onColumnFiltersChange: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(
    <DataTable
      columns={columns}
      data={page}
      tableKey={Models.Products}
      searchPlaceholder="Buscar producto"
      filters={[{ columnKey: "brand", title: "Marca", options: [{ label: "Kiut", value: "kiut", count: 41 }, { label: "Norma", value: "norma", count: 7 }] }]}
      server={server}
    />,
  );
  return server;
}

const names = () => screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[1].textContent);

beforeEach(() => {
  useTableStore.setState({ tables: {} });
});
afterEach(cleanup);

describe("DataTable con lista del servidor", () => {
  it("no reordena la página en el navegador: el orden lo pide al servidor para toda la lista", async () => {
    const user = userEvent.setup();
    // Un orden guardado de otra visita tampoco reordena la página.
    useTableStore.setState({ tables: { [Models.Products]: { pagination: { pageIndex: 0, pageSize: 25 }, sorting: [{ id: "price", desc: false }], columnFilters: [], columnVisibility: {} } } });
    const server = renderServer();
    expect(names()).toEqual(["Agenda", "Borrador", "Cuaderno"]);
    await user.click(screen.getByRole("button", { name: /Precio/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Desc/ }));
    expect(server.onSortingChange).toHaveBeenCalledWith([{ id: "price", desc: true }]);
    expect(names()).toEqual(["Agenda", "Borrador", "Cuaderno"]);
  });

  it("muestra el orden activo que dice la URL", () => {
    renderServer({ sorting: [{ id: "price", desc: true }] });
    expect(screen.getByRole("button", { name: /Precio/ }).querySelector("svg.lucide-arrow-down")).not.toBeNull();
  });

  it("los filtros de columna se piden al servidor y cuentan lo que dice el servidor", async () => {
    const user = userEvent.setup();
    const server = renderServer();
    await user.click(screen.getByRole("button", { name: /Marca/ }));
    const option = await screen.findByRole("option", { name: /Norma/ });
    expect(option).toHaveTextContent("7");
    await user.click(option);
    expect(server.onColumnFiltersChange).toHaveBeenCalledWith([{ id: "brand", value: ["norma"] }]);
    // La página no se filtra en el navegador.
    expect(names()).toEqual(["Agenda", "Borrador", "Cuaderno"]);
  });

  it("«Limpiar» quita búsqueda y filtros en un solo viaje al servidor", async () => {
    const user = userEvent.setup();
    const server = renderServer({ search: "agen", columnFilters: [{ id: "brand", value: ["kiut"] }] });
    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(server.onClear).toHaveBeenCalledTimes(1);
    expect(server.onColumnFiltersChange).not.toHaveBeenCalled();
  });
});
