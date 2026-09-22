"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellPhone } from "@/components/ui/data-table-cell-phone";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import {
  describeBotPause,
  formatBotPause,
} from "@/lib/conversation-bot-pause";
import {
  CONVERSATION_STATUS_LABELS,
  type ConversationRow,
} from "@/lib/conversations";
import { ConversationStatus } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { BellOff, BotOff, ShoppingBag } from "lucide-react";
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
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="font-medium">
          {row.original.contactName?.trim() ||
            (row.original.username ? `@${row.original.username}` : "Sin nombre")}
        </span>
        {/* Discreto pero visible: sin esto una conversación ignorada parece
            una que simplemente dejó de escribir. */}
        {row.original.ignored ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-tint-cream bg-tint-cream/60 px-2 py-0.5 text-[11px] font-semibold text-primary"
            title="El panel no refleja lo que llega de este contacto. Tu WhatsApp no cambia."
          >
            <BellOff className="h-3 w-3 shrink-0" aria-hidden="true" />
            {row.original.skippedCount > 0
              ? `Ignorado · ${row.original.skippedCount} sin reflejar`
              : "Ignorado"}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Teléfono" />
    ),
    // Sin teléfono la celda quedaba en blanco: `DataTableCellPhone` devuelve
    // `null`. Desde que Meta admite nombres de usuario eso pasa de verdad, y
    // una fila muda parecía un error de datos. En su lugar va el nombre de
    // usuario, que es como aparece en el celular de Paula (`@mrs_han14`).
    cell: ({ row }) =>
      row.original.phone ? (
        <DataTableCellPhone phoneNumber={row.original.phone} showCountry />
      ) : row.original.username ? (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            @{row.original.username}
          </span>
          <span className="text-xs text-muted-foreground">
            Nombre de usuario · sin teléfono
          </span>
        </div>
      ) : (
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Sin teléfono</span>
          <span className="text-xs text-muted-foreground">
            {row.original.bsuid
              ? "Usa nombre de usuario"
              : "No lo mandó WhatsApp"}
          </span>
        </div>
      ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado" />
    ),
    cell: ({ row }) => {
      // «Abierta» no cuenta toda la verdad: tras contestar Paula, el estado
      // vuelve a OPEN pero el bot sigue callado 24 h. Sin esto no había forma
      // de saberlo desde el panel.
      const pausa = formatBotPause(describeBotPause(row.original.lastOwnerAt));
      return (
        <div className="flex flex-col gap-1">
          <Badge variant={STATUS_VARIANT[row.original.status]} className="w-fit">
            {CONVERSATION_STATUS_LABELS[row.original.status]}
          </Badge>
          {pausa ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <BotOff className="h-3 w-3 shrink-0" aria-hidden="true" />
              {pausa}
            </span>
          ) : null}
        </div>
      );
    },
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
