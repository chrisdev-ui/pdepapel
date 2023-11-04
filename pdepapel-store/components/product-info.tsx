import { ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { Separator } from "@/components/ui/separator";
import { StarRating } from "@/components/ui/star-rating";
import { useCart } from "@/hooks/use-cart";
import { calculateAverageRating } from "@/lib/utils";
import { Product } from "@/types";
import { useRouter } from "next/navigation";
import { RefObject, useState } from "react";

interface ProductInfoProps {
  data: Product;
  showDescription?: boolean;
  onAddedToCart?: () => void;
  showReviews?: boolean;
  reviewsRef?: RefObject<HTMLDivElement>;
}

export const ProductInfo: React.FC<ProductInfoProps> = ({
  data,
  showDescription = true,
  onAddedToCart,
  showReviews = true,
  reviewsRef,
}) => {
  const [quantity, setQuantity] = useState<number>();
  const cart = useCart();
  const router = useRouter();

  const goToReviews = () => {
    reviewsRef?.current?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const productInCart = cart.items.find((item) => item.id === data.id);

  const handleAddToCart = () => {
    if (productInCart) {
      cart.updateQuantity(data.id, quantity ?? 1);
    } else {
      cart.addItem(data, quantity);
    }
    router.push("/cart");
    onAddedToCart?.();
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{data?.name}</h1>
      <div className="mt-3 flex items-end justify-between">
        <div className="text-2xl">
          <Currency value={data?.price} />
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
        <div className="flex items-center gap-x-4">
          <h3 className="font-serif font-semibold">Tamaño:</h3>
          <div>{data?.size?.name}</div>
        </div>
        <div className="flex items-center gap-x-4">
          <h3 className="font-serif font-semibold">Color:</h3>
          <div
            className="h-6 w-6 rounded-full border border-gray-600"
            style={{
              backgroundColor: data?.color?.value,
            }}
          />
        </div>
        <div className="flex items-center gap-x-4">
          <h3 className="font-serif font-semibold">Diseño:</h3>
          <div>{data?.design?.name}</div>
        </div>
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
          disabled={data.stock === 0}
          className="flex gap-2 rounded-full border-none bg-blue-yankees px-8 py-4 font-serif text-sm font-semibold text-white outline-none [transition:0.2s]"
          onClick={handleAddToCart}
        >
          Agregar al carrito
          <ShoppingCart className="h-5 w-5" />
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
            <p className="mt-2 text-sm text-gray-500">{data?.description}</p>
          </div>
        </>
      )}
    </div>
  );
};
