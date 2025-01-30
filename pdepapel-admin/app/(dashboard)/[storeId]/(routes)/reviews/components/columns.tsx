"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableCellRating } from "@/components/ui/data-table-cell-rating";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getReviews } from "../server/get-reviews";
import { CellAction } from "./cell-action";

export type ReviewsColumn = Awaited<ReturnType<typeof getReviews>>[number];

export const columns: ColumnDef<ReviewsColumn>[] = [
  {
    accessorKey: "productImage",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen del producto" />
    ),
    cell: ({ row }) => (
      <DataTableCellImage
        src={row.original.productImage}
        alt={row.original.productName}
        ratio={1 / 1}
      />
    ),
  },
  {
    accessorKey: "productName",
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
    cell: ({ row }) => <DataTableCellRating value={row.original.rating} />,
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
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
