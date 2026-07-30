"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getDesigns } from "../server/get-designs";
import { CellAction } from "./cell-action";

export type DesignColumn = Awaited<ReturnType<typeof getDesigns>>[number];

export const columns: ColumnDef<DesignColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    id: "products",
    accessorKey: "_count.products",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Productos con este diseño"
      />
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
