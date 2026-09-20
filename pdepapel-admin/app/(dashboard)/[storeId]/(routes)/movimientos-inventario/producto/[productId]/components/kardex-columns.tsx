"use client";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TintBadge } from "@/components/ui/tint-badge";
import { FAIR_SALE_LABEL } from "@/lib/fair-kardex";
import { formatKardexDate, formatSignedQuantity, MOVEMENT_LABELS, MOVEMENT_TONES } from "@/lib/kardex";
import { cn, currencyFormatter } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import type { KardexRow } from "../server/get-product-kardex";

/** El origen ya viene resuelto por `lib/movement-reference.ts`. */
function OriginCell({ row }: { row: KardexRow }) {
  const reference = row.reference;
  if (!reference) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="min-w-0 max-w-[280px]">
      {reference.href ? (
        <Link href={reference.href} className="block truncate text-sm font-medium text-primary hover:underline" data-no-row-click>
          {reference.label}
        </Link>
      ) : (
        <span className="block truncate text-sm text-primary" title={reference.label}>
          {reference.label}
        </span>
      )}
      {reference.secondary ? (
        <span className="block truncate text-xs text-muted-foreground" title={reference.secondary}>
          {reference.secondary}
        </span>
      ) : null}
    </div>
  );
}

export const kardexColumns: ColumnDef<KardexRow>[] = [
  {
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cuándo" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-sm text-primary">{formatKardexDate(row.original.createdAt)}</span>,
  },
  {
    accessorKey: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Movimiento" />,
    cell: ({ row }) =>
      row.original.derived ? (
        <span title={row.original.derived.hint} className="inline-flex items-center gap-1.5">
          <TintBadge label={FAIR_SALE_LABEL} tone="lavender" />
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            ·
          </span>
          <span className="text-[11px] text-muted-foreground">derivada</span>
        </span>
      ) : (
        <TintBadge label={MOVEMENT_LABELS[row.original.type]} tone={MOVEMENT_TONES[row.original.type]} />
      ),
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    id: "origen",
    accessorFn: (row) => [row.reference?.label, row.reference?.secondary].filter(Boolean).join(" "),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Origen" />,
    cell: ({ row }) => <OriginCell row={row.original} />,
  },
  {
    accessorKey: "quantity",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cantidad" />,
    cell: ({ row }) => {
      const quantity = row.original.quantity;
      return (
        <span
          className={cn(
            "whitespace-nowrap text-right font-mono text-sm font-semibold tabular-nums",
            quantity > 0 && "text-emerald-700",
            quantity < 0 && "text-red-600",
            quantity === 0 && "text-muted-foreground",
          )}
        >
          {quantity === 0 ? "0" : formatSignedQuantity(quantity)}
        </span>
      );
    },
  },
  {
    accessorKey: "newStock",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Saldo" />,
    cell: ({ row }) =>
      row.original.newStock === null ? (
        <span className="whitespace-nowrap text-right text-sm text-muted-foreground" title="No mueve stock: no deja saldo.">
          —
        </span>
      ) : (
        <span className="whitespace-nowrap text-right font-mono text-sm font-bold tabular-nums text-primary">
          {row.original.newStock.toLocaleString("es-CO")}
        </span>
      ),
  },
  {
    accessorKey: "cost",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Costo" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-right font-mono text-sm tabular-nums text-primary">
        {row.original.cost === null ? "—" : currencyFormatter(row.original.cost)}
      </span>
    ),
  },
  {
    accessorKey: "who",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Quién" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-sm text-primary">{row.original.who}</span>,
  },
];
