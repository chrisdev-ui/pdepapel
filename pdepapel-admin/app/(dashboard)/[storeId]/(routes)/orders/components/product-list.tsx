"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Image from "next/image";
import { useEffect, useState } from "react";

interface ProductListProps {
  products: {
    id: string;
    name: string;
    quantity: number;
    image: string;
  }[];
}

export const ProductList: React.FC<ProductListProps> = ({ products }) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline">Ver productos</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col space-y-2">
          {products.map((product) => (
            <div
              key={product.id}
              className="hover:bg-blue-baby/50 flex items-center gap-x-2 rounded p-1"
            >
              <Image
                src={product.image}
                alt={product.name}
                width={40}
                height={40}
                className="rounded-md"
                unoptimized
              />
              <span className="text-xs">{product.name}</span>
              <span className="ml-auto text-xs font-semibold">{`x${product.quantity}`}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
