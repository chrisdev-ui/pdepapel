"use client";

import { Wand2, X } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { currencyFormatter } from "@/lib/utils";
import { ProductForItem } from "./product-selector";
import { QuantitySelector } from "./quantity-selector";

interface AdminCartItemProps {
  item: ProductForItem & {
    quantity: number;
    notes?: string;
    productId?: string | null;
  };
  onRemove: () => void;
  onUpdateQuantity: (quantity: number) => void;
  onUpdateNotes?: (notes: string) => void;
  onConvert?: () => void;
}

export const AdminCartItem: React.FC<AdminCartItemProps> = ({
  item,
  onRemove,
  onUpdateQuantity,
  onUpdateNotes,
  onConvert,
}) => {
  const mainImage = item.images?.[0]?.url || "/placeholder.png";

  return (
    <div className="flex items-start border-b py-4">
      <div className="relative h-16 w-16 overflow-hidden rounded-md border sm:h-24 sm:w-24">
        <Image
          fill
          src={mainImage}
          alt={item.name}
          className="object-cover object-center"
        />
      </div>
      <div className="ml-4 flex flex-1 flex-col justify-between sm:ml-6">
        <div className="relative pr-9 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:pr-0">
          <div className="flex flex-col justify-between">
            <h3 className="text-sm font-medium text-black">{item.name}</h3>
            {item.productGroup && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.productGroup.name}
              </p>
            )}
          </div>

          <div className="mt-1 flex text-sm">
            <p className="text-gray-500">{item.category?.name}</p>
            {item.size && (
              <p className="ml-4 border-l border-gray-200 pl-4 text-gray-500">
                {item.size.name}
              </p>
            )}
            {item.color && (
              <p className="ml-4 border-l border-gray-200 pl-4 text-gray-500">
                {item.color.name}
              </p>
            )}
            {item.design && (
              <p className="ml-4 border-l border-gray-200 pl-4 text-gray-500">
                {item.design.name}
              </p>
            )}
          </div>

          <div className="mt-2 flex items-center gap-4">
            <QuantitySelector
              value={item.quantity}
              onChange={onUpdateQuantity}
              className="w-24"
              min={1}
            />
            <div className="flex flex-1 flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {currencyFormatter(item.discountedPrice || item.price)}
                </span>
                {item.discountedPrice && item.discountedPrice < item.price && (
                  <span className="text-xs text-muted-foreground line-through">
                    {currencyFormatter(item.price)}
                  </span>
                )}
              </div>
              {item.discountedPrice && item.discountedPrice < item.price && (
                <p className="text-xs text-green-600">
                  Ahorras{" "}
                  {currencyFormatter(
                    (item.price - item.discountedPrice) * item.quantity,
                  )}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Subtotal:{" "}
                {currencyFormatter(
                  (item.discountedPrice || item.price) * item.quantity,
                )}
              </p>
            </div>
          </div>

          {item.stock < 10 && (
            <p className="mt-2 text-xs text-red-500">
              ¡Solo quedan {item.stock} unidades!
            </p>
          )}
          {item.quantity > item.stock && (
            <p className="mt-2 text-xs font-bold text-red-600">
              Advertencia: La cantidad excede el stock disponible ({item.stock}
              ).
            </p>
          )}
        </div>

        <div className="absolute right-0 top-0 flex items-center gap-1">
          {!item.productId && onConvert && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onConvert}
              type="button"
              className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
              title="Convertir a Producto"
            >
              <Wand2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onRemove} type="button">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
