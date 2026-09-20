"use client";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TintBadge } from "@/components/ui/tint-badge";
import { formatKardexDate, formatSignedQuantity, MOVEMENT_LABELS, MOVEMENT_TONES } from "@/lib/kardex";
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { Bot, Crown, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { InventoryMovementRow } from "../server/get-movements";
import { CellAction } from "./cell-action";

export type InventoryMovementColumn = InventoryMovementRow;

/** Miniatura de tamaño fijo: el cargador de Cloudinary ajusta el ancho pedido. */
function Thumb({ src, alt, className }: { src: string; alt: string; className: string }) {
  return <Image src={src} alt={alt} width={72} height={72} className={className} />;
}

/** Mismos nombres que el kardex del producto: una sola forma de llamar cada movimiento. */
export const typeLabels: Record<string, string> = MOVEMENT_LABELS;

/** El nombre del producto lleva a su kardex (historial con saldo). */
function ProductCell({ row }: { row: InventoryMovementColumn }) {
  const params = useParams();
  const storeId = String(params.storeId);
  const name = (
    <span className="block truncate font-semibold text-primary" title={row.productName}>
      {row.productName}
    </span>
  );
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {row.productImage ? (
        <Thumb src={row.productImage} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded-md bg-muted" aria-hidden="true" />
      )}
      <div className="min-w-0 max-w-[190px]">
        {row.productId ? (
          <Link
            href={`/${storeId}/movimientos-inventario/producto/${row.productId}`}
            className="hover:underline"
            title={`Ver kardex de ${row.productName}`}
            data-no-row-click
          >
            {name}
          </Link>
        ) : (
          name
        )}
        {row.productSku ? <span className="block truncate font-mono text-xs text-muted-foreground">{row.productSku}</span> : null}
      </div>
    </div>
  );
}

/** De dónde viene el movimiento, ya resuelto por el cargador. */
function OriginCell({ row }: { row: InventoryMovementColumn }) {
  const reference = row.reference;
  if (!reference) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="min-w-0 max-w-[170px]">
      {reference.href ? (
        <Link href={reference.href} className="block truncate text-sm font-medium text-primary hover:underline" data-no-row-click>
          {reference.label}
        </Link>
      ) : (
        <span className="block truncate text-sm text-primary" title={reference.label}>
          {reference.label}
        </span>
      )}
      {reference.secondary ? (
        <span className="block truncate text-xs text-muted-foreground" title={reference.secondary}>
          {reference.secondary}
        </span>
      ) : null}
    </div>
  );
}

export const columns: ColumnDef<InventoryMovementColumn>[] = [
  {
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cuándo" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-sm text-primary">{formatKardexDate(row.original.createdAt)}</span>,
  },
  {
    accessorKey: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Movimiento" />,
    // El tono sale del tipo, no del signo de la cantidad: una venta siempre se
    // ve igual, una pérdida siempre se ve igual, en la lista y en el kardex.
    cell: ({ row }) => <TintBadge label={MOVEMENT_LABELS[row.original.type]} tone={MOVEMENT_TONES[row.original.type]} />,
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "productName",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Producto" />,
    cell: ({ row }) => <ProductCell row={row.original} />,
  },
  {
    accessorKey: "quantity",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cantidad" />,
    cell: ({ row }) => {
      const quantity = row.original.quantity;
      return (
        <span
          className={cn(
            "whitespace-nowrap text-right font-mono text-sm font-semibold tabular-nums",
            quantity > 0 && "text-emerald-700",
            quantity < 0 && "text-red-600",
            // Un movimiento de cero unidades no suma ni resta: en rojo parecía una salida.
            quantity === 0 && "text-muted-foreground",
          )}
        >
          {quantity === 0 ? "0" : formatSignedQuantity(quantity)}
        </span>
      );
    },
  },
  {
    accessorKey: "newStock",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Saldo" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-right font-mono text-sm font-bold tabular-nums text-primary">
        {row.original.newStock.toLocaleString("es-CO")}
      </span>
    ),
  },
  {
    id: "origen",
    // El buscador recorre las columnas visibles, así que el acceso devuelve texto.
    accessorFn: (row) => [row.reference?.label, row.reference?.secondary].filter(Boolean).join(" "),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Origen" />,
    cell: ({ row }) => <OriginCell row={row.original} />,
  },
  {
    accessorKey: "userName",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Quién" />,
    cell: ({ row }) => {
      const { userImage, userName, isOwner } = row.original;
      return (
        <div className="flex min-w-0 items-center gap-2">
          {userImage === "BOT" ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true">
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          ) : userImage ? (
            <span className="relative shrink-0">
              <Thumb src={userImage} alt="" className="h-7 w-7 rounded-full object-cover" />
              {isOwner ? (
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-tint-cream ring-2 ring-white">
                  <Crown className="h-2 w-2 text-primary" aria-hidden="true" />
                </span>
              ) : null}
            </span>
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
          <span className="max-w-[120px] truncate text-sm text-primary">{userName}</span>
        </div>
      );
    },
  },
  {
    id: "actions",
    enableGlobalFilter: false,
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
