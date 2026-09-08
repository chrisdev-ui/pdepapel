"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { SEGMENT_LABELS } from "@/lib/customer-views";

import { TintBadge } from "../../pedidos/components/order-badges";
import { relativeDate } from "../../pedidos/components/columns";
import type { CustomerRow } from "../server/get-customers";
import { CellAction } from "./cell-action";

export type CustomerColumn = CustomerRow;

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
  return local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : phone;
}

export function buildColumns(storeId: string): ColumnDef<CustomerColumn>[] {
  return [
    {
      id: "customer",
      accessorFn: (row) => `${row.fullName} ${row.phone} ${row.email ?? ""} ${row.city ?? ""}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/${storeId}/clientes/${row.original.id}`}
            className="truncate text-sm font-semibold text-primary underline-offset-4 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.fullName}
          </Link>
          <span className="truncate text-xs text-muted-foreground">
            {formatPhone(row.original.phone)}
            {row.original.city ? ` · ${row.original.city}` : ""}
          </span>
        </div>
      ),
    },
    {
      id: "segment",
      accessorKey: "segment",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Segmento" />,
      cell: ({ row }) => {
        const badge = SEGMENT_LABELS[row.original.segment];
        return <TintBadge label={badge.label} tone={badge.tone} />;
      },
      filterFn: (row, _id, value: string[]) => value.length === 0 || value.includes(row.original.segment),
    },
    {
      accessorKey: "paidOrders",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Compras" />,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.paidOrders}
          {row.original.pendingOrders > 0 && (
            <span className="text-xs text-muted-foreground"> · {row.original.pendingOrders} pendiente{row.original.pendingOrders === 1 ? "" : "s"}</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "totalSpent",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Gastado" />,
      cell: ({ row }) => <DataTableCellCurrency value={row.original.totalSpent} />,
    },
    {
      accessorKey: "averageOrderValue",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ticket" />,
      cell: ({ row }) =>
        row.original.averageOrderValue > 0 ? <DataTableCellCurrency value={row.original.averageOrderValue} /> : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      id: "favorite",
      accessorFn: (row) => row.favoriteProducts[0]?.name ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lo que más compra" />,
      cell: ({ row }) => {
        const [first, ...rest] = row.original.favoriteProducts;
        if (!first) return <span className="text-xs text-muted-foreground">Sin compras</span>;
        return (
          <span className="block max-w-[220px] truncate text-sm" title={row.original.favoriteProducts.map((product) => `${product.name} (${product.count})`).join(", ")}>
            {first.name}
            {rest.length > 0 && <span className="text-muted-foreground"> y {rest.length} más</span>}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "lastPaidAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Última compra" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {row.original.lastPaidAt ? relativeDate(row.original.lastPaidAt) : "Nunca"}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => <CellAction data={row.original} />,
    },
  ];
}
