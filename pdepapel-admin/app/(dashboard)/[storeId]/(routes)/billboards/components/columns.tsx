"use client";

import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getBillboards } from "../server/get-billboards";
import { CellAction } from "./cell-action";

export type BillboardColumn = Awaited<ReturnType<typeof getBillboards>>[number];

export const columns: ColumnDef<BillboardColumn>[] = [
  {
    accessorKey: "image",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen" />
    ),
    cell: ({ row }) => (
      <DataTableCellImage
        className="w-24"
        src={row.original.image}
        alt={row.original.id}
        ratio={16 / 9}
      />
    ),
  },
  {
    accessorKey: "label",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Etiqueta" />
    ),
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Título" />
    ),
  },
  {
    accessorKey: "redirectUrl",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Link de redirección" />
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
