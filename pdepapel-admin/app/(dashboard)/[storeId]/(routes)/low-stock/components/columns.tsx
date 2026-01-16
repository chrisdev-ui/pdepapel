"use client";

import { getLowStock } from "@/actions/get-low-stock-count";
import { Badge } from "@/components/ui/badge";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { AlertOctagon } from "lucide-react";
import { CellAction } from "./cell-action";

export type LowStockColumn = Awaited<ReturnType<typeof getLowStock>>[number];

export const columns: ColumnDef<LowStockColumn>[] = [
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
        alt={row.original.name}
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
    accessorKey: "stock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stock" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2 text-red-500">
        <AlertOctagon className="h-4 w-4" />
        {row.original.stock}
      </div>
    ),
  },
  {
    accessorKey: "isFeatured",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Destacado" />
    ),
    cell: ({ row }) => (
      <Badge variant={row.original.isFeatured ? "success" : "outline"}>
        {row.original.isFeatured ? "Sí" : "No"}
      </Badge>
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
    id: "lastUpdated",
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Última actualización" />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.updatedAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
