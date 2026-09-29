"use client";

import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TintBadge } from "@/components/ui/tint-badge";
import { getGiftCardBadge } from "@/lib/gift-card-labels";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

import type { GiftCardRow } from "../server/get-gift-cards";

export type GiftCardColumn = GiftCardRow;

export const relativeDate = (date: Date | string) =>
  formatDistanceToNowStrict(new Date(date), { addSuffix: true, locale: es });

export const buildColumns = (storeId: string): ColumnDef<GiftCardColumn>[] => [
  {
    id: "codeLast4",
    accessorFn: (row) => [row.codeLast4, row.purchaseOrder.orderNumber, row.buyerEmail, row.recipientName, row.recipientEmail].filter(Boolean).join(" "),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tarjeta" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={`/${storeId}/tarjetas-regalo/${row.original.id}`} className="font-semibold text-primary hover:underline">
          Termina en {row.original.codeLast4}
        </Link>
        <span className="text-xs text-muted-foreground">
          Pedido{" "}
          <Link href={`/${storeId}/pedidos/${row.original.purchaseOrder.id}`} className="hover:underline">
            {row.original.purchaseOrder.orderNumber}
          </Link>
          <span aria-hidden="true"> · </span>
          <span title={new Date(row.original.issuedAt).toLocaleString("es-CO")}>{relativeDate(row.original.issuedAt)}</span>
        </span>
      </div>
    ),
  },
  {
    id: "buyer",
    accessorFn: (row) => row.purchaseOrder.fullName,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Quien compró" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 max-w-[190px] flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium">{row.original.purchaseOrder.fullName}</span>
        {row.original.buyerEmail && <span className="truncate text-[11px] text-muted-foreground">{row.original.buyerEmail}</span>}
      </div>
    ),
  },
  {
    id: "recipient",
    accessorFn: (row) => row.recipientName ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Quien recibe" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 max-w-[190px] flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium">{row.original.recipientName || "Se entrega en mano"}</span>
        {row.original.recipientEmail && <span className="truncate text-[11px] text-muted-foreground">{row.original.recipientEmail}</span>}
      </div>
    ),
  },
  {
    id: "initialAmount",
    accessorKey: "initialAmount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Valor" />,
    cell: ({ row }) => <DataTableCellCurrency value={row.original.initialAmount} />,
  },
  {
    id: "balance",
    accessorKey: "balance",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Saldo" />,
    cell: ({ row }) => (
      <span className={row.original.balance < row.original.initialAmount ? "font-semibold" : ""}>
        <DataTableCellCurrency value={row.original.balance} />
      </span>
    ),
  },
  {
    id: "status",
    accessorFn: (row) => getGiftCardBadge(row).label,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => {
      const badge = getGiftCardBadge(row.original);
      return (
        <span className="flex flex-wrap items-center gap-1">
          <TintBadge label={badge.label} tone={badge.tone} />
          {!row.original.deliveredAt && row.original.status === "ACTIVE" && <TintBadge label="Correo pendiente" tone="cream" />}
          {row.original.redemptions > 0 && <TintBadge label={`${row.original.redemptions} ${row.original.redemptions === 1 ? "uso" : "usos"}`} tone="sky" />}
        </span>
      );
    },
  },
];
