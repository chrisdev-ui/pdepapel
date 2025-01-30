"use client";

import { getProducts } from "@/actions/get-products";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { DataTableCellCurrency } from "../ui/data-table-cell-currency";
import { DataTableCellNumber } from "../ui/data-table-cell-number";
import { CellAction } from "./cell-action";

export type InventoryProductColumn = Awaited<
  ReturnType<typeof getProducts>
>[number];

export const columns: ColumnDef<InventoryProductColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    id: "category",
    accessorKey: "category.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Categoría" />
    ),
  },
  {
    accessorKey: "stock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stock" />
    ),
    cell: ({ row }) => <DataTableCellNumber value={row.original.stock} />,
  },
  {
    accessorKey: "price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Precio" />
    ),
    cell: ({ row }) => <DataTableCellCurrency value={row.original.price} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
