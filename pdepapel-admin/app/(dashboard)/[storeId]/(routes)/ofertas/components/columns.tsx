"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { PROMOTION_STATUS, compareDiscounts, formatDiscount, getPromotionStatus } from "@/lib/promotion-status";
import { currencyFormatter } from "@/lib/utils";

import { TintBadge } from "../../pedidos/components/order-badges";
import { getOffers } from "../server/get-offers";
import { CellAction } from "./cell-action";

export type OfferColumn = Awaited<ReturnType<typeof getOffers>>[number];

const SHORT_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });

export function offerScope(offer: OfferColumn): string {
  const parts: string[] = [];
  if (offer._count.products > 0) parts.push(`${offer._count.products} producto${offer._count.products === 1 ? "" : "s"}`);
  if (offer._count.categories > 0) parts.push(`${offer._count.categories} categoría${offer._count.categories === 1 ? "" : "s"}`);
  if (offer._count.productGroups > 0) parts.push(`${offer._count.productGroups} grupo${offer._count.productGroups === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Sin productos";
}

export function OfferStatusBadge({ offer }: { offer: OfferColumn }) {
  const status = PROMOTION_STATUS[getPromotionStatus(offer)];
  return <TintBadge label={status.label} tone={status.tone} />;
}

export function buildOfferColumns(storeId: string): ColumnDef<OfferColumn>[] {
  return [
    {
      id: "name",
      accessorFn: (row) => `${row.name} ${row.label ?? ""}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Oferta" />,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/${storeId}/ofertas/${row.original.id}`}
            className="truncate text-sm font-semibold text-primary underline-offset-4 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.name}
          </Link>
          <span className="truncate text-xs text-muted-foreground">{row.original.label ? `Etiqueta pública: ${row.original.label}` : offerScope(row.original)}</span>
        </div>
      ),
    },
    {
      id: "discount",
      accessorKey: "amount",
      sortingFn: (a, b) => compareDiscounts(a.original, b.original),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descuento" />,
      cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{formatDiscount(row.original.type, row.original.amount, currencyFormatter)}</span>,
    },
    {
      id: "scope",
      accessorFn: (row) => offerScope(row),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Aplica a" />,
      cell: ({ row }) => <span className="text-sm">{offerScope(row.original)}</span>,
      enableSorting: false,
    },
    {
      id: "status",
      accessorFn: (row) => getPromotionStatus(row),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <OfferStatusBadge offer={row.original} />,
      filterFn: (row, _id, value: string[]) => value.length === 0 || value.includes(getPromotionStatus(row.original)),
    },
    {
      accessorKey: "startDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vigencia" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {SHORT_DATE.format(new Date(row.original.startDate))} – {SHORT_DATE.format(new Date(row.original.endDate))}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => <CellAction data={row.original} />,
    },
  ];
}
