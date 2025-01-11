"use client";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";

export type SupplierColumn = {
  id: string;
  name: string;
  createdAt: string;
};

export const columns: ColumnDef<SupplierColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre del proveedor" />
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
