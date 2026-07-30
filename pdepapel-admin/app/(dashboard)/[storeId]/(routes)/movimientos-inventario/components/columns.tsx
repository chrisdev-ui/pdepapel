"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { Bot, Crown, User } from "lucide-react";
import { getInventoryMovements } from "../server/get-movements";
import { CellAction } from "./cell-action";

export type InventoryMovementColumn = Awaited<
  ReturnType<typeof getInventoryMovements>
>[number];

// Simple translation map for display
export const typeLabels: Record<string, string> = {
  ORDER_PLACED: "Venta",
  ORDER_CANCELLED: "Cancelación",
  MANUAL_ADJUSTMENT: "Ajuste Manual",
  INITIAL_INTAKE: "Inventario Inicial",
  PURCHASE: "Compra",
  RETURN: "Devolución",
  DAMAGE: "Daño",
  LOST: "Pérdida",
  RESTOCK_RECEIVED: "Reabastecimiento",
  INITIAL_MIGRATION: "Migración",
  PROMOTION: "Promoción",
  STORE_USE: "Uso Interno",
};

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

      if (type === "ORDER_PLACED" || type === "DAMAGE" || type === "LOST") {
        variant = "destructive";
      } else if (
        type === "ORDER_CANCELLED" ||
        type === "RETURN" ||
        type === "PURCHASE" ||
        type === "RESTOCK_RECEIVED"
      ) {
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
