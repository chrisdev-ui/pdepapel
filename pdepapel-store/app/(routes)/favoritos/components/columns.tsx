"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BadgeAlert, BadgeCheck, ImageOff } from "lucide-react";
import Link from "next/link";

import { CldImage } from "@/components/ui/CldImage";
import { Checkbox } from "@/components/ui/checkbox";
import { Currency } from "@/components/ui/currency";
import { cn } from "@/lib/utils";
import { productPath } from "@/lib/routes";
import { AddToCartButton } from "./add-to-cart-button";
import { DeleteButton } from "./delete-button";

export type WishlistColumn = {
  id: string;
  slug?: string;
  imageUrl?: string;
  name: string;
  price: string | number;
  originalPrice?: number;
  hasDiscount?: boolean;
  offerLabel?: string | null;
  stock: string | number;
  createdAt: Date;
  color?: string;
  design?: string;
};

export const columns: ColumnDef<WishlistColumn>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Seleccionar todo"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Seleccionar fila"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "imageUrl",
    header: "",
    cell: ({ row }) => (
      <Link
        href={productPath(row.original.slug || row.original.id)}
        className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-gray-100 sm:h-24 sm:w-24"
      >
        {row.original.imageUrl ? (
          <CldImage
            fill
            src={row.original.imageUrl}
            alt={row.original.name ?? "Imagen del producto"}
            sizes="(max-width: 640px) 100vw, 640px"
            className="object-cover object-center"
          />
        ) : (
          <>
            <ImageOff aria-hidden="true" className="h-5 w-5 text-gray-400" />
            <span className="sr-only">Sin imagen disponible</span>
          </>
        )}
      </Link>
    ),
  },
  {
    accessorKey: "name",
    header: () => (
      <div className="font-serif text-base font-bold">Nombre del producto</div>
    ),
    cell: ({ row }) => (
      <Link
        href={productPath(row.original.slug || row.original.id)}
        className="flex flex-col hover:underline"
      >
        <span className="font-medium">{row.original.name}</span>
        {row.original.design && (
          <span className="text-xs text-gray-400">{`Diseño: ${row.original.design}`}</span>
        )}
        {row.original.color && (
          <span className="text-xs text-gray-400">{`Color: ${row.original.color}`}</span>
        )}
      </Link>
    ),
  },
  {
    accessorKey: "price",
    header: () => (
      <div className="font-serif text-base font-bold">Precio por unidad</div>
    ),
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        {row.original.hasDiscount ||
        (row.original.originalPrice &&
          row.original.originalPrice > Number(row.original.price)) ? (
          <>
            <div className="flex items-center gap-2">
              <Currency className="text-lg" value={row.original.price} />
              <Currency
                className="text-sm text-gray-500 line-through"
                value={row.original.originalPrice}
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
                Number(row.original.originalPrice) - Number(row.original.price),
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
