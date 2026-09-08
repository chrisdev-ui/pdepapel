"use client";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { TintBadge } from "../../../pedidos/components/order-badges";
import { CellAction } from "./cell-action";

export type ReviewColumn = {
  id: string;
  productId: string;
  userId: string;
  name: string;
  rating: string;
  comment: string;
  status: "PUBLISHED" | "HIDDEN" | "PENDING";
  reply: string | null;
  createdAt: string;
};

export const columns: ColumnDef<ReviewColumn>[] = [
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
      <div className="flex max-w-md flex-col gap-1">
        <span className="text-sm">{row.original.comment || "Sin comentario"}</span>
        {row.original.reply && (
          <span className="text-xs text-muted-foreground">Respuesta: {row.original.reply}</span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado" />
    ),
    cell: ({ row }) =>
      row.original.status === "HIDDEN" ? (
        <TintBadge label="Oculta" tone="slate" />
      ) : row.original.reply ? (
        <TintBadge label="Respondida" tone="mint" />
      ) : (
        <TintBadge label="Publicada" tone="sky" />
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
