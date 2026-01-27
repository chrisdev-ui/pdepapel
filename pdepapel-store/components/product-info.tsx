"use client";

import { KitContents } from "./kit-contents";

import { Heart, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { Separator } from "@/components/ui/separator";
import { StarRating } from "@/components/ui/star-rating";
import { ToastIcon } from "@/components/ui/toast-icon";
import { useCart } from "@/hooks/use-cart";
import { toast } from "@/hooks/use-toast";
import { useWishlist } from "@/hooks/use-wishlist";
import { calculateAverageRating, cn } from "@/lib/utils";
import { Color, Design, Product, ProductVariant, Size } from "@/types";
import { useRouter } from "next/navigation";
import { RefObject, useMemo, useState } from "react";
import { RichTextDisplay } from "./ui/rich-text-display";

interface ProductInfoProps {
  data: Product;
  siblings?: ProductVariant[];
  showDescription?: boolean;
  onAddedToCart?: () => void;
  showReviews?: boolean;
  reviewsRef?: RefObject<HTMLDivElement>;
  onVariantChange?: (variant: Product | ProductVariant) => void;
  isLoading?: boolean;
}

export const ProductInfo: React.FC<ProductInfoProps> = ({
  data,
  siblings,
  showDescription = true,
  onAddedToCart,
  showReviews = true,
  reviewsRef,
  onVariantChange,
  isLoading = false,
}) => {
  const [quantity, setQuantity] = useState<number>();
  const cart = useCart();
  const router = useRouter();

  const goToReviews = () => {
    reviewsRef?.current?.scrollIntoView({
      behavior: "smooth",
    });
  };

  // --- Variant Logic ---
  const allVariants = useMemo(
    () => [data, ...(siblings ?? [])],
    [data, siblings],
  );
  const hasVariants = allVariants.length > 1;

  // 1. Unique Designs
  const uniqueDesigns = useMemo(() => {
    const designs = new Map<string, Design>();
    allVariants.forEach((v) => {
      if (v.design) designs.set(v.design.id, v.design);
    });
    return Array.from(designs.values());
  }, [allVariants]);

  // 2. Available Colors (dependent on current Design)
  const availableColors = useMemo(() => {
    const colors = new Map<string, Color>();

    allVariants.forEach((v) => {
      if (v.design?.id === data.design?.id && v.color) {
        colors.set(v.color.id, v.color);
      }
    });
    return Array.from(colors.values());
  }, [allVariants, data.design?.id]);

  // 3. Available Sizes (dependent on current Design + Color)
  const availableSizes = useMemo(() => {
    const sizes = new Map<string, Size>();
    allVariants.forEach((v) => {
      if (
        v.design?.id === data.design?.id &&
        v.color?.id === data.color?.id &&
        v.size
      ) {
        sizes.set(v.size.id, v.size);
      }
    });
    return Array.from(sizes.values());
  }, [allVariants, data.design?.id, data.color?.id]);

  const handleVariantChange = (
    type: "design" | "color" | "size",
    id: string,
  ) => {
    let targetVariant: Product | ProductVariant | undefined;

    if (type === "design") {
      // Find variant with new Design, trying to keep same Color & Size
      targetVariant =
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
      // Find variant with new Color (keeping same Design), same Size if possible
      targetVariant =
        allVariants.find(
          (v) =>
            v.design?.id === data.design?.id &&
            v.color?.id === id &&
            v.size?.id === data.size?.id,
        ) ||
        allVariants.find(
          (v) => v.design?.id === data.design?.id && v.color?.id === id,
        );
    } else if (type === "size") {
      // Find variant with new Size (keeping same Design & Color)
      targetVariant = allVariants.find(
        (v) =>
          v.design?.id === data.design?.id &&
          v.color?.id === data.color?.id &&
          v.size?.id === id,
      );
    }

    if (targetVariant) {
      if (onVariantChange) {
        onVariantChange(targetVariant);
        return;
      }
      router.push(`/product/${targetVariant.id}`);
    }
  };

  const productInCart = cart.items.find((item) => item.id === data.id);

  const handleAddToCart = () => {
    if (productInCart) {
      cart.updateQuantity(data.id, quantity ?? 1);
      toast({
        description: "Carrito actualizado.",
        variant: "success",
        icon: <ToastIcon icon="cart" variant="success" />,
      });
    } else {
      cart.addItem(data, quantity);
    }
    // router.push("/cart"); // Removed navigation
    onAddedToCart?.();
  };

  const wishlist = useWishlist();
  const isWishlistProduct = wishlist.items.some((item) => item.id === data.id);

  const handleAddToWishlist = () => {
    wishlist.addItem(data);
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{data?.name}</h1>
      <div className="mt-3 flex items-end justify-between">
        <div className="flex flex-col gap-1 text-2xl">
          {data.hasDiscount ||
          (data.originalPrice && data.originalPrice > Number(data.price)) ? (
            <>
              <div className="flex items-center gap-3">
                <Currency value={data.price} />
                <Currency
                  value={data.originalPrice}
                  className="text-lg text-gray-500 line-through"
                />
              </div>
              <span className="text-sm text-success">
                Ahorra{" "}
                {new Intl.NumberFormat("es-CO", {
                  style: "currency",
                  currency: "COP",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(Number(data.originalPrice) - Number(data.price))}{" "}
                (
                {Math.round(
                  ((Number(data.originalPrice) - Number(data.price)) /
                    Number(data.originalPrice)) *
                    100,
                )}
                %)
              </span>
              {data.offerLabel && (
                <span className="mt-2 inline-block animate-bounce rounded bg-pink-froly px-2 py-1 text-xs font-semibold text-white">
                  {data.offerLabel}
                </span>
              )}
            </>
          ) : (
            <Currency value={data?.price} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {showReviews && (
            <button onClick={goToReviews} className="text-sm underline">
              {data.reviews?.length ?? 0} Opiniones
            </button>
          )}
          <StarRating
            currentRating={calculateAverageRating(data?.reviews)}
            isDisabled
          />
        </div>
      </div>
      <Separator className="my-4" />
      <div className="flex flex-col gap-y-6">
        {isLoading && data.isGroup ? (
          <div className="flex flex-col gap-y-3">
            <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
            <div className="flex gap-2">
              <div className="h-8 w-16 animate-pulse rounded border bg-gray-100" />
              <div className="h-8 w-16 animate-pulse rounded border bg-gray-100" />
              <div className="h-8 w-16 animate-pulse rounded border bg-gray-100" />
            </div>
          </div>
        ) : hasVariants ? (
          <>
            {/* Design Selector */}
            {uniqueDesigns.length > 0 && (
              <div className="flex flex-col gap-y-3">
                <h3 className="font-serif font-semibold">Diseño:</h3>
                <div className="flex flex-wrap gap-2">
                  {uniqueDesigns.map((design: Design) => {
                    const isActive = data.design?.id === design.id;
                    const isOutOfStock = !allVariants.some(
                      (v) => v.design?.id === design.id && v.stock > 0,
                    );

                    return (
                      <Button
                        key={design.id}
                        variant={isActive ? "default" : "outline"}
                        onClick={() => handleVariantChange("design", design.id)}
                        className={cn(
                          "rounded-full border-2 px-4 py-2 text-sm font-medium transition-all",
                          isActive
                            ? "border-blue-yankees bg-blue-yankees text-white"
                            : "border-gray-200 text-gray-900 hover:border-gray-300",
                          isOutOfStock && "line-through opacity-50",
                        )}
                      >
                        {design.name}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Color Selector */}
            {availableColors.length > 0 && (
              <div className="flex flex-col gap-y-3">
                <h3 className="font-serif font-semibold">Color:</h3>
                <div className="flex flex-wrap gap-2">
                  {availableColors.map((color: Color) => {
                    const isActive = data.color?.id === color.id;
                    const isOutOfStock = !allVariants.some(
                      (v) =>
                        v.design?.id === data.design?.id &&
                        v.color?.id === color.id &&
                        v.stock > 0,
                    );

                    return (
                      <div
                        key={color.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Seleccionar color ${color.name}${
                          isOutOfStock ? " (Agotado)" : ""
                        }`}
                        onClick={() => handleVariantChange("color", color.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleVariantChange("color", color.id);
                          }
                        }}
                        className={cn(
                          "relative h-8 w-8 cursor-pointer rounded-full border-2 transition-all focus:outline-none focus:ring-2 focus:ring-blue-yankees focus:ring-offset-2",
                          isActive
                            ? "border-blue-yankees ring-2 ring-blue-yankees ring-offset-2"
                            : "border-gray-200 hover:scale-110",
                          isOutOfStock && "cursor-not-allowed opacity-50",
                        )}
                        style={{ backgroundColor: color.value }}
                        title={`${color.name}${
                          isOutOfStock ? " (Agotado)" : ""
                        }`}
                      >
                        {isOutOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-0.5 w-full rotate-45 bg-red-500" />
                            <div className="h-0.5 w-full -rotate-45 bg-red-500" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Size Selector */}
            {availableSizes.length > 0 && (
              <div className="flex flex-col gap-y-3">
                <h3 className="font-serif font-semibold">Tamaño:</h3>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map((size: Size) => {
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
                        key={size.id}
                        variant={isActive ? "default" : "outline"}
                        onClick={() => handleVariantChange("size", size.id)}
                        className={cn(
                          "min-w-[3rem] rounded-md border-2 px-3 py-1 text-sm font-medium transition-all",
                          isActive
                            ? "border-blue-yankees bg-blue-yankees text-white"
                            : "border-gray-200 text-gray-900 hover:border-gray-300",
                          isOutOfStock && "line-through opacity-50",
                        )}
                      >
                        {size.name}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {data?.size && (
              <div className="flex items-center gap-x-4">
                <h3 className="font-serif font-semibold">Tamaño:</h3>
                <div>{data.size.name}</div>
              </div>
            )}
            {data?.color && (
              <div className="flex items-center gap-x-4">
                <h3 className="font-serif font-semibold">Color:</h3>
                <div
                  className="h-6 w-6 rounded-full border border-gray-600"
                  style={{
                    backgroundColor: data.color.value,
                  }}
                />
              </div>
            )}
            {data?.design && (
              <div className="flex items-center gap-x-4">
                <h3 className="font-serif font-semibold">Diseño:</h3>
                <div>{data.design.name}</div>
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-x-4">
          <h3 className="font-serif font-semibold">Cantidad:</h3>
          <div>
            <QuantitySelector
              max={data.stock}
              initialValue={productInCart?.quantity || 1}
              size="medium"
              onValueChange={(value) => {
                setQuantity(value);
              }}
            />
          </div>
        </div>
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-4 sm:gap-y-0">
        <Button
          disabled={data.stock === 0 || (isLoading && !!data.isGroup)}
          className="flex gap-2 rounded-full border-none bg-blue-yankees px-8 py-4 font-serif text-sm font-semibold text-white outline-none [transition:0.2s]"
          onClick={handleAddToCart}
        >
          {isLoading && data.isGroup
            ? "Cargando opciones..."
            : "Agregar al carrito"}
          {!isLoading && <ShoppingCart className="h-5 w-5" />}
        </Button>
        <Button
          variant="outline"
          onClick={handleAddToWishlist}
          className="flex gap-2 rounded-full border-2 border-blue-yankees px-6 py-4 font-serif text-sm font-semibold text-blue-yankees hover:bg-blue-yankees hover:text-white"
        >
          <Heart
            className={cn("h-5 w-5", {
              "fill-current text-red-500": isWishlistProduct,
            })}
          />
        </Button>
        {data.stock === 0 && (
          <span className="animate-pulse text-xs text-red-500">
            Este producto está agotado por el momento
          </span>
        )}
      </div>
      {showDescription && data?.description && (
        <>
          <Separator className="my-4" />
          <div className="flex flex-col items-start">
            <h3 className="font-serif font-semibold">
              Descripción del producto
            </h3>
            <RichTextDisplay content={data?.description} />
          </div>
        </>
      )}

      {data.isKit && data.kitComponents && (
        <>
          <Separator className="my-4" />
          <KitContents components={data.kitComponents} />
        </>
      )}
    </div>
  );
};
