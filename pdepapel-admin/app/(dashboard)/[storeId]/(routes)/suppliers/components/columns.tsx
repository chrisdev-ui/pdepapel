"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellNumber } from "@/components/ui/data-table-cell-number";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getSuppliers } from "../server/get-suppliers";
import { CellAction } from "./cell-action";

export type SupplierColumn = Awaited<ReturnType<typeof getSuppliers>>[number];

export const columns: ColumnDef<SupplierColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre del proveedor" />
    ),
  },
  {
    id: "products",
    accessorKey: "_count.products",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Productos con este proveedor"
      />
    ),
    cell: ({ row }) => (
      <DataTableCellNumber value={row.original._count.products} />
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
