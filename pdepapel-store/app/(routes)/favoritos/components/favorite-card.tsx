"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDown, Bell, Flame, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";

import ProductCard from "@/components/ui/product-card";
import { WishlistProduct } from "@/hooks/use-wishlist";
import { getProductAvailability } from "@/lib/product-availability";
import { productPath } from "@/lib/routes";
import { cn, currencyFormatter } from "@/lib/utils";

interface FavoriteCardProps {
  item: WishlistProduct;
  /** Precio guardado cuando bajó desde entonces. */
  previousPrice?: number;
  onAddToCart: (id: string) => void;
  onRemove: (id: string) => void;
}

function formatSavedDate(value: Date | string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "d 'de' MMMM", { locale: es });
}

/** La tarjeta de la tienda tal cual, con una fila de acciones propia de favoritos debajo. */
export function FavoriteCard({ item, previousPrice, onAddToCart, onRemove }: FavoriteCardProps) {
  const availability = getProductAvailability(item);
  const savedDate = formatSavedDate(item.addedOn);
  const href = productPath(item.slug || item.id);
  const canBuy = availability.canBuy && !item.isGroup;

  return (
    <div className="flex flex-col gap-2.5">
      <ProductCard product={item} sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw" />
      <div className="flex flex-col gap-2 px-1">
        <div className="flex min-h-5 flex-wrap items-center gap-2 font-sans text-xs font-bold">
          {previousPrice !== undefined && previousPrice > Number(item.price) && (
            <span className="inline-flex items-center gap-1 text-green-700">
              <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" /> Bajó de {currencyFormatter.format(previousPrice)}
            </span>
          )}
          {availability.status === "low-stock" && (
            <span className="inline-flex items-center gap-1 text-orange-900">
              <Flame aria-hidden="true" className="h-3.5 w-3.5" /> {availability.stockLabel}
            </span>
          )}
          {(availability.status === "sold-out" || availability.status === "coming-soon") && <span className="text-gray-600">{availability.stockLabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          {canBuy ? (
            <button
              type="button"
              onClick={() => onAddToCart(item.id)}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-blue-yankees px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-blue-yankees/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
            >
              <ShoppingCart aria-hidden="true" className="h-4 w-4" />
              Agregar al carrito
            </button>
          ) : item.isGroup ? (
            <Link href={href} className="inline-flex h-11 flex-1 items-center justify-center rounded-full border-2 border-blue-yankees px-3 font-sans text-sm font-semibold text-blue-yankees">
              Elegir opción
            </Link>
          ) : (
            <Link
              href={`${href}#avisame`}
              className={cn("inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border-2 border-blue-yankees px-3 font-sans text-sm font-semibold text-blue-yankees", availability.status === "archived" && "pointer-events-none opacity-50")}
            >
              <Bell aria-hidden="true" className="h-4 w-4" />
              {availability.status === "coming-soon" ? "Avísame cuando llegue" : availability.status === "archived" ? "Ya no disponible" : "Avísame cuando vuelva"}
            </Link>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Quitar ${item.name} de favoritos`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-border bg-white text-gray-500 transition-colors hover:border-blue-yankees hover:text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {savedDate && <p className="font-sans text-[11px] text-gray-500">Guardado el {savedDate}</p>}
      </div>
    </div>
  );
}
