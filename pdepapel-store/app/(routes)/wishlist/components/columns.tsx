"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BadgeAlert, BadgeCheck } from "lucide-react";
import Image from "next/image";

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
        <Image
          fill
          src={row.original.imageUrl}
          alt={row.original.name}
          sizes="(max-width: 640px) 100vw, 640px"
          className="object-cover object-center"
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
      <Currency className="text-lg" value={row.original.price} />
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
          Agregado el {format(row.original.createdAt, "PPP", { locale: es })}
        </span>
        <AddToCartButton row={row} />
      </div>
    ),
  },
];
