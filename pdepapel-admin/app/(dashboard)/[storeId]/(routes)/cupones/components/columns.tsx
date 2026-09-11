"use client";

import { Coupon } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { UsageCount } from "@/components/usage-count";
import { PROMOTION_STATUS, compareDiscounts, formatDiscount, getPromotionStatus } from "@/lib/promotion-status";
import { currencyFormatter } from "@/lib/utils";

import { TintBadge } from "../../pedidos/components/order-badges";
import { CellAction } from "./cell-action";

export type CouponColumn = Coupon;

const SHORT_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });

export function CouponStatusBadge({ coupon }: { coupon: CouponColumn }) {
  const status = PROMOTION_STATUS[getPromotionStatus(coupon)];
  return <TintBadge label={status.label} tone={status.tone} />;
}

export function buildCouponColumns(storeId: string): ColumnDef<CouponColumn>[] {
  return [
    {
      accessorKey: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Código" />,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/${storeId}/cupones/${row.original.id}`}
            className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.code}
          </Link>
          {row.original.isWelcomeBenefit && <span className="text-xs text-muted-foreground">Solo cuentas nuevas</span>}
        </div>
      ),
    },
    {
      id: "discount",
      accessorKey: "amount",
      sortingFn: (a, b) => compareDiscounts(a.original, b.original),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descuento" />,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-semibold tabular-nums">{formatDiscount(row.original.type, row.original.amount, currencyFormatter)}</span>
          {row.original.minOrderValue ? <span className="text-xs text-muted-foreground">Mínimo {currencyFormatter(row.original.minOrderValue)}</span> : null}
        </div>
      ),
    },
    {
      accessorKey: "usedCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Usos" />,
      cell: ({ row }) => <UsageCount used={row.original.usedCount} limit={row.original.maxUses ?? 0} />,
    },
    {
      id: "status",
      accessorFn: (row) => getPromotionStatus(row),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <CouponStatusBadge coupon={row.original} />,
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
