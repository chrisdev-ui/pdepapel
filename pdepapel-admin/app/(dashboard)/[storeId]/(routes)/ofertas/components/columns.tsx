"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { currencyFormatter } from "@/lib/utils";
import { DiscountType } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { getOffers } from "../server/get-offers";
import { CellAction } from "./cell-action";

export type OfferColumn = Awaited<ReturnType<typeof getOffers>>[number];

export const columns: ColumnDef<OfferColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tipo" />
    ),
    cell: ({ row }) => (
      <div>
        {row.original.type === DiscountType.PERCENTAGE
          ? "Porcentaje"
          : "Monto fijo"}
      </div>
    ),
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Valor" />
    ),
    cell: ({ row }) => (
      <div>
        {row.original.type === DiscountType.PERCENTAGE
          ? `${row.original.amount}%`
          : currencyFormatter(row.original.amount)}
      </div>
    ),
  },
  {
    accessorKey: "scope",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Alcance" />
    ),
    cell: ({ row }) => {
      const counts = row.original._count;
      return (
        <div className="flex gap-2">
          {counts.products > 0 && (
            <div className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
              <span className="font-medium">{counts.products}</span> Prods
            </div>
          )}
          {counts.categories > 0 && (
            <div className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
              <span className="font-medium">{counts.categories}</span> Cats
            </div>
          )}
          {counts.productGroups > 0 && (
            <div className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
              <span className="font-medium">{counts.productGroups}</span> Grupos
            </div>
          )}
          {counts.products === 0 &&
            counts.categories === 0 &&
            counts.productGroups === 0 && (
              <span className="text-xs text-muted-foreground">-</span>
            )}
        </div>
      );
    },
  },
  {
    accessorKey: "isActive",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado" />
    ),
    cell: ({ row }) => (
      <div
        className={
          row.original.isActive ? "font-medium text-green-600" : "text-red-600"
        }
      >
        {row.original.isActive ? "Activa" : "Inactiva"}
      </div>
    ),
  },
  {
    accessorKey: "startDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Inicio" />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.startDate} />,
  },
  {
    accessorKey: "endDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fin" />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.endDate} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
