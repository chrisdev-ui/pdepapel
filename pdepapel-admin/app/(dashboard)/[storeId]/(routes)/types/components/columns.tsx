"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellNumber } from "@/components/ui/data-table-cell-number";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getTypes } from "../server/get-types";
import { CellAction } from "./cell-action";

export type TypeColumn = Awaited<ReturnType<typeof getTypes>>[number];

export const columns: ColumnDef<TypeColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    id: "categories",
    accessorKey: "_count.categories",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Categorías con este tipo" />
    ),
    cell: ({ row }) => (
      <DataTableCellNumber value={row.original._count.categories} />
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
