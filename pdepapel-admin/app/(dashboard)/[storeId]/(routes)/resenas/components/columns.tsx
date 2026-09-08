"use client";

import { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";

import { DataTableCellRating } from "@/components/ui/data-table-cell-rating";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";

import { TintBadge } from "../../pedidos/components/order-badges";
import { relativeDate } from "../../pedidos/components/columns";
import { getReviews } from "../server/get-reviews";
import { CellAction } from "./cell-action";

export type ReviewsColumn = Awaited<ReturnType<typeof getReviews>>[number];

export function ReviewStatusBadge({ review }: { review: Pick<ReviewsColumn, "status" | "reply"> }) {
  if (review.status === "HIDDEN") return <TintBadge label="Oculta" tone="slate" />;
  if (review.reply) return <TintBadge label="Respondida" tone="mint" />;
  return <TintBadge label="Publicada" tone="sky" />;
}

export const columns: ColumnDef<ReviewsColumn>[] = [
  {
    id: "product",
    accessorFn: (row) => `${row.productName} ${row.name} ${row.comment ?? ""} ${row.reply ?? ""}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Producto" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border bg-muted">
          <Image src={row.original.productImage} alt="" fill className="object-cover" />
        </span>
        <span className="truncate text-sm font-medium">{row.original.productName}</span>
      </div>
    ),
  },
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
    cell: ({ row }) => <span className="text-sm">{row.original.name}</span>,
  },
  {
    accessorKey: "rating",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Calificación" />,
    cell: ({ row }) => <DataTableCellRating value={row.original.rating} />,
  },
  {
    accessorKey: "comment",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Comentario" />,
    cell: ({ row }) => (
      <div className="flex max-w-md flex-col gap-1">
        {row.original.comment ? (
          <p className="text-sm">{row.original.comment}</p>
        ) : (
          <span className="text-xs text-muted-foreground">Sin comentario</span>
        )}
        {row.original.reply && (
          <p className="rounded-md bg-tint-mint/60 px-2 py-1 text-xs text-primary">
            <span className="font-semibold">Respuesta: </span>
            {row.original.reply}
          </p>
        )}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => <ReviewStatusBadge review={row.original} />,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{relativeDate(row.original.createdAt)}</span>,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
