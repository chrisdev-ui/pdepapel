"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TintBadge } from "@/components/ui/tint-badge";
import { compareDiscounts, formatDiscount, getPromotionStatus, PROMOTION_STATUS } from "@/lib/promotion-status";
import { currencyFormatter } from "@/lib/utils";

import type { getOffers } from "../server/get-offers";
import { CellAction } from "./cell-action";

export type OfferColumn = Awaited<ReturnType<typeof getOffers>>[number];

const DAY = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const YEAR = new Intl.DateTimeFormat("es-CO", { year: "numeric", timeZone: "America/Bogota" });

/** «9 sept – 26 dic 2026»: corto para que la tabla quepa a 1440 sin desplazamiento. */
export function offerWindow(offer: Pick<OfferColumn, "startDate" | "endDate">): string {
  const day = (value: Date) => DAY.format(value).replace(/ de /g, " ").replace(/\.$/, "");
  const start = new Date(offer.startDate);
  const end = new Date(offer.endDate);
  return `${day(start)} – ${day(end)} ${YEAR.format(end)}`;
}

export function offerScope(offer: OfferColumn): string {
  const parts: string[] = [];
  if (offer._count.products > 0) parts.push(`${offer._count.products} producto${offer._count.products === 1 ? "" : "s"}`);
  if (offer._count.categories > 0) parts.push(`${offer._count.categories} subcategoría${offer._count.categories === 1 ? "" : "s"}`);
  if (offer._count.productGroups > 0) parts.push(`${offer._count.productGroups} grupo${offer._count.productGroups === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Sin productos";
}

/** Muestra de lo que entra: los primeros nombres y cuántos más. */
export function offerSample(offer: OfferColumn): string {
  if (offer.sampleNames.length === 0) return "";
  const rest = offer._count.products - offer.sampleNames.length;
  return `${offer.sampleNames.join(", ")}${rest > 0 ? ` y ${rest} más` : ""}`;
}

export function OfferStatusBadge({ offer }: { offer: OfferColumn }) {
  const status = PROMOTION_STATUS[getPromotionStatus(offer)];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <TintBadge label={status.label} tone={status.tone} />
      {offer.scopeExhausted && getPromotionStatus(offer) === "vigente" && <TintBadge label="Sin productos a la venta" tone="cream" />}
    </span>
  );
}

export function OfferLabel({ offer }: { offer: OfferColumn }) {
  return offer.label ? (
    <span className="flex">
      <TintBadge label={offer.label} tone="pink" className="h-5 max-w-full truncate text-[11px]" />
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">Sin etiqueta: solo el precio tachado</span>
  );
}

export function buildOfferColumns(storeId: string): ColumnDef<OfferColumn>[] {
  return [
    {
      id: "name",
      accessorFn: (row) => `${row.name} ${row.label ?? ""} ${row.sampleNames.join(" ")}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Oferta" />,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={`/${storeId}/ofertas/${row.original.id}`} className="truncate text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={(event) => event.stopPropagation()}>
            {row.original.name}
          </Link>
          <OfferLabel offer={row.original} />
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
      cell: ({ row }) => (
        <div className="flex min-w-0 max-w-[240px] flex-col">
          <span className="text-sm">{offerScope(row.original)}</span>
          {offerSample(row.original) && <span className="truncate text-xs text-muted-foreground">{offerSample(row.original)}</span>}
        </div>
      ),
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
        <span className="whitespace-nowrap text-xs text-muted-foreground">{offerWindow(row.original)}</span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => <CellAction data={row.original} />,
    },
  ];
}
