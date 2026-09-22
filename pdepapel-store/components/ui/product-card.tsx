"use client";

import {
  AlertCircle,
  Expand,
  Heart,
  ImageOff,
  Loader2,
  Plus,
  ShoppingCart,
  Star,
} from "lucide-react";
import Link from "next/link";
import { MouseEventHandler, memo, useCallback, useEffect, useState } from "react";

import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { useCart } from "@/hooks/use-cart";
import { usePreviewModal } from "@/hooks/use-preview-modal";
import { useToast } from "@/hooks/use-toast";
import { useWishlist } from "@/hooks/use-wishlist";
import {
  getAnalyticsValue,
  toAnalyticsItem,
  trackCustomerEvent,
} from "@/lib/customer-analytics";
import {
  CardBadge,
  getAverageRating,
  getProductCardBadges,
  getProductCardPrice,
  isComingSoon,
  isLowStock,
  isRecentlyCreated,
} from "@/lib/product-card";
import { getActivePresale, getPurchasableUnits } from "@/lib/purchasable-units";
import { productPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useCartPreview } from "@/providers/cart-preview-provider";
import { Product } from "@/types";

interface ProductCardProps {
  product: Product;
  isNew?: boolean;
  priority?: boolean;
  /** Ancho de imagen que pide el navegador; cambia según la cuadrícula. */
  sizes?: string;
  className?: string;
}

const BADGE_TONES: Record<CardBadge["tone"], string> = {
  soldOut: "bg-red-600 text-white",
  comingSoon: "bg-kawaii-lavender-light text-blue-yankees",
  offer: "bg-yellow-star text-blue-yankees",
  options: "bg-kawaii-lavender-light text-blue-yankees",
  new: "bg-pink-shell text-blue-yankees",
};

const ICON_BUTTON =
  "flex h-10 w-10 items-center justify-center rounded-full bg-white text-blue-yankees shadow-md transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 motion-reduce:transform-none disabled:cursor-not-allowed disabled:opacity-50";

