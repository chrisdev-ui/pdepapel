"use client";

import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ProgressBar, receivedPercent } from "@/components/ui/progress-bar";
import { TintBadge } from "@/components/ui/tint-badge";
import { formatKardexDay } from "@/lib/kardex";
import { parseRestockOrderNumber, RESTOCK_STATUS_LABELS, RESTOCK_STATUS_TONES } from "@/lib/restock-orders";
import { expectedArrival } from "@/lib/restock-views";
import { cn } from "@/lib/utils";
import { RestockOrderStatus } from "@prisma/client";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useParams } from "next/navigation";

import type { RestockOrderRow } from "../server/get-restock-orders";
import { CellAction } from "./cell-action";

/** El proveedor lleva a su ficha; antes era texto plano. */
function SupplierCell({ row }: { row: RestockOrderRow }) {
  const params = useParams();
  return (
    <Link
      href={`/${String(params.storeId)}/proveedores/${row.supplier.id}`}
      className="text-sm text-primary hover:underline"
      data-no-row-click
    >
      {row.supplier.name}
    </Link>
  );
}

/**
 * Cuándo debería llegar el pedido. Sin plazo del proveedor no se estima nada:
 * hoy 28 de 29 proveedores no lo tienen, y una fecha inventada en una pantalla
 * de compras es peor que ninguna.
 */
function ArrivalCell({ row }: { row: RestockOrderRow }) {
  const arrival = expectedArrival(row);
  switch (arrival.state) {
    case "sin-plazo":
      return <span className="text-xs text-muted-foreground">Sin plazo del proveedor</span>;
    case "sin-pedir":
      return <span className="text-xs text-muted-foreground">Sin pedir</span>;
    case "cerrado":
      // Una fecha sola no dice nada: el pedido cerrado o llegó o se canceló.
      return (
        <span className="text-sm text-muted-foreground">
          {row.status === RestockOrderStatus.CANCELLED ? "Cancelado" : `Llegó el ${formatKardexDay(row.updatedAt)}`}
        </span>
      );
    case "retrasado":
      return (
        <TintBadge
          label={`${arrival.overdueDays} ${arrival.overdueDays === 1 ? "día de retraso" : "días de retraso"}`}
          tone="pink"
        />
      );
    case "hoy":
      return <TintBadge label="Llega hoy" tone="cream" />;
    default:
      return <span className="text-sm text-primary">Llega el {formatKardexDay(arrival.date!)}</span>;
  }
}

export type RestockOrderColumn = RestockOrderRow;

/** Barra de unidades recibidas sobre pedidas; compartida por la tabla y la tarjeta móvil. */
export function RestockProgressCell({ progress, className }: { progress: RestockOrderRow["progress"]; className?: string }) {
  const percent = receivedPercent(progress.receivedUnits, progress.orderedUnits);
  return (
    <div className={cn("flex min-w-[120px] flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">
        {progress.receivedUnits} de {progress.orderedUnits} unidades · {progress.lineCount} {progress.lineCount === 1 ? "línea" : "líneas"}
      </span>
      <ProgressBar percent={percent} barClassName={percent >= 100 ? "bg-tint-mint" : "bg-primary/60"} />
    </div>
  );
}

export const columns: ColumnDef<RestockOrderColumn>[] = [
  {
    accessorKey: "orderNumber",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pedido" />,
    cell: ({ row }) => <span className="font-mono text-sm font-semibold text-primary">{row.original.orderNumber}</span>,
    // Ordena por el número, no por el texto: una fila vieja sin ceros a la
    // izquierda («PO-5») quedaba después de «PO-0038» al ordenar como cadena.
    sortingFn: (a, b) =>
      (parseRestockOrderNumber(a.original.orderNumber) ?? -1) - (parseRestockOrderNumber(b.original.orderNumber) ?? -1),
  },
  {
    id: "supplier",
    accessorFn: (row) => row.supplier.name,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />,
    cell: ({ row }) => <SupplierCell row={row.original} />,
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
    id: "arrival",
    accessorFn: (row) => expectedArrival(row).state,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cuándo llega" />,
    cell: ({ row }) => <ArrivalCell row={row.original} />,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pedido el" />,
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
