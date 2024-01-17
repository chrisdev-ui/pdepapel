"use client";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Social } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";

export type PostColumn = {
  id: string;
  social: Social;
  postId: string;
  createdAt: string;
};

export const columns: ColumnDef<PostColumn>[] = [
  {
    accessorKey: "social",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Red Social" />
    ),
  },
  {
    accessorKey: "postId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID de publicación" />
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
