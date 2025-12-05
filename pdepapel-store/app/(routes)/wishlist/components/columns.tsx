"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BadgeAlert, BadgeCheck } from "lucide-react";

import { CldImage } from "@/components/ui/CldImage";
import { Checkbox } from "@/components/ui/checkbox";
import { Currency } from "@/components/ui/currency";
import { cn } from "@/lib/utils";
import { AddToCartButton } from "./add-to-cart-button";
import { DeleteButton } from "./delete-button";

export type WishlistColumn = {
  id: string;
  imageUrl: string;
  name: string;
  price: string | number;
  discountedPrice?: number;
  offerLabel?: string | null;
  stock: string | number;
  createdAt: Date;
};

export const columns: ColumnDef<WishlistColumn>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsSomePageRowsSelected()
            ? "indeterminate"
            : table.getIsAllPageRowsSelected()
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "imageUrl",
    header: "",
    cell: ({ row }) => (
      <div className="relative h-12 w-12 overflow-hidden rounded-md sm:h-24 sm:w-24">
        <CldImage
          fill
          src={row.original.imageUrl}
          alt={row.original.name ?? "Imagen del producto"}
          sizes="(max-width: 640px) 100vw, 640px"
          className="object-cover object-center"
          priority
        />
      </div>
    ),
  },
  {
    accessorKey: "name",
    header: () => (
      <div className="font-serif text-base font-bold">Nombre del producto</div>
    ),
  },
  {
    accessorKey: "price",
    header: () => (
      <div className="font-serif text-base font-bold">Precio por unidad</div>
    ),
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        {row.original.discountedPrice &&
        row.original.discountedPrice < Number(row.original.price) ? (
          <>
            <div className="flex items-center gap-2">
              <Currency
                className="text-lg"
                value={row.original.discountedPrice}
              />
              <Currency
                className="text-sm text-gray-500 line-through"
                value={row.original.price}
              />
            </div>
            <span className="text-xs text-green-600">
              Ahorra{" "}
              {new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(
                Number(row.original.price) - row.original.discountedPrice,
              )}
            </span>
            {row.original.offerLabel && (
              <span className="inline-block w-fit rounded bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                {row.original.offerLabel}
              </span>
            )}
          </>
        ) : (
          <Currency className="text-lg" value={row.original.price} />
        )}
      </div>
    ),
  },
  {
    accessorKey: "stock",

    header: () => (
      <div className="font-serif text-base font-bold">Disponibilidad</div>
    ),
    cell: ({ row }) => (
      <div
        className={cn("flex items-center gap-2", {
          "text-success": Number(row.original.stock) > 0,
          "text-destructive": Number(row.original.stock) === 0,
        })}
      >
        {Number(row.original.stock) > 0 ? (
          <BadgeCheck className="h-5 w-5" />
        ) : (
          <BadgeAlert className="h-5 w-5" />
        )}
        <span>
          {Number(row.original.stock) > 0 ? "Disponible" : "No Disponible"}
        </span>
      </div>
    ),
  },
  {
    id: "delete",
    cell: ({ row }) => <DeleteButton row={row} />,
  },
  {
    id: "add",
    cell: ({ row }) => (
      <div className="flex flex-col items-center justify-center space-y-1">
        <span className="text-xs text-gray-400">
          Agregado el{" "}
          {format(new Date(row.original.createdAt), "PPP", { locale: es })}
        </span>
        <AddToCartButton row={row} />
      </div>
    ),
  },
];
