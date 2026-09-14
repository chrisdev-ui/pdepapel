"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellPhone } from "@/components/ui/data-table-cell-phone";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import {
  CONVERSATION_STATUS_LABELS,
  type ConversationRow,
} from "@/lib/conversations";
import { ConversationStatus } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { ShoppingBag } from "lucide-react";
import { CellAction } from "./cell-action";

export type ConversationColumn = ConversationRow;

/** El estado es lo que ordena su día, así que va con color y no solo con texto. */
const STATUS_VARIANT: Record<
  ConversationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  [ConversationStatus.NEEDS_OWNER]: "destructive",
  [ConversationStatus.OPEN]: "default",
  [ConversationStatus.RESOLVED]: "secondary",
};

export const columns: ColumnDef<ConversationColumn>[] = [
  {
    accessorKey: "contactName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Clienta" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.contactName?.trim() || "Sin nombre"}
      </span>
    ),
  },
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Teléfono" />
    ),
    cell: ({ row }) => (
      <DataTableCellPhone phoneNumber={row.original.phone} showCountry />
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado" />
    ),
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status]}>
        {CONVERSATION_STATUS_LABELS[row.original.status]}
      </Badge>
    ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "lastMessagePreview",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Último mensaje" />
    ),
    cell: ({ row }) => (
      <div className="flex max-w-[380px] items-center gap-2">
        {row.original.hasCart ? (
          <ShoppingBag
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-label="Carrito del catálogo"
          />
        ) : null}
        <span className="truncate text-muted-foreground">
          {row.original.lastMessagePreview ?? "—"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "lastMessageAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Cuándo" />
    ),
    cell: ({ row }) =>
      row.original.lastMessageAt ? (
        <DataTableCellDate date={row.original.lastMessageAt} />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "messageCount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Mensajes" />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.messageCount}</span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
