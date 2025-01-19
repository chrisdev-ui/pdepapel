"use client";

import { getOutOfStock } from "@/actions/get-out-of-stock-count";
import { Badge } from "@/components/ui/badge";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";

export type OutOfStockColumn = Awaited<
  ReturnType<typeof getOutOfStock>
>[number];

export const columns: ColumnDef<OutOfStockColumn>[] = [
  {
    accessorKey: "image",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen" />
    ),
    cell: ({ row }) => (
      <DataTableCellImage
        src={row.original.image}
        alt={row.original.id}
        ratio={1 / 1}
      />
    ),
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    accessorKey: "category",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Categoría" />
    ),
  },
  {
    accessorKey: "isArchived",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Archivado" />
    ),
    cell: ({ row }) => (
      <Badge variant={row.original.isArchived ? "destructive" : "success"}>
        {row.original.isArchived ? "Sí" : "No"}
      </Badge>
    ),
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Ultima actualización" />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
