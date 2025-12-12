"use client";

import { Expand, Heart, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { MouseEventHandler, useEffect, useState } from "react";

import { CldImage } from "@/components/ui/CldImage";
import { Currency } from "@/components/ui/currency";
import { IconButton } from "@/components/ui/icon-button";
import { ProductCardBadge } from "@/components/ui/product-cart-badge";
import { StarRating } from "@/components/ui/star-rating";
import { useCart } from "@/hooks/use-cart";
import { usePreviewModal } from "@/hooks/use-preview-modal";
import { useWishlist } from "@/hooks/use-wishlist";
import { calculateAverageRating, cn } from "@/lib/utils";
import { Product } from "@/types";
import { OfferBadge } from "./offer-badge";

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
  const router = useRouter();
  const previewModal = usePreviewModal();
  const cart = useCart();
  const wishlist = useWishlist();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const mainImage =
    product?.images.find((image) => image.isMain) ?? product?.images[0];

  const handleClick = () => {
    router.push(`/product/${product.id}`);
  };

  const onPreview: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();

    previewModal.onOpen(product);
  };

  const onAddToCart: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();

    cart.addItem(product);
  };

  const onAddToWishlist: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();

    wishlist.addItem(product);
  };

  const isWishlistProduct = wishlist.items.some(
    (item) => item.id === product.id,
  );

  const isCartProduct = cart.items.some((item) => item.id === product.id);

  return (
    <div
      onClick={handleClick}
      className="group relative flex cursor-pointer flex-col justify-between space-y-4 rounded-xl border border-solid border-blue-baby px-3 py-2.5 shadow-card [transition:0.2s_ease] hover:shadow-card-hover"
    >
      <div className="relative aspect-square rounded-xl bg-gray-100">
        <CldImage
          src={mainImage.url}
          alt={product.name ?? "Imagen principal del producto"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          priority={priority}
          className="aspect-square rounded-md object-cover"
          format="auto"
        />
        <div className="absolute bottom-5 w-full px-6 opacity-0 transition group-hover:opacity-100">
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
              isDisabled={product.stock === 0}
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
      <div>
        <p className="font-serif text-lg font-semibold">{product.name}</p>
        <p className="text-sm text-gray-500">{product.category?.name}</p>
      </div>
      <StarRating
        currentRating={calculateAverageRating(product.reviews)}
        isDisabled
      />
      <div className="flex flex-col gap-1 font-serif">
        {product.discountedPrice &&
        product.discountedPrice < Number(product.price) ? (
          <>
            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
              <Currency value={product.discountedPrice} className="text-2xl" />
              <Currency
                value={product.price}
                className="text-sm text-gray-500 line-through"
              />
            </div>
            <span className="text-xs text-green-600">
              Ahorra{" "}
              {new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(Number(product.price) - product.discountedPrice)}{" "}
              (
              {Math.round(
                ((Number(product.price) - product.discountedPrice) /
                  Number(product.price)) *
                  100,
              )}
              %)
            </span>
          </>
        ) : (
          <Currency value={product.price} />
        )}
      </div>
      {/* Smart Badge Priority: Out of Stock > Offer > New */}
      {product.stock === 0 ? (
        <ProductCardBadge
          text="¡Agotado!"
          spanClasses="border-white bg-red-500 text-white outline-white"
        />
      ) : product.offerLabel ? (
        <OfferBadge text={product.offerLabel} />
      ) : isNew ? (
        <ProductCardBadge text="¡Nuevo!" />
      ) : null}
    </div>
  );
};

export default ProductCard;
