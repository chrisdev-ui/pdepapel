"use client";

import { useDebounce } from "@/hooks/use-debounce";
import axios from "axios";
import { ChevronsUpDown, Loader2, Minus, Plus, Search } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import * as React from "react";
import { useCallback } from "react";
import useSWRInfinite from "swr/infinite";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn, currencyFormatter } from "@/lib/utils";

export interface ProductForItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  images: { url: string }[];
  category?: { name: string };
  size?: { name: string };
  color?: { name: string; value: string };
  discountedPrice?: number;
  hasDiscount?: boolean;
  sku?: string;
  productGroup?: { name: string };
  design?: string | { name: string };
}

interface EnhancedProductSelectorProps {
  selectedItems: Record<string, number>; // Map productId -> quantity
  onUpdate: (
    productId: string,
    quantity: number,
    product?: ProductForItem,
  ) => void;
  disabled?: boolean;
}

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export function EnhancedProductSelector({
  selectedItems,
  onUpdate,
  disabled,
  selectedProductsList = [], // New prop for "Selected First"
  onClearSelection, // New prop for "Unselect All"
}: EnhancedProductSelectorProps & {
  selectedProductsList?: ProductForItem[];
  onClearSelection?: () => void;
}) {
  const params = useParams();
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Infinite Scroll Logic
  const getKey = (pageIndex: number, previousPageData: any) => {
    if (!open) return null; // Don't fetch if closed
    if (previousPageData && !previousPageData.products?.length) return null; // reached the end
    // Page is 1-based in API
    return `/api/${params.storeId}/products?search=${debouncedSearch}&limit=20&isArchived=false&page=${pageIndex + 1}&fromShop=true`;
  };

  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false,
      persistSize: false,
    },
  );

  const productsData = React.useMemo(() => {
    return data ? data.flatMap((page) => page.products) : [];
  }, [data]);
  const isEmpty = data?.[0]?.products?.length === 0;
  const isReachingEnd =
    isEmpty || (data && data[data.length - 1]?.products?.length < 20);

  // Combine Selected + API Results (Deduplicated)
  // We prioritize selectedProductsList at the top.
  // Then we append API results that are NOT in the selected list.
  const displayProducts = React.useMemo(() => {
    const selectedIds = new Set(selectedProductsList.map((p) => p.id));
    const apiProducts = productsData.filter((p) => !selectedIds.has(p.id));
    return [...selectedProductsList, ...apiProducts];
  }, [selectedProductsList, productsData]);

  // Load More Handler (Infinite Scroll via Scroll Event)
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (
        scrollTop + clientHeight >= scrollHeight - 200 && // Load when near bottom
        !isReachingEnd &&
        !isValidating
      ) {
        setSize(size + 1);
      }
    }
  }, [isReachingEnd, isValidating, setSize, size]);

  const handleIncrement = (product: ProductForItem) => {
    const currentQty = selectedItems[product.id] || 0;
    onUpdate(product.id, currentQty + 1, product);
  };

  const handleDecrement = (product: ProductForItem) => {
    const currentQty = selectedItems[product.id] || 0;
    if (currentQty > 0) {
      onUpdate(product.id, currentQty - 1, product);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          <span>
            {Object.keys(selectedItems).length > 0
              ? `${Object.keys(selectedItems).length} productos seleccionados`
              : "Buscar productos..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DialogTrigger>
      {/* Maximized Dialog */}
      <DialogContent className="max-w-[95vw] gap-0 p-0 lg:max-w-7xl">
        <DialogTitle className="sr-only">Buscar productos</DialogTitle>
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              className="flex h-12 w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground"
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          {/* Unselect All Button */}
          {Object.keys(selectedItems).length > 0 && onClearSelection && (
            <Button
              variant="ghost"
              onClick={onClearSelection}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Limpiar selección
            </Button>
          )}
        </div>

        <div
          className="max-h-[80vh] overflow-y-auto p-6"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {isLoading && productsData.length === 0 && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && displayProducts.length === 0 && (
            <div className="flex h-60 flex-col items-center justify-center text-muted-foreground">
              <Search className="mb-4 h-12 w-12 opacity-20" />
              <p className="text-lg">No se encontraron productos.</p>
            </div>
          )}

          {/* Grid Layout: Max 4 columns */}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4">
            {displayProducts.map((product) => {
              const quantity = selectedItems[product.id] || 0;
              const isSelected = quantity > 0;

              return (
                <div
                  key={product.id}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:shadow-lg",
                    isSelected && "ring-2 ring-primary ring-offset-2",
                  )}
                >
                  {/* Image Area */}
                  <div className="relative aspect-square w-full overflow-hidden bg-muted">
                    <Image
                      fill
                      src={product.images?.[0]?.url || "/placeholder.png"}
                      alt={product.name}
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {product.hasDiscount && (
                      <Badge
                        variant="destructive"
                        className="absolute right-2 top-2 shadow-sm"
                      >
                        Oferta
                      </Badge>
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
                    )}
                  </div>

                  {/* Content Area */}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-2">
                      <h3 className="line-clamp-2 text-base font-semibold leading-snug">
                        {product.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {product.category?.name && (
                          <span>{product.category.name}</span>
                        )}
                        {product.category?.name && product.design && (
                          <span>•</span>
                        )}

                        {product.design && (
                          <span>
                            {typeof product.design === "string"
                              ? product.design
                              : product.design?.name}
                          </span>
                        )}

                        {(product.design || product.category?.name) &&
                          product.color && <span>•</span>}

                        {product.color && product.color.value && (
                          <div
                            className="flex items-center gap-1"
                            title={product.color.name}
                          >
                            <div
                              className="h-3 w-3 rounded-full border shadow-sm"
                              style={{ backgroundColor: product.color.value }}
                            />
                            <span>{product.color.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto pt-2">
                      <div className="mb-3 flex flex-wrap items-baseline gap-2">
                        <span className="text-lg font-bold">
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

                      {/* Controls */}
                      {quantity === 0 ? (
                        <Button
                          className="w-full"
                          variant="secondary"
                          onClick={() => handleIncrement(product)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Agregar
                        </Button>
                      ) : (
                        <div className="flex items-center justify-between rounded-md border bg-background p-1 shadow-sm">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-sm hover:bg-muted"
                            onClick={() => handleDecrement(product)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="font-bold text-primary">
                            {quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-sm hover:bg-muted"
                            onClick={() => handleIncrement(product)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Loading More Spinner */}
          {(isValidating || isLoading) && productsData.length > 0 && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
