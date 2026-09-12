"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { MOVEMENT_LABELS } from "@/lib/kardex";
import { ColumnDef } from "@tanstack/react-table";
import { Bot, Crown, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { InventoryMovementRow } from "../server/get-movements";
import { CellAction } from "./cell-action";

export type InventoryMovementColumn = InventoryMovementRow;

/** Mismos nombres que el kardex del producto: una sola forma de llamar cada movimiento. */
export const typeLabels: Record<string, string> = MOVEMENT_LABELS;

/** El nombre del producto lleva a su kardex (historial con saldo). */
function ProductCell({ row }: { row: InventoryMovementColumn }) {
  const params = useParams();
  const storeId = String(params.storeId);
  if (!row.productId) {
    return (
      <div className="max-w-[280px] truncate" title={row.productName}>
        {row.productName}
      </div>
    );
  }
  return (
    <Link
      href={`/${storeId}/movimientos-inventario/producto/${row.productId}`}
      className="block max-w-[280px] truncate font-semibold text-primary hover:underline"
      title={`Ver kardex de ${row.productName}`}
      data-no-row-click
    >
      {row.productName}
    </Link>
  );
}

export const columns: ColumnDef<InventoryMovementColumn>[] = [
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha" />
    ),
    cell: ({ row }) => (
      <DataTableCellDate date={row.original.createdAt} showTime />
    ),
  },
  {
    accessorKey: "userName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Usuario" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-x-2">
        {row.original.userImage === "BOT" ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200">
            <Bot className="h-5 w-5 text-slate-600" />
          </div>
        ) : !row.original.userImage ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200">
            <User className="h-5 w-5 text-slate-600" />
          </div>
        ) : (
          <div className="relative">
            <DataTableCellImage
              src={row.original.userImage}
              alt={row.original.userName}
              ratio={1 / 1}
              className="h-8 w-8 rounded-full"
            />
            {row.original.isOwner && (
              <div className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400 ring-2 ring-white">
                <Crown className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
        )}
        <span>{row.original.userName}</span>
      </div>
    ),
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tipo" />
    ),
    cell: ({ row }) => {
      const type = row.original.type;
      let variant: "default" | "secondary" | "destructive" | "outline" =
        "default";

      if (row.original.quantity < 0) {
        variant = "destructive";
      } else if (row.original.quantity > 0) {
        variant = "default";
      } else {
        variant = "secondary";
      }

      return <Badge variant={variant}>{typeLabels[type] || type}</Badge>;
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "productName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Producto" />
    ),
    cell: ({ row }) => <ProductCell row={row.original} />,
  },
  {
    accessorKey: "quantity",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Cantidad" />
    ),
    cell: ({ row }) => (
      <span
        className={`font-bold ${
          row.original.quantity > 0 ? "text-green-600" : "text-red-600"
        }`}
      >
        {row.original.quantity > 0 ? "+" : ""}
        {row.original.quantity}
      </span>
    ),
  },
  {
    accessorKey: "newStock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stock Resultante" />
    ),
  },
  {
    accessorKey: "cost",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Costo Unit." />
    ),
    cell: ({ row }) => <DataTableCellCurrency value={row.original.cost} />,
  },
  {
    accessorKey: "price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Precio Venta" />
    ),
    cell: ({ row }) => <DataTableCellCurrency value={row.original.price} />,
  },
  {
    accessorKey: "reason",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Motivo/Ref" />
    ),
    cell: ({ row }) => (
      <div className="max-w-[200px] truncate" title={row.original.reason}>
        {row.original.reason}
      </div>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
