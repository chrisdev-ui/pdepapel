"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, currencyFormatter } from "@/lib/utils";
import Image from "next/image";

// Define a type that matches what we get from getProducts
export interface ProductForItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  images: { url: string }[];
  category?: { name: string };
  discountedPrice?: number;
  hasDiscount?: boolean;
  offerLabel?: string | null;
  size?: { name: string };
  color?: { value: string; name: string };
  design?: { name: string };
  productGroup?: { name: string };
}

interface ProductSelectorProps {
  products: ProductForItem[];
  onSelect: (product: ProductForItem) => void;
  disabled?: boolean;
}

export function ProductSelector({
  products,
  onSelect,
  disabled,
}: ProductSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");

  const formattedProducts = React.useMemo(() => {
    return products.map((product) => ({
      ...product,
      label: `${product.name} - ${product.category?.name || ""} - ${currencyFormatter(product.discountedPrice || product.price)}`,
    }));
  }, [products]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          {value
            ? formattedProducts.find((product) => product.id === value)?.label
            : "Buscar producto..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar producto por nombre..." />
          <CommandList>
            <CommandEmpty>No se encontraron productos.</CommandEmpty>
            <CommandGroup>
              {formattedProducts.map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.label} // Search by label
                  onSelect={() => {
                    setValue(product.id === value ? "" : product.id);
                    onSelect(product);
                    setOpen(false);
                  }}
                >
                  <div className="flex w-full items-center gap-2">
                    <div className="relative h-8 w-8 overflow-hidden rounded-md border">
                      <Image
                        fill
                        src={product.images?.[0]?.url || "/placeholder.png"}
                        alt={product.name}
                        className="object-cover"
                      />
                    </div>
                    <div className="flex flex-1 flex-col">
                      <span className="font-medium">{product.name}</span>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span>{product.category?.name}</span>
                        {product.size && <span>• {product.size.name}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span
                        className={cn(
                          "font-medium",
                          product.hasDiscount && "text-green-600",
                        )}
                      >
                        {currencyFormatter(
                          product.discountedPrice || product.price,
                        )}
                      </span>
                      {product.hasDiscount && (
                        <span className="text-xs text-muted-foreground line-through">
                          {currencyFormatter(product.price)}
                        </span>
                      )}
                    </div>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        value === product.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
