import { getCategorySales } from "@/actions/get-category-sales";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { DataTableCellCurrency } from "../ui/data-table-cell-currency";
import { DataTableCellNumber } from "../ui/data-table-cell-number";

export type SalesByCategoryColumn = Awaited<
  ReturnType<typeof getCategorySales>
>[number];

export const columns: ColumnDef<SalesByCategoryColumn>[] = [
  {
    accessorKey: "category",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Sub-Categoría" />
    ),
  },
  {
    accessorKey: "grossSales",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Ventas brutas" />
    ),
    cell: ({ row }) => (
      <DataTableCellCurrency value={row.original.grossSales} decimalScale={0} />
    ),
  },
  {
    accessorKey: "netSales",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Ventas netas" />
    ),
    cell: ({ row }) => (
      <DataTableCellCurrency value={row.original.netSales} decimalScale={0} />
    ),
  },
  {
    accessorKey: "orders",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Órdenes" />
    ),
    cell: ({ row }) => <DataTableCellNumber value={row.original.orders} />,
  },
  {
    accessorKey: "discountImpact",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Impacto del descuento" />
    ),
    cell: ({ row }) => (
      <DataTableCellCurrency
        value={row.original.discountImpact}
        decimalScale={0}
      />
    ),
  },
  {
    accessorKey: "discountPercentage",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Descuento (%)" />
    ),
    cell: ({ row }) => (
      <DataTableCellNumber
        value={row.original.discountPercentage}
        isPercentage
      />
    ),
  },
];
