"use client";

import { Bell, Heart, ShoppingCart } from "lucide-react";
import { RefObject, useEffect, useState } from "react";

import { useAddProductToCart } from "@/hooks/use-add-product-to-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { ProductAvailability } from "@/lib/product-availability";
import { cn, currencyFormatter } from "@/lib/utils";
import { Product } from "@/types";

interface ProductStickyBarProps {
  product: Product;
  availability: ProductAvailability;
  quantity: number;
  /** Fila del botón principal: la barra aparece cuando queda por encima de la pantalla. */
  targetRef: RefObject<HTMLElement>;
  onNotify: () => void;
}

/** Sigue el botón principal cuando la clienta baja: escritorio como píldora ancha, móvil como barra inferior. */
export function ProductStickyBar({ product, availability, quantity, targetRef, onNotify }: ProductStickyBarProps) {
  const [visible, setVisible] = useState(false);
  const addProductToCart = useAddProductToCart("product_sticky_bar");
  const wishlist = useWishlist();
  const isWishlistProduct = wishlist.items.some((item) => item.id === product.id);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef]);

  const image = product.images?.find((item) => item.isMain) ?? product.images?.[0];
  const options = [product.design?.name, product.color?.name].filter(Boolean).join(" · ");
  const canBuy = availability.canBuy;
  const total = currencyFormatter.format(Number(product.price) * quantity);
  const action = canBuy ? (
    <button
      type="button"
      onClick={() => addProductToCart(product, quantity)}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-blue-yankees px-5 font-sans text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
    >
      <ShoppingCart aria-hidden="true" className="h-4 w-4" />
      <span className="lg:hidden">Agregar</span>
      <span className="hidden lg:inline">Agregar al carrito</span>
    </button>
  ) : availability.status === "archived" ? null : (
    <button
      type="button"
      onClick={onNotify}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border-2 border-blue-yankees bg-white px-4 font-sans text-sm font-semibold text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
    >
      <Bell aria-hidden="true" className="h-4 w-4" />
      Avísame
    </button>
  );

  return (
    <div
      data-testid="product-sticky-bar"
      aria-hidden={!visible}
      className={cn(
        "fixed z-40 transition-all duration-200 motion-reduce:transition-none",
        "bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-[5.25rem]",
        "lg:bottom-4 lg:left-1/2 lg:right-auto lg:w-[min(1120px,calc(100vw-2rem))] lg:-translate-x-1/2",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0 lg:translate-y-4",
      )}
    >
      <div className="flex h-14 items-center gap-3 rounded-full border border-blue-baby bg-white pl-4 pr-1.5 shadow-[0_8px_24px_rgba(34,27,65,0.22)] lg:h-[68px] lg:pl-2.5 lg:pr-2.5">
        {image && (
          <span className="relative hidden h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-100 lg:block">
            <CloudinaryImage src={image.url} alt="" width={48} height={48} className="h-full w-full object-cover" />
          </span>
        )}
        <span className="hidden min-w-0 flex-col lg:flex">
          <span className="truncate font-sans text-sm font-semibold text-blue-yankees">
            {product.name}
            {options && <span className="font-medium text-gray-500"> · {options}</span>}
          </span>
          <span className="truncate font-sans text-xs text-gray-500">{availability.stockLabel}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight lg:ml-auto lg:flex-none lg:items-end">
          <span className="font-quicksand text-[17px] font-bold text-blue-yankees lg:text-[22px]">{canBuy ? total : currencyFormatter.format(Number(product.price))}</span>
          <span className="truncate font-sans text-[11px] text-gray-500 lg:hidden">{options ? `${options} · ` : ""}{availability.stockLabel}</span>
        </span>
        <button
          type="button"
          aria-pressed={isWishlistProduct}
          aria-label={isWishlistProduct ? "Quitar de favoritos" : "Agregar a favoritos"}
          tabIndex={visible ? 0 : -1}
          onClick={() => (isWishlistProduct ? wishlist.removeItem(product.id) : wishlist.addItem(product))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-blue-yankees bg-white text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
        >
          <Heart aria-hidden="true" className={cn("h-4 w-4", isWishlistProduct && "fill-current text-rose-600")} />
        </button>
        {action}
      </div>
    </div>
  );
}
