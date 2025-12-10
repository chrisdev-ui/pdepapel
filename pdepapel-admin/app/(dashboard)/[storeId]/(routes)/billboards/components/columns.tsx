"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { getBillboards } from "../server/get-billboards";
import { CellAction } from "./cell-action";

export type BillboardColumn = Awaited<ReturnType<typeof getBillboards>>[number];

export const columns: ColumnDef<BillboardColumn>[] = [
  {
    accessorKey: "imageUrl",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen" />
    ),
    cell: ({ row }) => (
      <DataTableCellImage
        className="w-24"
        src={row.original.imageUrl}
        alt={row.original.id}
        ratio={16 / 9}
      />
    ),
  },
  {
    accessorKey: "label",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Descripción" />
    ),
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Título" />
    ),
    cell: ({ row }) => row.original.title ?? "Sin título",
  },
  {
    accessorKey: "redirectUrl",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Link de redirección" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-x-2">
        <ExternalLink className="h-4 w-4" />
        {row.original.redirectUrl ?? "Sin link de redirección"}
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
