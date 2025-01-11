"use client";

import { Expand, Heart, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MouseEventHandler, useEffect, useState } from "react";

import { Currency } from "@/components/ui/currency";
import { IconButton } from "@/components/ui/icon-button";
import { ProductCardBadge } from "@/components/ui/product-cart-badge";
import { StarRating } from "@/components/ui/star-rating";
import { useCart } from "@/hooks/use-cart";
import { usePreviewModal } from "@/hooks/use-preview-modal";
import { useWishlist } from "@/hooks/use-wishlist";
import { calculateAverageRating, cn } from "@/lib/utils";
import { Product } from "@/types";

interface ProductCardProps {
  product: Product;
  isNew?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isNew = false,
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
      className="group relative flex cursor-pointer flex-col justify-between space-y-4 rounded-xl border border-solid border-white-rock px-3 py-2.5 shadow-card [transition:0.2s_ease] hover:shadow-card-hover"
    >
      <div className="relative aspect-square rounded-xl bg-gray-100">
        <Image
          src={mainImage.url}
          alt={product.name ?? "Imagen principal del producto"}
          fill
          sizes="(max-width: 640px) 100vw, 640px"
          priority
          className="aspect-square rounded-md object-cover"
          unoptimized
        />
        <div className="absolute bottom-5 w-full px-6 opacity-0 transition group-hover:opacity-100">
          <div className="flex justify-center gap-x-6">
            <IconButton
              onClick={onAddToWishlist}
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
              className="hidden sm:flex"
              icon={<Expand className="h-5 w-5 text-gray-600" />}
            />
            <IconButton
              onClick={onAddToCart}
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
        <p className="font-serif text-sm text-gray-500">
          {product.category?.name}
        </p>
      </div>
      <StarRating
        currentRating={calculateAverageRating(product.reviews)}
        isDisabled
      />
      <div className="flex items-center justify-between">
        <Currency value={product.price} />
      </div>
      {product.stock === 0 && (
        <ProductCardBadge
          text="¡Agotado!"
          spanClasses="border-white bg-red-500 text-white outline-white"
        />
      )}
      {isNew && <ProductCardBadge text="¡Nuevo!" />}
    </div>
  );
};

export default ProductCard;
