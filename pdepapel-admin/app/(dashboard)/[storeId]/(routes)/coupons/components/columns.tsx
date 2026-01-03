"use client";

import { CouponBadge } from "@/components/coupon-badge";
import { Badge } from "@/components/ui/badge";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellNumber } from "@/components/ui/data-table-cell-number";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { UsageCount } from "@/components/usage-count";
import { discountOptions, Models, ModelsColumns } from "@/constants";
import { Coupon, DiscountType } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";

export type CouponColumn = Coupon;

const columnNames = ModelsColumns[Models.Coupons];

export const columns: ColumnDef<CouponColumn>[] = [
  {
    accessorKey: "code",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnNames.code} />
    ),
    cell: ({ row }) => (
      <CouponBadge
        code={row.original.code}
        startDate={row.original.startDate}
        endDate={row.original.endDate}
      />
    ),
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnNames.type} />
    ),
    cell: ({ row }) => (
      <Badge variant="outline">{discountOptions[row.original.type]}</Badge>
    ),
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnNames.amount} />
    ),
    cell: ({ row }) => {
      const amount = row.original.amount;
      const type = row.original.type;
      return type === DiscountType.FIXED ? (
        <DataTableCellCurrency value={amount} />
      ) : (
        <DataTableCellNumber value={amount} isPercentage />
      );
    },
  },
  {
    accessorKey: "minOrderValue",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnNames.minOrderValue}
      />
    ),
    cell: ({ row }) => (
      <DataTableCellCurrency value={row.original.minOrderValue ?? 0} />
    ),
  },
  {
    accessorKey: "usedCount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnNames.usedCount} />
    ),
    cell: ({ row }) => (
      <UsageCount
        used={row.original.usedCount}
        limit={row.original.maxUses as number}
      />
    ),
  },
  {
    accessorKey: "isActive",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnNames.isActive} />
    ),
    cell: ({ row }) => {
      const isActive = row.original.isActive;
      return (
        <Badge variant={isActive ? "success" : "destructive"}>
          {isActive ? "Activo" : "Inactivo"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "startDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnNames.startDate} />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.startDate} />,
  },
  {
    accessorKey: "endDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnNames.endDate} />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.endDate} />,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnNames.createdAt} />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
