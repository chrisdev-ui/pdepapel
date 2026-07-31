"use client";

import { Expand, Heart, ShoppingCart } from "lucide-react";
import { track } from "@vercel/analytics/react";
import Link from "next/link";
import { MouseEventHandler, useEffect, useState } from "react";

import { CldImage } from "@/components/ui/CldImage";
import { Currency } from "@/components/ui/currency";
import { GroupBadge } from "@/components/ui/group-badge";
import { IconButton } from "@/components/ui/icon-button";
import { OfferBadge } from "@/components/ui/offer-badge";
import { ProductCardBadge } from "@/components/ui/product-cart-badge";
import { StarRating } from "@/components/ui/star-rating";
import { useCart } from "@/hooks/use-cart";
import { usePreviewModal } from "@/hooks/use-preview-modal";
import { useWishlist } from "@/hooks/use-wishlist";
import { productPath } from "@/lib/routes";
import { calculateAverageRating, cn } from "@/lib/utils";
import { Product } from "@/types";

interface ProductCardProps {
  product: Product;
  isNew?: boolean;
  priority?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isNew = false,
  priority = false,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const previewModal = usePreviewModal();
  const cart = useCart();
  const wishlist = useWishlist();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const mainImage =
    product?.images.find((image) => image.isMain) ?? product?.images[0];

  const onPreview: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();

    previewModal.onOpen(product);
  };

  const onAddToCart: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();

    if (product.isGroup) {
      previewModal.onOpen(product);
      return;
    }

    cart.addItem(product);
    track("add_to_cart", {
      source: "product_card",
      product_slug: product.slug || product.id,
      quantity: 1,
    });
  };

  const onAddToWishlist: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();

    if (product.isGroup) {
      previewModal.onOpen(product);
      return;
    }

    wishlist.addItem(product);
  };

  const isWishlistProduct =
    isMounted && wishlist.items.some((item) => item.id === product.id);

  const isCartProduct =
    isMounted && cart.items.some((item) => item.id === product.id);

  /**
   * Smart Badge Priority Hierarchy:
   * 1. Out of Stock (Critical) - User cannot purchase
   * 2. Offer (Promotion) - High incentive to purchase
   * 3. Group (Information) - Indicates product has variants
   * 4. New (Marketing) - "New" arrival
   */
  const renderBadge = () => {
    // 1. Out of Stock
    if (product.stock === 0) {
      return (
        <ProductCardBadge
          text="¡Agotado!"
          spanClasses="border-white bg-red-500 text-white outline-white"
        />
      );
    }

    // 2. Offer
    if (product.offerLabel) {
      return <OfferBadge text={product.offerLabel} />;
    }

    // 3. Group
    if (product.isGroup) {
      return <GroupBadge optionsCount={product.variantCount ?? 0} />;
    }

    // 4. New
    if (isNew) {
      return <ProductCardBadge text="¡Nuevo!" />;
    }

    return null;
  };

  return (
    <article className="group relative flex flex-col justify-between rounded-xl border border-solid border-blue-baby px-3 py-2.5 shadow-card [transition:0.2s_ease] hover:shadow-card-hover">
      <Link
        href={productPath(product.slug || product.id)}
        aria-label={`Ver ${product.name}`}
        className="flex flex-1 flex-col space-y-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
        onClick={() =>
          track("select_item", {
            product_slug: product.slug || product.id,
            is_group: Boolean(product.isGroup),
          })
        }
      >
        <div className="relative block aspect-square overflow-hidden rounded-xl bg-gray-100">
          {mainImage?.url ? (
            <CldImage
              src={mainImage.url}
              alt={product.name ?? "Imagen principal del producto"}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={priority}
              className="object-cover"
              format="auto"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
              <span className="text-sm">Sin imagen</span>
            </div>
          )}
        </div>
        <div>
          <p className="font-sans text-lg font-semibold">{product.name}</p>
          <p className="text-sm text-gray-500">{product.category?.name}</p>
        </div>
        <StarRating
          currentRating={calculateAverageRating(product.reviews)}
          isDisabled
        />
        <div className="flex flex-col gap-1 font-sans">
          {product.minPrice &&
          product.maxPrice &&
          product.minPrice !== product.maxPrice ? (
            <div className="flex flex-col items-start">
              <span className="text-xs text-gray-500">Desde</span>
              <Currency value={product.minPrice} />
            </div>
          ) : product.isGroup ? (
            product.minPrice &&
            product.maxPrice &&
            product.minPrice === product.maxPrice ? (
              product.originalPrice &&
              product.minPrice < product.originalPrice ? (
                <>
                  <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <Currency value={product.minPrice} className="text-2xl" />
                    <Currency
                      value={product.originalPrice}
                      className="text-sm text-gray-500 line-through"
                    />
                  </div>
                  <span className="font-quicksand text-xs font-semibold text-green-600">
                    Ahorra{" "}
                    {new Intl.NumberFormat("es-CO", {
                      style: "currency",
                      currency: "COP",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(product.originalPrice - product.minPrice)}{" "}
                    (
                    {Math.round(
                      ((product.originalPrice - product.minPrice) /
                        product.originalPrice) *
                        100,
                    )}
                    %)
                  </span>
                </>
              ) : (
                <Currency value={product.minPrice} />
              )
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-gray-500">Desde</span>
                <Currency value={product.minPrice ?? product.price} />
              </div>
            )
          ) : product.hasDiscount ||
            (product.originalPrice &&
              product.originalPrice > Number(product.price)) ? (
            <>
              <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                <Currency value={product.price} className="text-2xl" />
                <Currency
                  value={product.originalPrice}
                  className="text-sm text-gray-500 line-through"
                />
              </div>
              <span className="font-quicksand text-xs font-semibold text-green-600">
                Ahorra{" "}
                {new Intl.NumberFormat("es-CO", {
                  style: "currency",
                  currency: "COP",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(
                  Number(product.originalPrice) - Number(product.price),
                )}{" "}
                (
                {Math.round(
                  ((Number(product.originalPrice) - Number(product.price)) /
                    Number(product.originalPrice)) *
                    100,
                )}
                %)
              </span>
            </>
          ) : (
            <Currency value={product.price} />
          )}
        </div>
        {renderBadge()}
      </Link>
      <div className="pointer-events-none absolute inset-x-3 top-2.5 aspect-square">
        <div className="pointer-events-auto absolute bottom-5 w-full px-6 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
          <div className="flex justify-center gap-x-6">
            <IconButton
              onClick={onAddToWishlist}
              ariaLabel="Agregar a la lista de deseos"
              icon={
                <Heart
                  className={cn("h-5 w-5 text-gray-600", {
                    "text-red-400": isWishlistProduct,
                  })}
                  fill={isWishlistProduct ? "#f87171" : "none"}
                />
              }
            />
            <IconButton
              onClick={onPreview}
              ariaLabel="Vista previa del producto"
              className="hidden sm:flex"
              icon={<Expand className="h-5 w-5 text-gray-600" />}
            />
            <IconButton
              onClick={onAddToCart}
              ariaLabel="Agregar al carrito"
              className="disabled:pointer-events-none disabled:opacity-50"
              isDisabled={product.stock === 0 || Boolean(product.isArchived)}
              icon={
                <ShoppingCart
                  className={cn("h-5 w-5 text-gray-600", {
                    "text-pink-froly": isCartProduct,
                  })}
                />
              }
            />
          </div>
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
