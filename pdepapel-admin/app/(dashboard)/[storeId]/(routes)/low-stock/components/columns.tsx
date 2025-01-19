"use client";

import { getLowStock } from "@/actions/get-low-stock-count";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { AlertOctagon } from "lucide-react";
import Image from "next/image";
import { CellAction } from "./cell-action";

export type LowStockColumn = Awaited<ReturnType<typeof getLowStock>>[number];

export const columns: ColumnDef<LowStockColumn>[] = [
  {
    accessorKey: "image",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen" />
    ),
    cell: ({ row }) =>
      row.original.image && (
        <div className="w-16">
          <AspectRatio ratio={1 / 1} className="bg-muted">
            <Image
              src={row.original.image}
              fill
              alt={row.original.name}
              className="h-full w-full rounded-md object-cover"
              unoptimized
            />
          </AspectRatio>
        </div>
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
    accessorKey: "lastUpdated",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Última actualización" />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
