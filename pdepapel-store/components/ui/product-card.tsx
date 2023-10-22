"use client";

import { Expand, ShoppingCart } from "lucide-react";
import Image from "next/image";

import { Currency } from "@/components/ui/currency";
import { IconButton } from "@/components/ui/icon-button";
import { NewBadge } from "@/components/ui/new-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Product } from "@/types";

interface ProductCardProps {
  product: Product;
  isNew?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isNew = false,
}) => {
  return (
    <div className="group relative cursor-pointer space-y-4 rounded-xl border border-solid border-white-rock px-3 py-2.5 shadow-card [transition:0.2s_ease] hover:shadow-card-hover">
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
              onClick={() => {}}
              icon={<Expand className="h-5 w-5 text-gray-600" />}
            />
            <IconButton
              onClick={() => {}}
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