function Badge({ badge }: { badge: CardBadge }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 font-sans text-xs font-bold",
        BADGE_TONES[badge.tone],
      )}
    >
      {badge.text}
    </span>
  );
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isNew,
  priority = false,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  className,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const openPreview = usePreviewModal((state) => state.onOpen);
  const addToCart = useCart((state) => state.addItem);
  const { showCartPreview } = useCartPreview();
  const { toast } = useToast();
  const addToWishlist = useWishlist((state) => state.addItem);
  const removeFromWishlist = useWishlist((state) => state.removeItem);
  const isWishlistProduct = useWishlist(
    (state) => isMounted && state.items.some((item) => item.id === product.id),
  );
  const isCartProduct = useCart(
    (state) => isMounted && state.items.some((item) => item.id === product.id),
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const images = product.images ?? [];
  const mainImage = images.find((image) => image.isMain) ?? images[0];
  const hoverImage = images.find((image) => image !== mainImage);
  const comingSoon = isComingSoon(product);
  // Una preventa se compra hoy aunque no haya bodega: lo que la agota es el
  // cupo de la campaña.
  const presale = getActivePresale(product);
  const soldOut = getPurchasableUnits(product) === 0;
  const badges = getProductCardBadges(product, {
    isNew: isNew ?? isRecentlyCreated(product),
  });
  const price = getProductCardPrice(product);
  const rating = getAverageRating(product.reviews);
  const lowStock = isLowStock(product);
  const canBuy =
    !soldOut && (Boolean(presale) || !comingSoon) && !product.isArchived;
  const href = productPath(product.slug || product.id);

  const stop = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  /**
   * «Ya te oí»: la tarjeta se apaga un poco y saca una rueda mientras llega
   * la ficha.
   *
   * Entre tocar la foto y ver el producto pasaban ~839 ms medidos en
   * escritorio, y bastantes más en un teléfono, con la pantalla idéntica. Sin
   * ninguna señal, la reacción normal es volver a tocar: son los clics
   * muertos que Clarity marcaba sobre la foto.
   *
   * No se toca el enlace. Nada de `preventDefault` ni de navegar a mano: el
   * `<Link>` sigue haciendo exactamente lo de antes, así que abrir en otra
   * pestaña —clic central, Cmd/Ctrl— se conserva. Por eso mismo, un clic con
   * modificador no enciende nada: esa pestaña se abre aparte y esta se queda
   * como está.
   */
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (!opening) return;
    // Si la navegación se cae o la cancelan, la tarjeta no se queda apagada.
    const timer = window.setTimeout(() => setOpening(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [opening]);

  const opensInThisTab = (event: React.MouseEvent) =>
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey;

  const onPreview = useCallback<MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      stop(event);
      openPreview(product);
    },
    [openPreview, product],
  );

  const onAddToCart = useCallback<MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      stop(event);
      if (product.isGroup) {
        openPreview(product);
        return;
      }
      const result = addToCart(product);
      if (!result.ok) {
        toast({
          description:
            result.status === "stock_limit"
              ? "No hay más stock disponible de este producto."
              : "Este producto no está disponible en este momento.",
          variant: "warning",
        });
        return;
      }
      const item = toAnalyticsItem(product, 1);
      trackCustomerEvent("add_to_cart", {
        currency: "COP",
        items: [item],
        source: "product_card",
        value: getAnalyticsValue([item]),
      });
      showCartPreview({
        product: result.item,
        quantity: result.item.quantity ?? 1,
        source: "product_card",
      });
    },
    [addToCart, openPreview, product, showCartPreview, toast],
  );

  const onToggleWishlist = useCallback<MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      stop(event);
      if (product.isGroup) {
        openPreview(product);
        return;
      }
      if (isWishlistProduct) removeFromWishlist(product.id);
      else addToWishlist(product);
    },
    [
      addToWishlist,
      isWishlistProduct,
      openPreview,
      product,
      removeFromWishlist,
    ],
  );

  const heartLabel = isWishlistProduct
    ? "Quitar de favoritos"
    : "Agregar a favoritos";
  const heart = (
    <Heart
      aria-hidden="true"
      className={cn("h-[18px] w-[18px]", isWishlistProduct && "text-rose-700")}
      fill={isWishlistProduct ? "currentColor" : "none"}
    />
  );

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-2.5 rounded-xl border border-blue-baby bg-white p-2 shadow-card transition-shadow hover:shadow-card-hover sm:p-3",
        className,
      )}
    >
      <Link
        href={href}
        aria-label={`Ver ${product.name}`}
        className="relative block aspect-square overflow-hidden rounded-xl bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
        onClick={(event) => {
          if (opensInThisTab(event)) setOpening(true);
          trackCustomerEvent("select_item", {
            item_list_id: "catalog",
            item_list_name: "Catálogo",
            items: [toAnalyticsItem(product, 1)],
          });
        }}
      >
        {mainImage?.url ? (
          <CloudinaryImage
            src={mainImage.url}
            alt={product.name ?? "Imagen principal del producto"}
            fill
            sizes={sizes}
            priority={priority}
            className={cn(
              "object-cover transition-opacity duration-300",
              (soldOut || comingSoon) && "opacity-60 saturate-50",
              hoverImage && "can-hover:group-hover:opacity-0",
            )}
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center text-gray-400"
          >
            <ImageOff className="h-8 w-8" />
          </div>
        )}
        {hoverImage?.url && (
          <CloudinaryImage
            src={hoverImage.url}
            alt=""
            fill
            sizes={sizes}
            className="hidden object-cover opacity-0 transition-opacity duration-300 can-hover:block can-hover:group-hover:opacity-100"
          />
        )}
        {opening && (
          <span
            aria-hidden="true"
            data-opening="true"
            className="absolute inset-0 flex items-center justify-center bg-white/55 backdrop-blur-[1px]"
          >
            <Loader2 className="h-6 w-6 animate-spin text-blue-yankees" />
          </span>
        )}
      </Link>

      {(badges.commercial || badges.catalog) && (
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col items-start gap-1.5 sm:left-5 sm:top-5">
          {badges.commercial && <Badge badge={badges.commercial} />}
          {badges.catalog && <Badge badge={badges.catalog} />}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-2 top-2 hidden aspect-square can-hover:block sm:inset-x-3 sm:top-3">
        <div className="pointer-events-auto absolute inset-x-0 bottom-3 flex justify-center gap-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label={heartLabel}
            aria-pressed={isWishlistProduct}
            onClick={onToggleWishlist}
            className={ICON_BUTTON}
          >
            {heart}
          </button>
          <button
            type="button"
            aria-label="Vista rápida"
            onClick={onPreview}
            className={ICON_BUTTON}
          >
            <Expand aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label={
              presale
                ? "Reservar ahora"
                : product.isGroup
                  ? "Elegir opción"
                  : "Agregar al carrito"
            }
            onClick={onAddToCart}
            disabled={!canBuy}
            className={cn(
              ICON_BUTTON,
              "bg-blue-yankees text-white",
              isCartProduct && "ring-2 ring-pink-froly",
            )}
          >
            <ShoppingCart aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Link
          href={href}
          className="line-clamp-2 min-h-[2.7em] font-sans text-[15px] font-semibold leading-[1.35] text-blue-yankees sm:text-[17px]"
          title={product.name}
        >
          {product.name}
        </Link>
        <p className="h-[18px] truncate text-xs leading-[18px] text-gray-500 sm:text-[13px]">
          {product.category?.name}
          {badges.newInline && (
            <span className="font-semibold text-rose-700"> · Nuevo</span>
          )}
        </p>
        <div className="flex h-[22px] items-center justify-between gap-2">
          {rating ? (
            <span
              role="img"
              className="inline-flex items-center gap-1 text-xs text-gray-500"
              aria-label={`Calificación ${rating.average} de 5 con ${rating.count} reseñas`}
            >
              <span
                className="hidden items-center sm:inline-flex"
                aria-hidden="true"
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    className={cn(
                      "h-3.5 w-3.5",
                      index < Math.round(rating.average)
                        ? "fill-yellow-star text-yellow-star"
                        : "text-gray-300",
                    )}
                  />
                ))}
              </span>
              <span
                className="inline-flex items-center gap-1 sm:hidden"
                aria-hidden="true"
              >
                <Star className="h-3.5 w-3.5 fill-yellow-star text-yellow-star" />
                <strong className="text-blue-yankees">
                  {rating.average.toLocaleString("es-CO", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </strong>
              </span>
              <span>({rating.count})</span>
            </span>
          ) : (
            <span />
          )}
          {lowStock && (
            <span className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full bg-kawaii-peach px-2 text-xs font-bold text-orange-900">
              <AlertCircle aria-hidden="true" className="h-3 w-3" />
              ¡Quedan {product.stock}!
            </span>
          )}
        </div>
        <div className="flex h-12 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5 font-quicksand">
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-[17px] font-bold tracking-tight text-blue-yankees sm:text-[22px]">
                {price.prefix && (
                  <span className="mr-1 text-xs font-medium text-gray-500 sm:text-[13px]">
                    {price.prefix}
                  </span>
                )}
                {price.current}
              </span>
              {price.original && (
                <s className="hidden text-[13px] text-gray-500 sm:inline">
                  {price.original}
                </s>
              )}
            </span>
            <span className="h-4 text-xs leading-4">
              {price.original ? (
                <>
                  <span className="text-gray-500 sm:hidden">
                    <s>{price.original}</s>
                    {price.percent !== null && (
                      <span className="ml-1.5 font-semibold text-green-700">
                        −{price.percent} %
                      </span>
                    )}
                  </span>
                  <span className="hidden font-semibold text-green-700 sm:inline">
                    {price.savings}
                    {price.percent !== null && ` (${price.percent} %)`}
                  </span>
                </>
              ) : null}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/*
             * En táctil, favoritos vive aquí y no sobre la foto.
             *
             * Estaba en la esquina superior derecha de la imagen: 36 px sobre
             * una foto de 156 px en el teléfono, un 5% de su superficie y
             * justo donde cae el pulgar. Comprobado con un iPhone 13 de
             * verdad —tres productos, tres de tres—: tocar esa esquina no
             * abría el producto, guardaba en favoritos sin que nadie lo
             * pidiera. Doble daño: el toque parecía muerto y encima hacía
             * algo a escondidas.
             *
             * Aquí abajo acompaña al de agregar, que es donde el pulgar ya
             * busca las acciones de la tarjeta, y la foto entera —esquinas
             * incluidas— vuelve a ser un solo destino: abrir el producto.
             *
             * `can-hover:hidden` se conserva: en escritorio manda la capa que
             * aparece al pasar el puntero, y eso no se toca.
             */}
            <button
              type="button"
              aria-label={heartLabel}
              aria-pressed={isWishlistProduct}
              onClick={onToggleWishlist}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-blue-baby bg-white text-blue-yankees transition-colors hover:bg-blue-baby/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 can-hover:hidden sm:h-10 sm:w-10",
                isWishlistProduct && "border-rose-200 bg-rose-50",
              )}
            >
              {heart}
            </button>
            <button
              type="button"
              aria-label={
                presale
                  ? soldOut
                    ? "Reservas agotadas"
                    : "Reservar ahora"
                  : comingSoon
                    ? "Llega pronto"
                    : soldOut
                      ? "Agotado"
                      : product.isGroup
                        ? "Elegir opción"
                        : "Agregar al carrito"
              }
              onClick={onAddToCart}
              disabled={!canBuy}
              className={cn(
                "disabled:opacity-35 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-yankees text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 disabled:cursor-not-allowed sm:h-10 sm:w-10",
                isCartProduct && "ring-2 ring-pink-froly ring-offset-1",
              )}
            >
              <Plus aria-hidden="true" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

/**
 * En `memo` porque la cuadrícula del catálogo ya no se queda en 24 tarjetas:
 * encadenando «Cargar más» puede acumular cientos, y cualquier cambio de
 * estado del contenedor —la rueda del botón, por ejemplo— las repintaba
 * todas. Las props son estables (el producto viene de la caché de la consulta
 * y `sizes` es una constante), así que la comparación por defecto basta.
 */
export default memo(ProductCard);
