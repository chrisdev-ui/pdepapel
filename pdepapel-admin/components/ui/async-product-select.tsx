import { Check, ChevronsUpDown, Package } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import * as React from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
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
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import axios from "axios";

export interface AsyncProductSelectProps {
  value?: string;
  onChange: (value: string, product?: any) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  modal?: boolean;
}

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export function AsyncProductSelect({
  value,
  onChange,
  disabled,
  placeholder = "Seleccionar producto...",
  className,
  modal = false,
}: AsyncProductSelectProps) {
  const params = useParams();
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const observerTarget = React.useRef<HTMLDivElement>(null);

  // Local state to cache the selected product object for instant display
  // This avoids waiting for SWR or search results to resolve the selected item
  const [cachedSelectedProduct, setCachedSelectedProduct] =
    React.useState<any>(null);

  // Define getKey for useSWRInfinite
  const getKey = (pageIndex: number, previousPageData: any) => {
    // If not open, don't fetch (optional optimization)
    if (!open) return null;

    // If reached end
    if (previousPageData && !previousPageData.metadata.hasMore) return null;

    return `/api/${params.storeId}/products/search?q=${debouncedQuery}&page=${
      pageIndex + 1
    }&limit=20`;
  };

  const { data, size, setSize, isValidating, isLoading } = useSWRInfinite(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false,
    },
  );

  // Flatten pages
  const products = data ? data.flatMap((page) => page.data) : [];

  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const isEmpty = data?.[0]?.data?.length === 0;
  const isReachingEnd =
    isEmpty || (data && data[data.length - 1]?.metadata?.hasMore === false);

  // Reset page when query changes
  React.useEffect(() => {
    setSize(1);
  }, [debouncedQuery, setSize]);

  // Infinite Scroll Observer
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isReachingEnd && !isLoadingMore) {
          setSize((prev) => prev + 1);
        }
      },
      { threshold: 0.1 },
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [isReachingEnd, isLoadingMore, setSize, open]);

  // Fetch selected product detail if strictly needed (e.g. initial load without search)
  // Check if selected product is already in the loaded list
  const selectedInList = products.find((p: any) => p.id === value);

  // If we have a cached product that matches the current value, use it to avoid fetching
  const shouldUseCache =
    cachedSelectedProduct && cachedSelectedProduct.id === value;

  const { data: selectedProductDetail } = useSWR(
    value && !selectedInList && !shouldUseCache
      ? `/api/${params.storeId}/products/${value}`
      : null,
    fetcher,
  );

  const selectedProduct =
    (shouldUseCache ? cachedSelectedProduct : null) ||
    selectedInList ||
    selectedProductDetail;

  const handleSelect = (currentValue: string) => {
    const product = products.find((p: any) => p.id === currentValue);
    // If selecting the already selected one which might be from detail fetch
    const finalProduct =
      product || (currentValue === value ? selectedProduct : null);

    setCachedSelectedProduct(finalProduct); // Cache immediately
    onChange(currentValue, finalProduct);
    setOpen(false);
  };

  const getProductImage = (product: any) => {
    if (product.images && product.images.length > 0) {
      return product.images[0].url;
    }
    return null;
  };

  if (modal) {
    return (
      <>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen(true)}
          type="button"
          className={cn("h-auto w-full justify-between py-2", className)}
        >
          {selectedProduct ? (
            <div className="flex items-center gap-2 text-left">
              <div className="min-w-8 relative h-8 w-8 overflow-hidden rounded-md border">
                {getProductImage(selectedProduct) ? (
                  <Image
                    src={getProductImage(selectedProduct)}
                    alt={selectedProduct.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-medium leading-none">
                  {selectedProduct.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {selectedProduct.sku ? `SKU: ${selectedProduct.sku}` : "N/A"}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
        <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre o SKU..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[300px] w-full overflow-y-auto">
            {!isLoading && products.length === 0 && (
              <CommandEmpty>No se encontraron productos.</CommandEmpty>
            )}

            <CommandGroup>
              {products.map((product: any) => (
                <CommandItem
                  key={product.id}
                  value={product.id}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === product.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex w-full items-center gap-2 overflow-hidden">
                    <div className="min-w-8 relative h-8 w-8 shrink-0 overflow-hidden rounded-md border">
                      {getProductImage(product) ? (
                        <Image
                          src={getProductImage(product)}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium">
                        {product.name}
                        {product.isArchived && (
                          <span className="ml-2 text-xs text-red-500">
                            (Archivado)
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        SKU: {product.sku || "N/A"} | Stock: {product.stock}
                      </span>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>

            {/* Loading / Observer Target */}
            {!isReachingEnd && (
              <div
                ref={observerTarget}
                className="p-4 text-center text-xs text-muted-foreground"
              >
                {isLoadingMore ? "Cargando más..." : "Cargar más"}
              </div>
            )}
          </CommandList>
        </CommandDialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          type="button"
          className={cn("h-auto w-full justify-between py-2", className)}
        >
          {selectedProduct ? (
            <div className="flex items-center gap-2 text-left">
              <div className="min-w-8 relative h-8 w-8 overflow-hidden rounded-md border">
                {getProductImage(selectedProduct) ? (
                  <Image
                    src={getProductImage(selectedProduct)}
                    alt={selectedProduct.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-medium leading-none">
                  {selectedProduct.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {selectedProduct.sku ? `SKU: ${selectedProduct.sku}` : "N/A"}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre o SKU..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[300px] overflow-y-auto">
            {!isLoading && products.length === 0 && (
              <CommandEmpty>No se encontraron productos.</CommandEmpty>
            )}

            <CommandGroup>
              {products.map((product: any) => (
                <CommandItem
                  key={product.id}
                  value={product.id}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === product.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="min-w-8 relative h-8 w-8 overflow-hidden rounded-md border">
                      {getProductImage(product) ? (
                        <Image
                          src={getProductImage(product)}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="truncate font-medium">
                        {product.name}
                        {product.isArchived && (
                          <span className="ml-2 text-xs text-red-500">
                            (Archivado)
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        SKU: {product.sku || "N/A"} | Stock: {product.stock}
                      </span>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>

            {/* Loading / Observer Target */}
            {!isReachingEnd && (
              <div
                ref={observerTarget}
                className="p-4 text-center text-xs text-muted-foreground"
              >
                {isLoadingMore ? "Cargando más..." : "Cargar más"}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
