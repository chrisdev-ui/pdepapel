"use client";

import { ArrowDown, ArrowUp, Flame, Heart, PackageX, ShoppingBag, X } from "lucide-react";
import Link from "next/link";

import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { useCart } from "@/hooks/use-cart";
import { toast } from "@/hooks/use-toast";
import { useWishlist } from "@/hooks/use-wishlist";
import { getCustomerFacingProductOptions } from "@/lib/product-options";
import { productPath } from "@/lib/routes";
import { cn, currencyFormatter } from "@/lib/utils";
import { Product } from "@/types";

export interface PriceChange {
  from: number;
  to: number;
}

interface CartItemProps {
  item: Product;
  priceChange?: PriceChange;
  onRemove: (id: string) => void;
}

const ICON_BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2";

export const CartItem: React.FC<CartItemProps> = ({ item, priceChange, onRemove }) => {
  const updateQuantity = useCart((state) => state.updateQuantity);
  const removeItem = useCart((state) => state.removeItem);
  const addToWishlist = useWishlist((state) => state.addItem);
  const isSaved = useWishlist((state) => state.items.some((saved) => saved.id === item.id));

  const mainImage = item.images?.find((image) => image.isMain) ?? item.images?.[0];
  const quantity = Number(item.quantity ?? 1);
  const unit = Number(item.price);
  const lineTotal = unit * quantity;
  const hasOffer = Boolean(item.hasDiscount || (item.originalPrice && item.originalPrice > unit));
  const options = [item.color ? `Color: ${item.color.name}` : null, ...getCustomerFacingProductOptions(item).map((option) => `${option.name}: ${option.value}`), item.design ? `Diseño: ${item.design.name}` : null].filter(Boolean);
  const href = productPath(item.slug || item.id);
  const soldOut = item.stock === 0;
  const overStock = !soldOut && quantity > item.stock;
  const lowStock = !soldOut && !overStock && item.stock <= 3;

  const onQuantity = (value: number) => {
    const result = updateQuantity(item.id, value);
    if (!result.ok) {
      toast({ description: result.status === "stock_limit" ? `Solo quedan ${item.stock} unidades de este producto.` : "Este producto ya no está disponible.", variant: "warning" });
    }
  };

  const saveForLater = () => {
    if (!isSaved) addToWishlist(item);
    removeItem(item.id);
  };

  return (
    <li className="flex gap-4 border-b border-border py-5 sm:gap-5">
      <Link href={href} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-28 sm:w-28" aria-label={`Ver ${item.name}`}>
        {mainImage?.url ? (
          <CloudinaryImage src={mainImage.url} alt="" width={112} height={112} className={cn("h-full w-full object-cover object-center", soldOut && "opacity-60 saturate-50")} />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-gray-400">
            <ShoppingBag aria-hidden="true" className="h-8 w-8" />
          </span>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={href} className="font-sans text-[15px] font-semibold leading-snug text-blue-yankees hover:underline sm:text-base">
              {item.name}
            </Link>
            {options.length > 0 && <p className="mt-0.5 font-sans text-[13px] text-gray-500">{options.join(" · ")}</p>}
          </div>
          <button type="button" onClick={() => onRemove(item.id)} aria-label={`Quitar ${item.name} del carrito`} className={cn(ICON_BUTTON, "-mr-2 -mt-2")}>
            <X aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        </div>

        {(soldOut || overStock || lowStock || priceChange) && (
          <div className="flex flex-col gap-1" role="status">
            {soldOut && (
              <p className="inline-flex items-center gap-1.5 font-sans text-xs font-bold text-red-700">
                <PackageX aria-hidden="true" className="h-3.5 w-3.5" /> Agotado: quítalo o guárdalo para después
              </p>
            )}
            {overStock && (
              <p className="inline-flex items-center gap-1.5 font-sans text-xs font-bold text-amber-800">
                <Flame aria-hidden="true" className="h-3.5 w-3.5" /> Solo quedan {item.stock}: baja la cantidad para continuar
              </p>
            )}
            {lowStock && (
              <p className="inline-flex w-fit items-center gap-1 rounded-full bg-kawaii-peach px-2 py-0.5 font-sans text-xs font-bold text-orange-900">
                <Flame aria-hidden="true" className="h-3 w-3" /> Quedan {item.stock} · te llevas {quantity}
              </p>
            )}
            {priceChange && (
              <p className={cn("inline-flex items-center gap-1.5 font-sans text-xs font-bold", priceChange.to < priceChange.from ? "text-green-700" : "text-amber-800")}>
                {priceChange.to < priceChange.from ? <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" /> : <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />}
                El precio {priceChange.to < priceChange.from ? "bajó" : "cambió"} de {currencyFormatter.format(priceChange.from)} a {currencyFormatter.format(priceChange.to)} desde que lo agregaste
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!soldOut && <QuantitySelector max={item.stock} initialValue={quantity} onValueChange={onQuantity} label={`Cantidad de ${item.name}`} />}
            <button type="button" onClick={saveForLater} className="inline-flex min-h-11 items-center gap-1.5 font-sans text-[13px] font-semibold text-blue-yankees underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2">
              <Heart aria-hidden="true" className="h-3.5 w-3.5" />
              Guardar para después
            </button>
          </div>
          <div className="flex flex-col items-end font-quicksand">
            <span className="text-xl font-bold text-blue-yankees">{currencyFormatter.format(lineTotal)}</span>
            <span className="font-sans text-xs text-gray-500">
              {currencyFormatter.format(unit)} c/u
              {hasOffer && item.originalPrice ? (
                <>
                  {" "}
                  · <s>{currencyFormatter.format(item.originalPrice)}</s>{" "}
                  <span className="font-semibold text-green-700">Ahorras {currencyFormatter.format((Number(item.originalPrice) - unit) * quantity)}</span>
                </>
              ) : null}
            </span>
            {item.offerLabel && <span className="mt-1 inline-flex h-5 items-center rounded-full bg-pink-froly px-2 font-sans text-[11px] font-bold uppercase text-white">{item.offerLabel}</span>}
          </div>
        </div>
      </div>
    </li>
  );
};
