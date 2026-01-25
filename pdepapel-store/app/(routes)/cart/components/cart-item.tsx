import { X } from "lucide-react";
import Link from "next/link";

import { CldImage } from "@/components/ui/CldImage";
import { Currency } from "@/components/ui/currency";
import { IconButton } from "@/components/ui/icon-button";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { useCart } from "@/hooks/use-cart";
import { Product } from "@/types";

import { currencyFormatter } from "@/lib/utils";

interface CartItemProps {
  item: Product;
}

export const CartItem: React.FC<CartItemProps> = ({ item }) => {
  const cart = useCart();

  const mainImage =
    item?.images.find((image) => image.isMain) ?? item?.images[0];

  const onRemove = () => {
    cart.removeItem(item.id);
  };

  const onUpdateQuantity = (quantity: number) => {
    cart.updateQuantity(item.id, quantity);
  };

  return (
    <li className="flex border-b py-6">
      <div className="relative h-24 w-24 overflow-hidden rounded-md sm:h-48 sm:w-48">
        <Link href={`/product/${item.id}`}>
          <CldImage
            fill
            src={mainImage.url}
            alt={item?.name ?? "Imagen del producto"}
            sizes="(max-width: 640px) 100vw, 640px"
            className="object-cover object-center"
            priority
          />
        </Link>
      </div>
      <div className="relative ml-4 flex flex-1 flex-col justify-between sm:ml-6">
        <div className="absolute right-0 top-0 z-10">
          <IconButton onClick={onRemove} icon={<X size={15} />} />
        </div>
        <div className="relative pr-9 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:pr-0">
          <div className="flex justify-between">
            <Link href={`/product/${item.id}`}>
              <p className="font-serif text-lg font-semibold hover:underline">
                {item.name}
              </p>
            </Link>
          </div>

          <div className="mb-3 mt-1 flex flex-wrap text-sm text-gray-500 lg:mb-0">
            {item.color && <p>Color: {item.color.name}</p>}
            {item.size && (
              <p className="ml-4 border-l border-gray-200 pl-4">
                Talla: {item.size.name}
              </p>
            )}
            {item.design && (
              <p className="ml-4 border-l border-gray-200 pl-4">
                Diseño: {item.design.name}
              </p>
            )}
          </div>
          <div className="flex w-fit flex-col space-y-2">
            <QuantitySelector
              max={item.stock}
              initialValue={item?.quantity ?? 1}
              onValueChange={onUpdateQuantity}
            />
            {item.hasDiscount ||
            (item.originalPrice && item.originalPrice > Number(item.price)) ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Currency value={item.price} />
                  <Currency
                    value={item.originalPrice}
                    className="text-sm text-gray-500 line-through"
                  />
                </div>
                <span className="font-serif text-xs text-success">
                  Ahorra{" "}
                  {currencyFormatter.format(
                    (Number(item.originalPrice) - Number(item.price)) *
                      Number(item.quantity ?? 1),
                  )}
                </span>
                {item.offerLabel && (
                  <span className="inline-block animate-bounce rounded bg-pink-froly px-2 py-0.5 text-xs font-semibold uppercase text-white">
                    {item.offerLabel}
                  </span>
                )}
              </div>
            ) : (
              <Currency value={item.price} />
            )}
          </div>
        </div>
      </div>
    </li>
  );
};
