"use client";

import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getReviews } from "../server/get-reviews";
import { CellAction } from "./cell-action";

export type ReviewsColumn = Awaited<ReturnType<typeof getReviews>>[number];

export const columns: ColumnDef<ReviewsColumn>[] = [
  {
    accessorKey: "product",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Producto" />
    ),
  },
  {
    accessorKey: "userImage",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen del usuario" />
    ),
    cell: ({ row }) => (
      <DataTableCellImage
        src={row.original.userImage ?? ""}
        alt={row.original.name}
        ratio={1 / 1}
      />
    ),
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre del usuario" />
    ),
  },
  {
    accessorKey: "rating",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Calificación" />
    ),
  },
  {
    accessorKey: "comment",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Comentarios" />
    ),
    cell: ({ row }) => (
      <div className="flex max-w-xs flex-col">
        <p className="text-sm">{row.original.comment}</p>
      </div>
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
