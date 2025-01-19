"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellColor } from "@/components/ui/data-table-cell-color";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getProducts } from "../server/get-products";
import { CellAction } from "./cell-action";

export type ProductColumn = Awaited<ReturnType<typeof getProducts>>[number];

export const columns: ColumnDef<ProductColumn>[] = [
  {
    accessorKey: "image",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen" />
    ),
    cell: ({ row }) =>
      row.original.image && (
        <DataTableCellImage
          src={row.original.image}
          alt={row.original.name}
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
    accessorKey: "price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Precio" />
    ),
  },
  {
    accessorKey: "category",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Categoría" />
    ),
  },
  {
    accessorKey: "size",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tamaño" />
    ),
  },
  {
    accessorKey: "color",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Color" />
    ),
    cell: ({ row }) => <DataTableCellColor color={row.original.color} />,
  },
  {
    accessorKey: "stock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stock" />
    ),
  },
  {
    accessorKey: "design",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Diseño" />
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
