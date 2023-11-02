import { ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { Separator } from "@/components/ui/separator";
import { StarRating } from "@/components/ui/star-rating";
import { Product } from "@/types";

interface InfoProps {
  data: Product;
  showDescription?: boolean;
}

export const Info: React.FC<InfoProps> = ({ data, showDescription = true }) => {
  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{data?.name}</h1>
      <div className="mt-3 flex items-end justify-between">
        <p className="text-2xl">
          <Currency value={data?.price} />
        </p>
        <StarRating isDisabled />
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
      </div>
      <div className="mt-10 flex items-center gap-x-3">
        <Button className="flex gap-2 rounded-full border-none bg-blue-yankees px-8 py-4 font-serif text-sm font-semibold text-white outline-none [transition:0.2s]">
          Agregar al carrito
          <ShoppingCart className="h-5 w-5" />
        </Button>
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
