import { Currency } from "@/components/ui/currency";
import { IconButton } from "@/components/ui/icon-button";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { useCart } from "@/hooks/use-cart";
import { Product } from "@/types";
import { X } from "lucide-react";
import Image from "next/image";

interface CartItemProps {
  item: Product;
}

export const CartItem: React.FC<CartItemProps> = ({ item }) => {
  const cart = useCart();

  const onRemove = () => {
    cart.removeItem(item.id);
  };

  const onUpdateQuantity = (quantity: number) => {
    cart.updateQuantity(item.id, quantity);
  };

  return (
    <li className="flex border-b py-6">
      <div className="relative h-24 w-24 overflow-hidden rounded-md sm:h-48 sm:w-48">
        <Image
          fill
          src={item?.images[0]?.url}
          alt="Product Image"
          sizes="(max-width: 640px) 100vw, 640px"
          className="object-cover object-center"
        />
      </div>
      <div className="relative ml-4 flex flex-1 flex-col justify-between sm:ml-6">
        <div className="absolute right-0 top-0 z-10">
          <IconButton onClick={onRemove} icon={<X size={15} />} />
        </div>
        <div className="relative pr-9 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:pr-0">
          <div className="flex justify-between">
            <p className="font-serif text-lg font-semibold">{item.name}</p>
          </div>

          <div className="mb-3 mt-1 flex flex-wrap text-sm text-gray-500 lg:mb-0">
            <p>{item.color.name}</p>
            <p className="ml-4 border-l border-gray-200 pl-4">
              {item.size.name}
            </p>
            <p className="ml-4 border-l border-gray-200 pl-4">
              {item.design.name}
            </p>
          </div>
          <div className="flex w-fit flex-col space-y-2">
            <QuantitySelector
              max={item.stock}
              initialValue={item?.quantity ?? 1}
              onValueChange={onUpdateQuantity}
            />
            <Currency value={item.price} />
          </div>
        </div>
      </div>
    </li>
  );
};
