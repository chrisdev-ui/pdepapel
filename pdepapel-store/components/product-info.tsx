"use client";

import {
  Award,
  Heart,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { RefObject, useEffect, useMemo } from "react";

import { ProductDetailsAccordion } from "@/components/product-details-accordion";
import { ProductSignals } from "@/components/product-signals";
import { REVIEWS_SECTION_ID } from "@/components/reviews/reviews";
import { ShareButton } from "@/components/share-button";
import { Button } from "@/components/ui/button";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { useAddProductToCart } from "@/hooks/use-add-product-to-cart";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import {
  getAnalyticsValue,
  toAnalyticsItem,
  trackCustomerEvent,
} from "@/lib/customer-analytics";
import { getProductAvailability } from "@/lib/product-availability";
import { getAverageRating, getProductCardPrice } from "@/lib/product-card";
import { isCustomerFacingLegacySize } from "@/lib/product-options";
import { getStableProductVariants } from "@/lib/product-variants";
import { productPath } from "@/lib/routes";
import { cn, currencyFormatter } from "@/lib/utils";
import { Color, Design, Product, ProductVariant, Size } from "@/types";

interface ProductInfoProps {
  data: Product;
  siblings?: ProductVariant[];
  /** Vista rápida: sin acordeón ni compartir. */
  showDescription?: boolean;
  onAddedToCart?: () => void;
  showReviews?: boolean;
  onVariantChange?: (variant: Product | ProductVariant) => void;
  isLoading?: boolean;
  /** Cookie de acceso anticipado: deja comprar productos «Próximamente». */
  earlyAccess?: boolean;
  /** Cantidad controlada por la ficha para compartirla con la barra fija. */
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
  /** Fila del botón principal; la barra fija aparece cuando sale de pantalla. */
  ctaRef?: RefObject<HTMLDivElement>;
}

const CTA_CLASS =
  "order-last flex min-h-[52px] basis-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 font-sans text-base font-semibold sm:order-none sm:basis-auto sm:flex-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const OPTION_LABEL = "font-serif text-sm font-semibold text-blue-yankees";
const OPTION_CHIP =
  "min-h-11 rounded-full border-2 px-4 py-2 font-sans text-sm font-medium transition-colors";

export const ProductInfo: React.FC<ProductInfoProps> = ({
  data,
  siblings,
  showDescription = true,
  onAddedToCart,
  showReviews = true,
  onVariantChange,
  isLoading = false,
  earlyAccess = false,
  quantity: controlledQuantity,
  onQuantityChange,
  ctaRef,
}) => {
  const router = useRouter();
  const addProductToCart = useAddProductToCart("product_detail");
  const productInCart = useCart((state) =>
    state.items.find((item) => item.id === data.id),
  );
  const quantity = controlledQuantity ?? productInCart?.quantity ?? 1;

  const allVariants = useMemo(
    () => getStableProductVariants(data, siblings),
    [data, siblings],
  );
  const hasVariants = allVariants.length > 1;

  useEffect(() => {
    const item = toAnalyticsItem(data, 1);
    trackCustomerEvent("view_item", {
      currency: "COP",
      items: [item],
      value: getAnalyticsValue([item]),
    });
  }, [data]);

  const uniqueDesigns = useMemo(() => {
    const designs = new Map<string, Design>();
    allVariants.forEach((v) => v.design && designs.set(v.design.id, v.design));
    return Array.from(designs.values());
  }, [allVariants]);

  const availableColors = useMemo(() => {
    const colors = new Map<string, Color>();
    allVariants.forEach(
      (v) =>
        v.design?.id === data.design?.id &&
        v.color &&
        colors.set(v.color.id, v.color),
    );
    return Array.from(colors.values());
  }, [allVariants, data.design?.id]);

  const availableSizes = useMemo(() => {
    const sizes = new Map<string, Size>();
    allVariants.forEach((v) => {
      if (
        v.design?.id === data.design?.id &&
        v.color?.id === data.color?.id &&
        v.size &&
        isCustomerFacingLegacySize(v.size)
      )
        sizes.set(v.size.id, v.size);
    });
    return Array.from(sizes.values());
  }, [allVariants, data.design?.id, data.color?.id]);

  const handleVariantChange = (
    type: "design" | "color" | "size",
    id: string,
  ) => {
    if (isLoading) return;
    let target: Product | ProductVariant | undefined;
    if (type === "design") {
      target =
        allVariants.find(
          (v) =>
            v.design?.id === id &&
            v.color?.id === data.color?.id &&
            v.size?.id === data.size?.id,
        ) ||
        allVariants.find(
          (v) => v.design?.id === id && v.color?.id === data.color?.id,
        ) ||
        allVariants.find((v) => v.design?.id === id);
    } else if (type === "color") {
      target =
        allVariants.find(
          (v) =>
            v.design?.id === data.design?.id &&
            v.color?.id === id &&
            v.size?.id === data.size?.id,
        ) ||
        allVariants.find(
          (v) => v.design?.id === data.design?.id && v.color?.id === id,
        );
    } else {
      target = allVariants.find(
        (v) =>
          v.design?.id === data.design?.id &&
          v.color?.id === data.color?.id &&
          v.size?.id === id,
      );
    }
    if (!target) return;
    trackCustomerEvent("select_item_variant", {
      product_slug: target.slug || target.id,
      variant_type: type,
    });
    if (onVariantChange) return onVariantChange(target);
    router.push(productPath(target.slug || target.id));
  };

  const availability = getProductAvailability(data, { earlyAccess });
  const needsOption = Boolean(
    data.isGroup && hasVariants && !data.design && !data.color && !data.size,
  );
  const canBuy = availability.canBuy && !needsOption;
  const price = getProductCardPrice(data);
  const rating = getAverageRating(data.reviews);
  const eyebrow = [data.category?.name, data.design?.name]
    .filter(Boolean)
    .join(" · ");

  const handleAddToCart = () => {
    if (!canBuy) return;
    addProductToCart(data, quantity, onAddedToCart);
  };

  const focusNotifyForm = () => {
    const input = document.querySelector<HTMLInputElement>(
      `[data-product-signals="${data.id}"] input[type="email"]`,
    );
    input?.focus();
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const wishlist = useWishlist();
  const isWishlistProduct = wishlist.items.some((item) => item.id === data.id);
  const toggleWishlist = () =>
    isWishlistProduct ? wishlist.removeItem(data.id) : wishlist.addItem(data);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          {eyebrow ? (
            <p className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">
              {eyebrow}
            </p>
          ) : (
            <span />
          )}
          {showDescription && (
            <ShareButton
              title={data.name}
              path={productPath(data.slug || data.id)}
            />
          )}
        </div>
        <h1 className="font-serif text-3xl font-bold leading-tight text-blue-yankees sm:text-[34px]">
          {data.name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-sans text-sm text-blue-yankees">
          {rating ? (
            <>
              <span
                role="img"
                aria-label={`Calificación ${rating.average} de 5`}
                className="inline-flex gap-0.5"
              >
                {[1, 2, 3, 4, 5].map((step) => (
                  <Star
                    key={step}
                    aria-hidden="true"
                    className={cn(
                      "h-4 w-4",
                      step <= Math.round(rating.average)
                        ? "fill-yellow-star text-yellow-star"
                        : "text-gray-300",
                    )}
                  />
                ))}
              </span>
              <span className="font-quicksand font-bold">
                {rating.average.toLocaleString("es-CO", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
              {showReviews ? (
                <a
                  href={`#${REVIEWS_SECTION_ID}`}
                  className="underline underline-offset-4"
                >
                  {rating.count} {rating.count === 1 ? "reseña" : "reseñas"}
                </a>
              ) : (
                <span className="text-gray-500">
                  {rating.count} {rating.count === 1 ? "reseña" : "reseñas"}
                </span>
              )}
            </>
          ) : showReviews ? (
            <a
              href="#escribir-resena"
              className="text-gray-500 underline underline-offset-4"
            >
              Sé la primera en opinar
            </a>
          ) : null}
          {data.sku && (
            <>
              <span aria-hidden="true" className="text-gray-400">
                ·
              </span>
              <span className="text-gray-500">Ref. {data.sku}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-1 font-quicksand">
        {price.prefix && (
          <span className="pb-1 font-sans text-sm text-gray-500">
            {price.prefix}
          </span>
        )}
        <span className="text-[32px] font-bold leading-none tracking-tight text-blue-yankees">
          {price.current}
        </span>
        {price.original && (
          <s className="text-lg text-gray-500">{price.original}</s>
        )}
        {price.savings && (
          <span className="pb-0.5 text-sm font-bold text-green-700">
            {price.savings}
            {price.percent !== null && ` (${price.percent} %)`}
          </span>
        )}
        {data.offerLabel && (
          <span className="inline-flex h-6 items-center rounded-full bg-pink-froly px-2.5 font-sans text-xs font-bold text-white">
            {data.offerLabel}
          </span>
        )}
      </div>

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-5">
        {isLoading && data.isGroup ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="flex gap-2">
              <div className="h-11 w-20 animate-pulse rounded-full bg-gray-100" />
              <div className="h-11 w-20 animate-pulse rounded-full bg-gray-100" />
            </div>
          </div>
        ) : hasVariants ? (
          <>
            {uniqueDesigns.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <p className={OPTION_LABEL}>
                  <span>Diseño:</span>{" "}
                  <span className="font-sans font-medium">
                    {needsOption ? (
                      <span className="text-amber-700">elige uno</span>
                    ) : (
                      data.design?.name
                    )}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {uniqueDesigns.map((design) => {
                    const isActive = data.design?.id === design.id;
                    const isOutOfStock = !allVariants.some(
                      (v) => v.design?.id === design.id && v.stock > 0,
                    );
                    return (
                      <Button
                        type="button"
                        key={design.id}
                        variant={isActive ? "default" : "outline"}
                        disabled={isLoading}
                        aria-pressed={isActive}
                        onClick={() => handleVariantChange("design", design.id)}
                        className={cn(
                          OPTION_CHIP,
                          isActive
                            ? "border-blue-yankees bg-blue-yankees text-white hover:bg-blue-yankees"
                            : "border-gray-200 bg-white text-gray-900 hover:border-gray-300",
                          isOutOfStock && "line-through opacity-50",
                        )}
                      >
                        {design.name}
                        {isOutOfStock && (
                          <span className="sr-only"> (agotado)</span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            {availableColors.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <p className={OPTION_LABEL}>
                  <span>Color:</span>{" "}
                  <span className="font-sans font-medium">
                    {data.color?.name}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {availableColors.map((color) => {
                    const isActive = data.color?.id === color.id;
                    const isOutOfStock = !allVariants.some(
                      (v) =>
                        v.design?.id === data.design?.id &&
                        v.color?.id === color.id &&
                        v.stock > 0,
                    );
                    return (
                      <button
                        type="button"
                        key={color.id}
                        aria-label={`Seleccionar color ${color.name}${isOutOfStock ? " (agotado)" : ""}`}
                        aria-pressed={isActive}
                        disabled={isLoading}
                        onClick={() => handleVariantChange("color", color.id)}
                        className={cn(
                          "relative h-11 w-11 touch-manipulation rounded-full border-2 transition-[transform,border-color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 disabled:cursor-not-allowed motion-reduce:transform-none",
                          isActive
                            ? "border-blue-yankees ring-2 ring-blue-yankees ring-offset-2"
                            : "border-gray-200 hover:scale-110",
                          (isOutOfStock || isLoading) && "opacity-50",
                        )}
                        style={{ backgroundColor: color.value }}
                        title={`${color.name}${isOutOfStock ? " (agotado)" : ""}`}
                      >
                        {isOutOfStock && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 flex items-center justify-center"
                          >
                            <span className="h-0.5 w-full rotate-45 bg-red-500" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {availableSizes.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <p className={OPTION_LABEL}>
                  <span>Tamaño:</span>{" "}
                  <span className="font-sans font-medium">
                    {data.size?.name}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map((size) => {
                    const isActive = data.size?.id === size.id;
                    const isOutOfStock = !allVariants.some(
                      (v) =>
                        v.design?.id === data.design?.id &&
                        v.color?.id === data.color?.id &&
                        v.size?.id === size.id &&
                        v.stock > 0,
                    );
                    return (
                      <Button
                        type="button"
                        key={size.id}
                        variant={isActive ? "default" : "outline"}
                        disabled={isLoading}
                        aria-pressed={isActive}
                        onClick={() => handleVariantChange("size", size.id)}
                        className={cn(
                          "min-h-11 min-w-[3rem] rounded-lg border-2 px-3 py-1 font-sans text-sm font-medium transition-colors",
                          isActive
                            ? "border-blue-yankees bg-blue-yankees text-white hover:bg-blue-yankees"
                            : "border-gray-200 bg-white text-gray-900 hover:border-gray-300",
                          isOutOfStock && "line-through opacity-50",
                        )}
                      >
                        {size.name}
                        {isOutOfStock && (
                          <span className="sr-only"> (agotado)</span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {data.size && isCustomerFacingLegacySize(data.size) && (
              <p className={OPTION_LABEL}>
                <span>Tamaño:</span>{" "}
                <span className="font-sans font-medium">{data.size.name}</span>
              </p>
            )}
            {data.color && (
              <p className={cn(OPTION_LABEL, "inline-flex items-center gap-2")}>
                <span>Color:</span>
                <span
                  aria-hidden="true"
                  className="h-5 w-5 rounded-full border border-gray-400"
                  style={{ backgroundColor: data.color.value }}
                />
                <span className="font-sans font-medium">{data.color.name}</span>
              </p>
            )}
            {data.design && (
              <p className={OPTION_LABEL}>
                <span>Diseño:</span>{" "}
                <span className="font-sans font-medium">
                  {data.design.name}
                </span>
              </p>
            )}
          </div>
        )}
        {data.catalogOptionValues?.map(({ option, optionValue }) => (
          <p key={option.id} className={OPTION_LABEL}>
            <span>{option.name}:</span>{" "}
            <span className="font-sans font-medium">{optionValue.name}</span>
          </p>
        ))}
        {isLoading && hasVariants && (
          <p className="font-sans text-sm text-muted-foreground" role="status">
            Actualizando opción seleccionada…
          </p>
        )}
      </div>

      <div ref={ctaRef} className="flex flex-wrap items-center gap-3">
        {canBuy && (
          <QuantitySelector
            key={data.id}
            max={data.stock}
            initialValue={quantity}
            size="medium"
            onValueChange={(value) => onQuantityChange?.(value)}
          />
        )}
        {canBuy ? (
          <Button
            disabled={isLoading}
            onClick={handleAddToCart}
            className={cn(
              CTA_CLASS,
              "bg-blue-yankees text-white hover:bg-blue-yankees/90",
            )}
          >
            <ShoppingCart aria-hidden="true" className="h-5 w-5" />
            {isLoading ? (
              "Actualizando opción…"
            ) : (
              <span>
                {availability.ctaLabel}
                <span className="sm:hidden xl:inline">
                  {" "}
                  · {currencyFormatter.format(Number(data.price) * quantity)}
                </span>
              </span>
            )}
          </Button>
        ) : needsOption ? (
          <Button
            disabled
            className={cn(CTA_CLASS, "bg-gray-200 text-gray-600")}
          >
            Elige una opción para continuar
          </Button>
        ) : availability.status === "archived" ? (
          <Button
            disabled
            className={cn(CTA_CLASS, "bg-gray-200 text-gray-600")}
          >
            {availability.ctaLabel}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={focusNotifyForm}
            className={cn(
              CTA_CLASS,
              "border-2 border-blue-yankees bg-white text-blue-yankees hover:bg-blue-yankees hover:text-white",
            )}
          >
            {availability.ctaLabel}
          </Button>
        )}
        <Button
          variant="outline"
          aria-pressed={isWishlistProduct}
          aria-label={
            isWishlistProduct ? "Quitar de favoritos" : "Agregar a favoritos"
          }
          onClick={toggleWishlist}
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 border-blue-yankees bg-white p-0 text-blue-yankees hover:bg-blue-yankees hover:text-white"
        >
          <Heart
            aria-hidden="true"
            className={cn(
              "h-5 w-5",
              isWishlistProduct && "fill-current text-rose-600",
            )}
          />
        </Button>
      </div>

      <div id="avisame" data-product-signals={data.id} className="scroll-mt-40">
        <ProductSignals
          product={data}
          availability={availability}
          quantity={quantity}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-purple-100 bg-purple-50/50 p-3 text-center font-sans text-xs font-semibold text-purple-950">
        <span className="flex flex-col items-center gap-1">
          <ShieldCheck
            aria-hidden="true"
            className="h-4 w-4 text-emerald-600"
          />
          Compra segura
        </span>
        <span className="flex flex-col items-center gap-1">
          <Truck aria-hidden="true" className="h-4 w-4 text-purple-600" />
          Envíos a toda Colombia
        </span>
        <span className="flex flex-col items-center gap-1">
          <Award aria-hidden="true" className="h-4 w-4 text-amber-500" />
          Calidad P de Papel
        </span>
      </div>

      {showDescription && <ProductDetailsAccordion product={data} />}
    </div>
  );
};
