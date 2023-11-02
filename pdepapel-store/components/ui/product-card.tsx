"use client";

import { Expand, Heart, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MouseEventHandler } from "react";

import { Currency } from "@/components/ui/currency";
import { IconButton } from "@/components/ui/icon-button";
import { NewBadge } from "@/components/ui/new-badge";
import { StarRating } from "@/components/ui/star-rating";
import { useCart } from "@/hooks/use-cart";
import { usePreviewModal } from "@/hooks/use-preview-modal";
import { useWishlist } from "@/hooks/use-wishlist";
import { Product } from "@/types";

interface ProductCardProps {
  product: Product;
  isNew?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isNew = false,
}) => {
  const router = useRouter();
  const previewModal = usePreviewModal();
  const cart = useCart();
  const wishlist = useWishlist();

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

  return (
    <div
      onClick={handleClick}
      className="group relative flex cursor-pointer flex-col justify-between space-y-4 rounded-xl border border-solid border-white-rock px-3 py-2.5 shadow-card [transition:0.2s_ease] hover:shadow-card-hover"
    >
      <div className="relative aspect-square rounded-xl bg-gray-100">
        <Image
          src={product?.images?.[0].url}
          alt="Product Image"
          fill
          sizes="(max-width: 640px) 100vw, 640px"
          priority
          className="aspect-square rounded-md object-cover"
        />
        <div className="absolute bottom-5 w-full px-6 opacity-0 transition group-hover:opacity-100">
          <div className="flex justify-center gap-x-6">
            <IconButton
              onClick={onAddToWishlist}
              icon={<Heart className="h-5 w-5 text-gray-600" />}
            />
            <IconButton
              onClick={onPreview}
              icon={<Expand className="h-5 w-5 text-gray-600" />}
            />
            <IconButton
              onClick={onAddToCart}
              icon={<ShoppingCart className="h-5 w-5 text-gray-600" />}
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
      <StarRating isDisabled />
      <div className="flex items-center justify-between">
        <Currency value={product.price} />
      </div>
      {isNew && <NewBadge text="¡Nuevo!" />}
    </div>
  );
};
