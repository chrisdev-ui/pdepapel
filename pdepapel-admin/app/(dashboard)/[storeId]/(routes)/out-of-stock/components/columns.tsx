"use client";

import { getOutOfStock } from "@/actions/get-out-of-stock-count";
import { Badge } from "@/components/ui/badge";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";

export type OutOfStockColumn = Awaited<
  ReturnType<typeof getOutOfStock>
>[number];

export const columns: ColumnDef<OutOfStockColumn>[] = [
  {
    id: "image",
    accessorFn: (row) =>
      row.images.find((image) => image.isMain)?.url ?? row.images[0].url,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen" />
    ),
    cell: ({ row }) => (
      <DataTableCellImage
        src={
          row.original.images.find((image) => image.isMain)?.url ??
          row.original.images[0].url
        }
        alt={row.original.id}
        ratio={1 / 1}
        numberOfImages={row.original.images.length}
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
    id: "category",
    accessorKey: "category.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Sub-Categoría" />
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
    cell: ({ row }) => <DataTableCellDate date={row.original.updatedAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
