// @vitest-environment jsdom

import type { ColumnDef } from "@tanstack/react-table";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ storeId: "store-1" }),
  usePathname: () => "/store-1/productos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Models } from "@/constants";
import { useTableStore } from "@/hooks/use-table-store";

type Row = { id: string; name: string; sku: string; price: number };

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Nombre" },
  { accessorKey: "sku", header: "SKU" },
  { accessorKey: "price", header: "Precio" },
];

const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i + 1}`,
  name: i === 0 ? "Cuaderno Snoopy A5" : `Producto ${i + 1}`,
  sku: i === 0 ? "CUA-SNO-A5" : `SKU-${i + 1}`,
  price: 1000 * (i + 1),
}));

beforeEach(() => {
  useTableStore.setState({ tables: {} });
});
afterEach(cleanup);

describe("DataTable", () => {
  it("searches across columns, paginates 25 by default, and shows the range", () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        tableKey={Models.Products}
        searchPlaceholder="Buscar producto"
      />,
    );

    expect(screen.getByText("1–25 de 30")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(26);

    fireEvent.change(screen.getByPlaceholderText("Buscar producto"), {
      target: { value: "cua-sno" },
    });
    expect(screen.getByText("Cuaderno Snoopy A5")).toBeInTheDocument();
    expect(screen.getByText("1–1 de 1")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Buscar producto"), {
      target: { value: "snopy" },
    });
    expect(screen.getByText("Nada coincide con “snopy”")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByText("1–25 de 30")).toBeInTheDocument();
  });

  it("ignores stored column filters that have no visible control", () => {
    useTableStore.setState({
      tables: {
        [Models.Products]: {
          pagination: { pageIndex: 0, pageSize: 25 },
          sorting: [],
          columnFilters: [{ id: "name", value: "jou" }],
          columnVisibility: {},
        },
      },
    });

    render(<DataTable columns={columns} data={rows} tableKey={Models.Products} />);

    expect(screen.getByText("1–25 de 30")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpiar" })).not.toBeInTheDocument();
  });

  it("renders empty, loading, and error states with their actions", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={[]}
        tableKey={Models.Products}
        emptyState={{
          title: "Aún no hay productos",
          action: <Button>Nuevo producto</Button>,
        }}
      />,
    );
    expect(screen.getByText("Aún no hay productos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo producto" })).toBeInTheDocument();

    rerender(
      <DataTable columns={columns} data={[]} tableKey={Models.Products} isLoading />,
    );
    expect(screen.queryByText("Aún no hay productos")).toBeNull();
    expect(screen.getAllByRole("row", { hidden: true }).length).toBeGreaterThan(1);

    rerender(
      <DataTable
        columns={columns}
        data={[]}
        tableKey={Models.Products}
        error="Sin conexión"
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("opens the record on row click but not on the checkbox, and shows the selection bar", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows.slice(0, 3)}
        tableKey={Models.Products}
        onRowClick={onRowClick}
        bulkActions={() => <Button variant="ghost">Archivar</Button>}
      />,
    );

    const firstRow = screen.getByText("Cuaderno Snoopy A5").closest("tr")!;
    fireEvent.click(within(firstRow).getByText("Cuaderno Snoopy A5"));
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));

    fireEvent.click(within(firstRow).getByRole("checkbox", { name: "Seleccionar fila" }));
    expect(onRowClick).toHaveBeenCalledTimes(1);

    const bar = screen.getByRole("region", { name: "1 filas seleccionadas" });
    expect(within(bar).getByText("1 seleccionado")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Archivar" })).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole("button", { name: "Quitar selección" }));
    expect(screen.queryByRole("region", { name: /seleccionadas/ })).toBeNull();
  });
});
