"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getCategories } from "../server/get-categories";
import { CellAction } from "./cell-action";

export type CategoryColumn = Awaited<ReturnType<typeof getCategories>>[number];

export const columns: ColumnDef<CategoryColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    id: "type",
    accessorKey: "type.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tipo" />
    ),
    cell: ({ row }) => row.original.type.name,
  },
  {
    id: "products",
    accessorKey: "_count.products",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Productos en esta categoría"
      />
    ),
    cell: ({ row }) => row.original._count.products,
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
