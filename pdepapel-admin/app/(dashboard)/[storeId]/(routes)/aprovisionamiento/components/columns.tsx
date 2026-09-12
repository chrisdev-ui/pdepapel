"use client";

import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TintBadge } from "@/components/ui/tint-badge";
import { RESTOCK_STATUS_LABELS, RESTOCK_STATUS_TONES } from "@/lib/restock-orders";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

import type { RestockOrderRow } from "../server/get-restock-orders";
import { CellAction } from "./cell-action";

export type RestockOrderColumn = RestockOrderRow;

/** Barra de unidades recibidas sobre pedidas; compartida por la tabla y la tarjeta móvil. */
export function RestockProgressCell({ progress, className }: { progress: RestockOrderRow["progress"]; className?: string }) {
  const percent = progress.orderedUnits > 0 ? Math.min(100, Math.round((progress.receivedUnits / progress.orderedUnits) * 100)) : 0;
  return (
    <div className={cn("flex min-w-[120px] flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">
        {progress.receivedUnits} de {progress.orderedUnits} unidades · {progress.lineCount} {progress.lineCount === 1 ? "línea" : "líneas"}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-full", percent >= 100 ? "bg-tint-mint" : "bg-primary/60")} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export const columns: ColumnDef<RestockOrderColumn>[] = [
  {
    accessorKey: "orderNumber",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pedido" />,
    cell: ({ row }) => <span className="font-mono text-sm font-semibold text-primary">{row.original.orderNumber}</span>,
  },
  {
    id: "supplier",
    accessorFn: (row) => row.supplier.name,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />,
    cell: ({ row }) => <span className="text-sm">{row.original.supplier.name}</span>,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => <TintBadge label={RESTOCK_STATUS_LABELS[row.original.status]} tone={RESTOCK_STATUS_TONES[row.original.status]} />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    id: "progress",
    accessorFn: (row) => row.progress.receivedUnits,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Recibido" />,
    cell: ({ row }) => <RestockProgressCell progress={row.original.progress} />,
  },
  {
    accessorKey: "total",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
    cell: ({ row }) => (
      <div className="flex flex-col items-end">
        <DataTableCellCurrency value={row.original.total} />
        {row.original.shippingCost > 0 && <span className="text-[11px] text-muted-foreground">incluye envío</span>}
      </div>
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
