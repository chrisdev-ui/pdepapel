"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TintBadge } from "@/components/ui/tint-badge";
import { currencyFormatter } from "@/lib/utils";

export type TaxSaleRow = {
  orderNumber: string;
  customerName: string;
  channel: "Tienda en línea" | "Venta presencial" | "Mercado Libre";
  totalAmount: number;
  occurredAt: string;
  /** Sale del reporte para poder abrir el pedido; las de Mercado Libre no lo traen. */
  orderId: string | null;
};

export type TaxPurchaseRow = {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  totalAmount: number;
  issuedAt: string;
  notes: string | null;
};

const DATE = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota" });
export const formatTaxDate = (value: string) => DATE.format(new Date(value));

const CHANNEL_TONE: Record<TaxSaleRow["channel"], string> = {
  "Tienda en línea": "sky",
  "Venta presencial": "lavender",
  "Mercado Libre": "cream",
};

export function buildSalesColumns(
  storeId: string,
  dateHeader: string,
): ColumnDef<TaxSaleRow>[] {
  return [
    {
      accessorKey: "orderNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Número de orden" />
      ),
      cell: ({ row }) =>
        /*
          Una venta que se ve y no se puede abrir obliga a copiar el número e
          irlo a buscar a Pedidos. Las de Mercado Libre no tienen pedido propio
          en el panel, así que esas se quedan como texto.
        */
        row.original.orderId ? (
          <Link
            href={`/${storeId}/pedidos/${row.original.orderId}`}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {row.original.orderNumber}
          </Link>
        ) : (
          <span className="font-semibold text-primary">
            {row.original.orderNumber}
          </span>
        ),
    },
    {
      accessorKey: "customerName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Nombre de la persona" />
      ),
      cell: ({ row }) => (
        <span className="block max-w-[260px] truncate">
          {row.original.customerName}
        </span>
      ),
    },
    {
      accessorKey: "channel",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Canal" />
      ),
      cell: ({ row }) => (
        <TintBadge
          tone={CHANNEL_TONE[row.original.channel] ?? "slate"}
          label={row.original.channel}
        />
      ),
      filterFn: (row, id, value: string[]) =>
        value.includes(String(row.getValue(id))),
    },
    {
      accessorKey: "occurredAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={dateHeader} />
      ),
      cell: ({ row }) => formatTaxDate(row.original.occurredAt),
      enableGlobalFilter: false,
    },
    {
      accessorKey: "totalAmount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Valor" />
      ),
      cell: ({ row }) => (
        <span className="block text-right font-semibold tabular-nums">
          {currencyFormatter(row.original.totalAmount)}
        </span>
      ),
      enableGlobalFilter: false,
    },
  ];
}

export function buildPurchasesColumns(
  onEdit: (purchase: TaxPurchaseRow) => void,
  onDelete: (purchase: TaxPurchaseRow) => void,
  canWrite: boolean,
): ColumnDef<TaxPurchaseRow>[] {
  const columns: ColumnDef<TaxPurchaseRow>[] = [
    {
      accessorKey: "invoiceNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Número de factura" />
      ),
      cell: ({ row }) => (
        <span className="font-semibold text-primary">
          {row.original.invoiceNumber}
        </span>
      ),
    },
    {
      accessorKey: "supplierName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Empresa" />
      ),
      cell: ({ row }) => (
        <span className="block max-w-[280px] truncate">
          {row.original.supplierName}
        </span>
      ),
    },
    {
      accessorKey: "issuedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Fecha" />
      ),
      cell: ({ row }) => formatTaxDate(row.original.issuedAt),
      enableGlobalFilter: false,
    },
    {
      accessorKey: "totalAmount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Valor" />
      ),
      cell: ({ row }) => (
        <span className="block text-right font-semibold tabular-nums">
          {currencyFormatter(row.original.totalAmount)}
        </span>
      ),
      enableGlobalFilter: false,
    },
  ];

  if (!canWrite) return columns;

  columns.push({
    id: "acciones",
    header: () => <span className="sr-only">Acciones</span>,
    enableGlobalFilter: false,
    cell: ({ row }) => (
      <div className="flex justify-end gap-1" data-no-row-click>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Editar factura ${row.original.invoiceNumber}`}
          onClick={() => onEdit(row.original)}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Eliminar factura ${row.original.invoiceNumber}`}
          onClick={() => onDelete(row.original)}
        >
          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
        </Button>
      </div>
    ),
  });

  return columns;
}
